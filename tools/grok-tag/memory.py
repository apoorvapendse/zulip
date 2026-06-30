"""Per-topic durable memory: full ingest log + progressive compaction.

The agent is always "in" the topic. Every message is appended to an append-only
log. When the live context grows too large, older entries are compacted into a
running summary (not a sliding window that forgets mid-conversation facts).
"""

from __future__ import annotations

import json
import re
import threading
import uuid
from collections.abc import Callable
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Literal

EntryKind = Literal["message", "summary", "system"]


@dataclass
class MemoryEntry:
    kind: EntryKind
    message_id: int | None
    sender: str
    content: str
    ts: float | None = None

    def to_dict(self) -> dict[str, Any]:
        return {
            "kind": self.kind,
            "message_id": self.message_id,
            "sender": self.sender,
            "content": self.content,
            "ts": self.ts,
        }

    @classmethod
    def from_dict(cls, d: dict[str, Any]) -> MemoryEntry:
        return cls(
            kind=d["kind"],
            message_id=d.get("message_id"),
            sender=d.get("sender") or "",
            content=d.get("content") or "",
            ts=d.get("ts"),
        )


@dataclass
class TopicMemory:
    stream_id: int
    stream: str
    topic: str
    session_id: str
    entries: list[MemoryEntry] = field(default_factory=list)
    ingested_message_ids: set[int] = field(default_factory=set)
    # Running narrative of compacted older conversation (never a "last N only" view).
    long_term_summary: str = ""
    # Char budget for the *live* (non-summary) entries before compaction triggers.
    live_char_budget: int = 48000

    def key(self) -> str:
        return f"{self.stream_id}::{self.topic}"

    def has_message(self, message_id: int) -> bool:
        return message_id in self.ingested_message_ids

    def ingest_message(
        self,
        *,
        message_id: int,
        sender: str,
        content: str,
        ts: float | None = None,
    ) -> bool:
        """Append a Zulip message if not already seen. Returns True if new."""
        if message_id in self.ingested_message_ids:
            return False
        self.ingested_message_ids.add(message_id)
        self.entries.append(
            MemoryEntry(
                kind="message",
                message_id=message_id,
                sender=sender,
                content=content.strip(),
                ts=ts,
            )
        )
        return True

    def live_chars(self) -> int:
        return sum(len(e.content) + len(e.sender) + 16 for e in self.entries)

    def needs_compaction(self) -> bool:
        return self.live_chars() > self.live_char_budget and len(self.entries) > 8

    def compact(self, summarizer: Callable[..., str] | None = None) -> str | None:
        """Fold oldest half of live entries into long_term_summary.

        If summarizer is None, uses a deterministic extractive fallback (keeps
        all content, just structured) so tests don't need the LLM.
        Returns the new summary text if compaction ran, else None.
        """
        if not self.needs_compaction():
            return None
        cut = max(4, len(self.entries) // 2)
        old = self.entries[:cut]
        self.entries = self.entries[cut:]
        block = format_entries(old)
        if summarizer is not None:
            piece = summarizer(self.long_term_summary, block)
        else:
            piece = extractive_compact(self.long_term_summary, block)
        self.long_term_summary = piece
        return piece

    def build_agent_context(self) -> str:
        """Full context for the agent: long-term summary + all live entries.

        This is the opposite of a sliding window: live entries are the *entire*
        uncompacted tail since last compaction, and long_term_summary retains
        older conversation in compressed form (not dropped).
        """
        parts: list[str] = []
        if self.long_term_summary.strip():
            parts.append("## Long-term topic memory (compacted earlier discussion)\n")
            parts.append(self.long_term_summary.strip())
            parts.append("")
        parts.append("## Live topic log (every message since last compaction)\n")
        if not self.entries:
            parts.append("(no live messages yet)")
        else:
            parts.append(format_entries(self.entries))
        return "\n".join(parts)

    def to_dict(self) -> dict[str, Any]:
        return {
            "stream_id": self.stream_id,
            "stream": self.stream,
            "topic": self.topic,
            "session_id": self.session_id,
            "long_term_summary": self.long_term_summary,
            "live_char_budget": self.live_char_budget,
            "entries": [e.to_dict() for e in self.entries],
            "ingested_message_ids": sorted(self.ingested_message_ids),
        }

    @classmethod
    def from_dict(cls, d: dict[str, Any]) -> TopicMemory:
        mem = cls(
            stream_id=int(d["stream_id"]),
            stream=d.get("stream") or "",
            topic=d.get("topic") or "",
            session_id=d.get("session_id") or str(uuid.uuid4()),
            long_term_summary=d.get("long_term_summary") or "",
            live_char_budget=int(d.get("live_char_budget") or 48000),
        )
        mem.entries = [MemoryEntry.from_dict(e) for e in d.get("entries") or []]
        mem.ingested_message_ids = {int(x) for x in d.get("ingested_message_ids") or []}
        # Ensure ids from entries are present
        for e in mem.entries:
            if e.message_id is not None:
                mem.ingested_message_ids.add(e.message_id)
        return mem


def format_entries(entries: list[MemoryEntry]) -> str:
    lines: list[str] = []
    for e in entries:
        mid = e.message_id if e.message_id is not None else "-"
        lines.append(f"[{mid}] {e.sender}:\n{e.content}")
    return "\n\n".join(lines)


def extractive_compact(prior_summary: str, block: str) -> str:
    """Deterministic compaction for tests / offline: retain prior + labeled block."""
    parts: list[str] = []
    if prior_summary.strip():
        parts.append(prior_summary.strip())
    parts.append("--- compacted segment ---")
    parts.append(block.strip())
    return "\n\n".join(parts)


class MemoryStore:
    """Thread-safe on-disk store of TopicMemory objects."""

    def __init__(self, directory: Path) -> None:
        self.directory = directory.expanduser()
        self.directory.mkdir(parents=True, exist_ok=True)
        self._lock = threading.Lock()
        self._topics: dict[str, TopicMemory] = {}
        self._load_all()

    def _path_for(self, stream_id: int, topic: str) -> Path:
        safe = re.sub(r"[^\w.-]+", "_", topic.strip())[:80] or "topic"
        return self.directory / f"{stream_id}_{safe}.json"

    def _load_all(self) -> None:
        for path in self.directory.glob("*.json"):
            if path.name in ("sessions.json", "worker_state.json"):
                continue
            try:
                data = json.loads(path.read_text())
                mem = TopicMemory.from_dict(data)
                self._topics[mem.key()] = mem
            except (json.JSONDecodeError, KeyError, TypeError, ValueError):
                continue

    def get_or_create(
        self,
        *,
        stream_id: int,
        stream: str,
        topic: str,
        live_char_budget: int = 48000,
    ) -> TopicMemory:
        key = f"{stream_id}::{topic}"
        with self._lock:
            if key not in self._topics:
                self._topics[key] = TopicMemory(
                    stream_id=stream_id,
                    stream=stream,
                    topic=topic,
                    session_id=str(uuid.uuid4()),
                    live_char_budget=live_char_budget,
                )
                self._persist(self._topics[key])
            else:
                mem = self._topics[key]
                if stream and not mem.stream:
                    mem.stream = stream
            return self._topics[key]

    def reset(self, stream_id: int, topic: str, stream: str = "") -> TopicMemory:
        key = f"{stream_id}::{topic}"
        with self._lock:
            mem = TopicMemory(
                stream_id=stream_id,
                stream=stream,
                topic=topic,
                session_id=str(uuid.uuid4()),
            )
            self._topics[key] = mem
            self._persist(mem)
            return mem

    def save(self, mem: TopicMemory) -> None:
        with self._lock:
            self._topics[mem.key()] = mem
            self._persist(mem)

    def _persist(self, mem: TopicMemory) -> None:
        path = self._path_for(mem.stream_id, mem.topic)
        tmp = path.with_suffix(".tmp")
        tmp.write_text(json.dumps(mem.to_dict(), indent=2, sort_keys=True) + "\n")
        tmp.replace(path)

    def list_topics(self) -> list[TopicMemory]:
        with self._lock:
            return list(self._topics.values())
