"""E2E-style tests against memory + dry-run worker logic (no live Zulip required).

For live Zulip + browser proof, see scripts/browser_smoke.py and README.
"""

from __future__ import annotations

import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import MagicMock, patch

# Ensure imports work when run as script from this directory.
sys.path.insert(0, str(Path(__file__).resolve().parent))

from config_loader import Config
from memory import MemoryStore
from worker import GrokTagWorker, message_mentions_bot, strip_bot_mentions


class MentionParsingTests(unittest.TestCase):
    def test_strip_and_detect(self) -> None:
        name = "Grok Bot"
        content = f"@**{name}** what did we decide about auth?"
        self.assertTrue(
            message_mentions_bot(
                {"content": content, "mentioned_user_ids": [42]},
                42,
                name,
            )
        )
        self.assertEqual(
            strip_bot_mentions(content, name),
            "what did we decide about auth?",
        )


class DryRunWorkerTests(unittest.TestCase):
    def test_ambient_ingest_then_mention_reply(self) -> None:
        with tempfile.TemporaryDirectory() as td:
            cfg = Config(
                site="http://localhost:9991",
                email="bot@test",
                api_key="key",
                dry_run=True,
                ambient_llm_observe=False,
                memory_dir=Path(td),
                live_char_budget=100000,
                backfill_max_messages=10,
            )
            with patch.object(GrokTagWorker, "__init__", lambda self, c: None):
                w = GrokTagWorker.__new__(GrokTagWorker)
                w.cfg = cfg
                w.zulip = MagicMock()
                w.zulip.get_messages.return_value = {"messages": [], "found_oldest": True}
                w.bot_user_id = 99
                w.bot_full_name = "Grok Bot"
                w.store = MemoryStore(Path(td))
                w.grok_bin = ""
                w._started_sessions = set()

                for i, text in enumerate(
                    ["We will use OAuth for login", "Also rotate keys weekly", "Ship Friday"],
                    start=1,
                ):
                    w.handle_stream_message(
                        {
                            "type": "stream",
                            "display_recipient": "engineering",
                            "subject": "auth-plan",
                            "stream_id": 7,
                            "sender_id": 1,
                            "sender_full_name": "Alice",
                            "id": i,
                            "content": text,
                        }
                    )

                mem = w.store.get_or_create(stream_id=7, stream="engineering", topic="auth-plan")
                self.assertEqual(mem.ingested_message_ids, {1, 2, 3})
                ctx = mem.build_agent_context()
                self.assertIn("OAuth", ctx)
                self.assertIn("rotate keys", ctx)
                self.assertIn("Ship Friday", ctx)

                w.handle_stream_message(
                    {
                        "type": "stream",
                        "display_recipient": "engineering",
                        "subject": "auth-plan",
                        "stream_id": 7,
                        "sender_id": 1,
                        "sender_full_name": "Alice",
                        "id": 4,
                        "content": "@**Grok Bot** summarize our plan",
                        "mentioned_user_ids": [99],
                    }
                )
                w.zulip.send_stream_message.assert_called()
                args = w.zulip.send_stream_message.call_args[0]
                self.assertEqual(args[0], "engineering")
                self.assertEqual(args[1], "auth-plan")
                self.assertIn("3", args[2])
                self.assertIn("continuous memory", args[2].lower())


if __name__ == "__main__":
    unittest.main()
