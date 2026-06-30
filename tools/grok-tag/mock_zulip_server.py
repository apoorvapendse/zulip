"""Minimal Zulip-like HTTP API + HTML transcript for local e2e / browser proof.

Run: python3 mock_zulip_server.py --port 9991
Bot credentials: bot@zulip.local / bot-api-key
Human posts via POST /_test/post or the HTML form.
"""

from __future__ import annotations

import argparse
import base64
import json
import threading
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from typing import Any
from urllib.parse import parse_qs, urlsplit


class State:
    def __init__(self) -> None:
        self.lock = threading.Lock()
        self.next_id = 1
        self.messages: list[dict[str, Any]] = []
        self.queues: dict[str, dict[str, Any]] = {}
        self.bot = {
            "user_id": 99,
            "full_name": "Grok Bot",
            "email": "bot@zulip.local",
        }
        self.human = {
            "user_id": 1,
            "full_name": "Alice",
            "email": "alice@zulip.local",
        }
        self.stream = "engineering"
        self.stream_id = 7
        self.reactions: dict[int, list[str]] = {}

    def add_message(
        self,
        *,
        content: str,
        sender: dict[str, Any],
        topic: str = "auth-plan",
        mentioned_user_ids: list[int] | None = None,
    ) -> dict[str, Any]:
        with self.lock:
            mid = self.next_id
            self.next_id += 1
            msg = {
                "id": mid,
                "type": "stream",
                "display_recipient": self.stream,
                "stream_id": self.stream_id,
                "subject": topic,
                "content": content,
                "sender_id": sender["user_id"],
                "sender_full_name": sender["full_name"],
                "sender_email": sender["email"],
                "timestamp": time.time(),
                "mentioned_user_ids": mentioned_user_ids or [],
            }
            self.messages.append(msg)
            # Push to event queues
            for q in self.queues.values():
                q["events"].append({"id": q["next_event_id"], "type": "message", "message": msg})
                q["next_event_id"] += 1
            return msg


STATE = State()


def check_auth(handler: BaseHTTPRequestHandler) -> bool:
    auth = handler.headers.get("Authorization") or ""
    if not auth.startswith("Basic "):
        return False
    try:
        raw = base64.b64decode(auth.split(" ", 1)[1]).decode()
        email, key = raw.split(":", 1)
    except Exception:
        return False
    return email == "bot@zulip.local" and key == "bot-api-key"


