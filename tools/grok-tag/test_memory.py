"""Unit tests for continuous topic memory (no sliding window)."""

from __future__ import annotations

import tempfile
import unittest
from pathlib import Path

from memory import MemoryStore, TopicMemory, extractive_compact, format_entries


class TopicMemoryTests(unittest.TestCase):
    def test_ingest_is_idempotent(self) -> None:
        mem = TopicMemory(1, "general", "plan", "sid")
        self.assertTrue(mem.ingest_message(message_id=10, sender="A", content="hello"))
        self.assertFalse(mem.ingest_message(message_id=10, sender="A", content="hello"))
        self.assertEqual(len(mem.entries), 1)

    def test_build_context_includes_all_live_not_last_n(self) -> None:
        mem = TopicMemory(1, "general", "plan", "sid", live_char_budget=10_000_000)
        for i in range(50):
            mem.ingest_message(message_id=i + 1, sender="U", content=f"fact-{i}")
        ctx = mem.build_agent_context()
        # Every message retained in live log when under budget.
        for i in range(50):
            self.assertIn(f"fact-{i}", ctx)
        self.assertIn("Live topic log", ctx)

    def test_compaction_preserves_older_content_in_summary(self) -> None:
        mem = TopicMemory(1, "general", "plan", "sid", live_char_budget=200)
        for i in range(20):
            mem.ingest_message(
                message_id=i + 1,
                sender="U",
                content=("important-decision-%d " % i) * 5,
            )
        self.assertTrue(mem.needs_compaction())
        mem.compact(summarizer=None)
        self.assertTrue(mem.long_term_summary)
        # Older facts must appear in long-term summary, not vanish.
        self.assertIn("important-decision-0", mem.long_term_summary)
        # Full context still exposes compacted memory.
        ctx = mem.build_agent_context()
        self.assertIn("Long-term topic memory", ctx)
        self.assertIn("important-decision-0", ctx)

    def test_extractive_compact_merges_prior(self) -> None:
        out = extractive_compact("prior-fact", "new-fact")
        self.assertIn("prior-fact", out)
        self.assertIn("new-fact", out)

    def test_store_roundtrip(self) -> None:
        with tempfile.TemporaryDirectory() as td:
            store = MemoryStore(Path(td))
            mem = store.get_or_create(stream_id=9, stream="dev", topic="t1")
            mem.ingest_message(message_id=1, sender="A", content="alpha")
            store.save(mem)
            store2 = MemoryStore(Path(td))
            mem2 = store2.get_or_create(stream_id=9, stream="dev", topic="t1")
            self.assertEqual(mem2.session_id, mem.session_id)
            self.assertTrue(mem2.has_message(1))
            self.assertIn("alpha", mem2.build_agent_context())

    def test_reset_new_session(self) -> None:
        with tempfile.TemporaryDirectory() as td:
            store = MemoryStore(Path(td))
            m1 = store.get_or_create(stream_id=1, stream="s", topic="t")
            sid = m1.session_id
            m1.ingest_message(message_id=1, sender="A", content="x")
            store.save(m1)
            m2 = store.reset(1, "t", stream="s")
            self.assertNotEqual(m2.session_id, sid)
            self.assertEqual(len(m2.entries), 0)


class FormatTests(unittest.TestCase):
    def test_format_entries(self) -> None:
        mem = TopicMemory(1, "s", "t", "x")
        mem.ingest_message(message_id=3, sender="Bob", content="hi")
        text = format_entries(mem.entries)
        self.assertIn("[3] Bob", text)
        self.assertIn("hi", text)


if __name__ == "__main__":
    unittest.main()
