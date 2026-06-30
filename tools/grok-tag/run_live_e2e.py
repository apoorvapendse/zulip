#!/usr/bin/env python3
"""Live e2e against mock Zulip: ambient ingest + mention reply + memory proof on disk."""

from __future__ import annotations

import json
import subprocess
import sys
import tempfile
import time
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent


def http_post_form(url: str, data: dict[str, str]) -> None:
    body = "&".join(f"{k}={urllib.parse.quote(v)}" for k, v in data.items()).encode()
    req = urllib.request.Request(url, data=body, method="POST")
    urllib.request.urlopen(req, timeout=5)


def main() -> int:
    import urllib.parse

    port = 18765
    mem_dir = Path(tempfile.mkdtemp(prefix="grok-tag-e2e-"))
    server = subprocess.Popen(
        [sys.executable, str(ROOT / "mock_zulip_server.py"), "--port", str(port)],
        cwd=str(ROOT),
    )
    time.sleep(0.5)
    cfg = mem_dir / "config.toml"
    cfg.write_text(
        f"""
[zulip]
site = "http://127.0.0.1:{port}"
email = "bot@zulip.local"
api_key = "bot-api-key"

[agent]
dry_run = true
ambient_llm_observe = false

[memory]
dir = "{mem_dir}"
live_char_budget = 100000
backfill_max_messages = 50
"""
    )
    worker = subprocess.Popen(
        [sys.executable, str(ROOT / "worker.py"), "--config", str(cfg), "-v", "--dry-run"],
        cwd=str(ROOT),
    )
    try:
        base = f"http://127.0.0.1:{port}"
        # Ambient messages (no mention)
        for text in [
            "We will use OAuth for login",
            "Rotate keys weekly",
            "Ship on Friday",
        ]:
            http_post_form(f"{base}/_test/post", {"content": text})
            time.sleep(0.4)

        # Wait for ingest
        deadline = time.time() + 10
        mem_files = []
        while time.time() < deadline:
            mem_files = list(mem_dir.glob("7_*.json"))
            if mem_files:
                data = json.loads(mem_files[0].read_text())
                if len(data.get("ingested_message_ids") or []) >= 3:
                    break
            time.sleep(0.3)
        else:
            print("FAIL: memory not written", mem_dir, file=sys.stderr)
            return 1

        data = json.loads(mem_files[0].read_text())
        ctx_bits = json.dumps(data)
        for needle in ("OAuth", "Rotate keys", "Ship on Friday"):
            if needle not in ctx_bits:
                print("FAIL: missing", needle, file=sys.stderr)
                return 1

        # Mention
        http_post_form(
            f"{base}/_test/post",
            {"content": "@**Grok Bot** summarize our plan"},
        )
        deadline = time.time() + 10
        while time.time() < deadline:
            html = urllib.request.urlopen(base + "/", timeout=5).read().decode()
            if "Grok Tag" in html and "continuous memory" in html.lower():
                print("OK: bot reply visible in transcript HTML")
                print("Memory file:", mem_files[0])
                print("Ingested IDs:", data.get("ingested_message_ids"))
                # Write proof for the user
                proof = ROOT / "E2E_PROOF.md"
                proof.write_text(
                    f"""# Grok Tag live e2e proof

- Mock Zulip transcript: {base}/
- Memory directory: `{mem_dir}`
- Topic memory file: `{mem_files[0]}`
- Ingested message ids: {data.get("ingested_message_ids")}
- Live entries: {len(data.get("entries") or [])}
- Session id: {data.get("session_id")}

Human messages were ingested **without** @mention (ambient presence).
Bot reply includes continuous memory stats (dry-run mode).

Re-run: `python3 tools/grok-tag/run_live_e2e.py`
"""
                )
                print("Wrote", proof)
                return 0
            time.sleep(0.3)
        print("FAIL: bot reply not in HTML", file=sys.stderr)
        html = urllib.request.urlopen(base + "/", timeout=5).read().decode()
        print(html[:2000], file=sys.stderr)
        return 1
    finally:
        worker.terminate()
        server.terminate()
        worker.wait(timeout=3)
        server.wait(timeout=3)


if __name__ == "__main__":
    raise SystemExit(main())