class Handler(BaseHTTPRequestHandler):
    def log_message(self, fmt: str, *args: Any) -> None:
        print("[mock-zulip]", fmt % args)

    def _json(self, code: int, payload: dict[str, Any]) -> None:
        body = json.dumps(payload).encode()
        self.send_response(code)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def _html(self, code: int, html: str) -> None:
        body = html.encode()
        self.send_response(code)
        self.send_header("Content-Type", "text/html; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def _read_form(self) -> dict[str, str]:
        length = int(self.headers.get("Content-Length") or 0)
        raw = self.rfile.read(length).decode() if length else ""
        parsed = parse_qs(raw, keep_blank_values=True)
        # Zulip encodes JSON fields as strings
        out: dict[str, str] = {}
        for k, v in parsed.items():
            out[k] = v[0] if v else ""
        return out

    def do_GET(self) -> None:
        parsed = urlsplit(self.path)
        path = parsed.path
        qs = parse_qs(parsed.query)

        if path in ("/", "/index.html", "/transcript"):
            rows = []
            for m in STATE.messages:
                reacts = ",".join(STATE.reactions.get(m["id"], []))
                rows.append(
                    f"<div class='msg' data-id='{m['id']}'>"
                    f"<strong>{m['sender_full_name']}</strong> "
                    f"<span class='topic'>#{m['display_recipient']} / {m['subject']}</span>"
                    f"<pre>{m['content']}</pre>"
                    f"<div class='react'>{reacts}</div></div>"
                )
            html = f"""<!doctype html>
<html><head><title>Grok Tag mock Zulip</title>
<style>
body {{ font-family: system-ui, sans-serif; max-width: 720px; margin: 2rem auto; }}
.msg {{ border-bottom: 1px solid #ddd; padding: 0.75rem 0; }}
pre {{ white-space: pre-wrap; background: #f6f8fa; padding: 0.5rem; }}
.topic {{ color: #666; font-size: 0.9rem; }}
</style></head>
<body>
<h1>Grok Tag — mock Zulip transcript</h1>
<p>Channel <code>#engineering</code> topic <code>auth-plan</code>. Memory proof also on disk.</p>
<form method="POST" action="/_test/post">
<textarea name="content" rows="3" style="width:100%" placeholder="Message (use @**Grok Bot** to tag)"></textarea>
<button type="submit">Post as Alice</button>
</form>
<div id="messages">{"".join(rows) or "<p>No messages yet</p>"}</div>
<script>setTimeout(() => location.reload(), 2000);</script>
</body></html>"""
            return self._html(200, html)

        if not check_auth(self) and path.startswith("/api/"):
            return self._json(401, {"result": "error", "msg": "Unauthorized"})

        if path == "/api/v1/users/me":
            return self._json(200, {"result": "success", **STATE.bot})

        if path == "/api/v1/messages":
            num_before = int(qs.get("num_before", ["20"])[0])
            with STATE.lock:
                msgs = list(STATE.messages)
            # Return last num_before
            msgs = msgs[-num_before:]
            return self._json(
                200,
                {"result": "success", "messages": msgs, "found_oldest": True},
            )

        if path == "/api/v1/events":
            qid = qs.get("queue_id", [""])[0]
            last = int(qs.get("last_event_id", ["-1"])[0])
            # Long-poll up to ~2s for tests
            deadline = time.time() + 2.0
            while time.time() < deadline:
                with STATE.lock:
                    q = STATE.queues.get(qid)
                    if not q:
                        return self._json(400, {"result": "error", "msg": "Bad event queue id"})
                    events = [e for e in q["events"] if e["id"] > last]
                    if events:
                        return self._json(200, {"result": "success", "events": events})
                time.sleep(0.1)
            return self._json(200, {"result": "success", "events": []})

        return self._json(404, {"result": "error", "msg": "not found"})

    def do_POST(self) -> None:
        parsed = urlsplit(self.path)
        path = parsed.path
        form = self._read_form()

        if path == "/_test/post":
            content = form.get("content") or ""
            mentioned = []
            if "@**Grok Bot**" in content:
                mentioned = [STATE.bot["user_id"]]
            STATE.add_message(content=content, sender=STATE.human, mentioned_user_ids=mentioned)
            self.send_response(302)
            self.send_header("Location", "/")
            self.end_headers()
            return

        if not check_auth(self):
            return self._json(401, {"result": "error", "msg": "Unauthorized"})

        if path == "/api/v1/register":
            import uuid

            qid = str(uuid.uuid4())
            with STATE.lock:
                STATE.queues[qid] = {"events": [], "next_event_id": 1}
            return self._json(
                200,
                {"result": "success", "queue_id": qid, "last_event_id": -1},
            )

        if path == "/api/v1/messages":
            content = form.get("content") or ""
            topic = form.get("topic") or "auth-plan"
            msg = STATE.add_message(content=content, sender=STATE.bot, topic=topic)
            return self._json(200, {"result": "success", "id": msg["id"]})

        if path.startswith("/api/v1/messages/") and path.endswith("/reactions"):
            mid = int(path.split("/")[4])
            emoji = form.get("emoji_name") or "eyes"
            with STATE.lock:
                STATE.reactions.setdefault(mid, []).append(emoji)
            return self._json(200, {"result": "success"})

        return self._json(404, {"result": "error", "msg": "not found"})

    def do_DELETE(self) -> None:
        if not check_auth(self):
            return self._json(401, {"result": "error", "msg": "Unauthorized"})
        parsed = urlsplit(self.path)
        if "/reactions" in parsed.path:
            return self._json(200, {"result": "success"})
        return self._json(404, {"result": "error", "msg": "not found"})


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--port", type=int, default=9991)
    args = ap.parse_args()
    httpd = ThreadingHTTPServer(("127.0.0.1", args.port), Handler)
    print(f"Mock Zulip on http://127.0.0.1:{args.port}/")
    httpd.serve_forever()


if __name__ == "__main__":
    main()
