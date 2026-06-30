"""Minimal Zulip REST client (stdlib only)."""

from __future__ import annotations

import base64
import json
import ssl
import urllib.error
import urllib.parse
import urllib.request
from typing import Any


class ZulipAPIError(RuntimeError):
    def __init__(self, message: str, *, result: dict[str, Any] | None = None) -> None:
        super().__init__(message)
        self.result = result or {}


class ZulipClient:
    def __init__(self, site: str, email: str, api_key: str, *, timeout: float = 90.0) -> None:
        self.site = site.rstrip("/")
        self.email = email
        self.api_key = api_key
        self.timeout = timeout
        if self.site.startswith("https://") and any(
            h in self.site for h in ("localhost", "127.0.0.1", "zulipdev")
        ):
            self._ssl_context = ssl._create_unverified_context()  # noqa: S323  # local dev certs
        else:
            self._ssl_context = None

    def _request(
        self,
        method: str,
        path: str,
        *,
        params: dict[str, Any] | None = None,
        data: dict[str, Any] | None = None,
        timeout: float | None = None,
    ) -> dict[str, Any]:
        url = f"{self.site}/api/v1{path}"
        if params:
            encoded: list[tuple[str, str]] = []
            for key, value in params.items():
                if isinstance(value, (dict, list)):
                    encoded.append((key, json.dumps(value)))
                else:
                    encoded.append((key, str(value)))
            url = f"{url}?{urllib.parse.urlencode(encoded)}"

        body: bytes | None = None
        token = base64.b64encode(f"{self.email}:{self.api_key}".encode()).decode()
        headers = {
            "User-Agent": "grok-tag/0.2",
            "Authorization": f"Basic {token}",
        }
        if data is not None:
            body = urllib.parse.urlencode(
                {
                    k: json.dumps(v) if isinstance(v, (dict, list)) else str(v)
                    for k, v in data.items()
                }
            ).encode()
            headers["Content-Type"] = "application/x-www-form-urlencoded"

        handlers: list[urllib.request.BaseHandler] = []
        if self._ssl_context is not None:
            handlers.append(urllib.request.HTTPSHandler(context=self._ssl_context))
        opener = (
            urllib.request.build_opener(*handlers) if handlers else urllib.request.build_opener()
        )
        req = urllib.request.Request(url, data=body, headers=headers, method=method)
        try:
            with opener.open(req, timeout=timeout or self.timeout) as resp:
                payload = json.loads(resp.read().decode())
        except urllib.error.HTTPError as exc:
            try:
                payload = json.loads(exc.read().decode())
            except Exception:
                raise ZulipAPIError(f"HTTP {exc.code}: {exc.reason}") from exc
            raise ZulipAPIError(payload.get("msg") or f"HTTP {exc.code}", result=payload) from exc

        if payload.get("result") != "success":
            raise ZulipAPIError(payload.get("msg") or "Zulip API error", result=payload)
        return payload

    def get_profile(self) -> dict[str, Any]:
        return self._request("GET", "/users/me")

    def register_events(self, event_types: list[str]) -> dict[str, Any]:
        return self._request(
            "POST",
            "/register",
            data={"event_types": json.dumps(event_types)},
        )

    def get_events(
        self, queue_id: str, last_event_id: int, *, timeout: float = 60.0
    ) -> dict[str, Any]:
        return self._request(
            "GET",
            "/events",
            params={
                "queue_id": queue_id,
                "last_event_id": last_event_id,
                "dont_block": "false",
            },
            timeout=timeout + 30.0,
        )

    def get_messages(
        self,
        *,
        narrow: list[dict[str, Any]],
        num_before: int,
        num_after: int = 0,
        anchor: str | int = "newest",
    ) -> dict[str, Any]:
        return self._request(
            "GET",
            "/messages",
            params={
                "narrow": narrow,
                "anchor": anchor,
                "num_before": num_before,
                "num_after": num_after,
                "apply_markdown": "false",
            },
        )

    def send_stream_message(self, stream: str, topic: str, content: str) -> dict[str, Any]:
        return self._request(
            "POST",
            "/messages",
            data={
                "type": "stream",
                "to": stream,
                "topic": topic,
                "content": content,
            },
        )

    def add_reaction(self, message_id: int, emoji_name: str) -> dict[str, Any]:
        return self._request(
            "POST",
            f"/messages/{message_id}/reactions",
            data={"emoji_name": emoji_name},
        )

    def remove_reaction(self, message_id: int, emoji_name: str) -> dict[str, Any]:
        return self._request(
            "DELETE",
            f"/messages/{message_id}/reactions",
            data={"emoji_name": emoji_name},
        )
