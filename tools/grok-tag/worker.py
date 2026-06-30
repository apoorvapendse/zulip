"""Grok Tag worker: continuous topic presence + @mention replies."""

from __future__ import annotations

import argparse
import contextlib
import logging
import re
import time
import traceback
from pathlib import Path

from agent import compact_prompt, mention_prompt, observe_prompt, resolve_grok_bin, run_grok
from config_loader import Config, load_config
from memory import MemoryStore, TopicMemory, extractive_compact
from zulip_api import ZulipAPIError, ZulipClient

LOG = logging.getLogger("grok-tag")
MENTION_RE = re.compile(r"@_?\*\*(.+?)\*\*")
RESET_RE = re.compile(r"(?i)^\s*(?:reset|forget|new session)\s*$")


def strip_bot_mentions(content: str, bot_full_name: str) -> str:
    def repl(match: re.Match[str]) -> str:
        if match.group(1).casefold() == bot_full_name.casefold():
            return ""
        return match.group(0)

    cleaned = MENTION_RE.sub(repl, content)
    return re.sub(r"[ \t]{2,}", " ", cleaned).strip()


def message_mentions_bot(message: dict, bot_user_id: int, bot_full_name: str) -> bool:
    for uid in message.get("mentioned_user_ids") or []:
        if int(uid) == bot_user_id:
            return True
    content = message.get("content") or ""
    return f"@**{bot_full_name}**" in content or f"@_**{bot_full_name}**" in content


class GrokTagWorker:
    def __init__(self, cfg: Config) -> None:
        self.cfg = cfg
        self.zulip = ZulipClient(cfg.site, cfg.email, cfg.api_key)
        profile = self.zulip.get_profile()
        self.bot_user_id = int(profile["user_id"])
        self.bot_full_name = profile.get("full_name") or "Grok"
        self.store = MemoryStore(cfg.memory_dir)
        self.grok_bin = "" if cfg.dry_run else resolve_grok_bin(cfg.grok_bin)
        # Sessions we have already started with --session-id in this process;
        # on-disk session_id means we should --resume after restart.
        self._started_sessions: set[str] = set()
        LOG.info(
            "Bot %s (id=%s) site=%s dry_run=%s memory=%s",
            self.bot_full_name,
            self.bot_user_id,
            cfg.site,
            cfg.dry_run,
            cfg.memory_dir,
        )

    def _run_model(
        self,
        *,
        prompt: str,
        mem: TopicMemory,
        max_turns: int,
        allowed_tools: str,
        timeout_sec: int = 600,
    ) -> str:
        if self.cfg.dry_run:
            return f"[dry-run] OBSERVED/REPLY for session {mem.session_id[:8]}"

        # Resume only after we've successfully started this session_id once
        # in this process (or we may retry with --session-id on failure).
        resume = mem.session_id in self._started_sessions
        try:
            out = run_grok(
                grok_bin=self.grok_bin,
                prompt=prompt,
                cwd=self.cfg.cwd,
                session_id=mem.session_id,
                resume=resume,
                model=self.cfg.model,
                effort=self.cfg.effort,
                max_turns=max_turns,
                allowed_tools=allowed_tools,
                always_approve=self.cfg.always_approve,
                timeout_sec=timeout_sec,
            )
        except RuntimeError:
            out = run_grok(
                grok_bin=self.grok_bin,
                prompt=prompt,
                cwd=self.cfg.cwd,
                session_id=mem.session_id,
                resume=False,
                model=self.cfg.model,
                effort=self.cfg.effort,
                max_turns=max_turns,
                allowed_tools=allowed_tools,
                always_approve=self.cfg.always_approve,
                timeout_sec=timeout_sec,
            )
        self._started_sessions.add(mem.session_id)
        return out

    def maybe_compact(self, mem: TopicMemory) -> None:
        if not mem.needs_compaction():
            return

        def summarizer(prior: str, block: str) -> str:
            if not self.cfg.llm_compaction or self.cfg.dry_run:
                return extractive_compact(prior, block)
            prompt = compact_prompt(prior_summary=prior, block=block)
            return self._run_model(
                prompt=prompt,
                mem=mem,
                max_turns=2,
                allowed_tools="",
                timeout_sec=120,
            )

        mem.compact(summarizer=summarizer if self.cfg.llm_compaction else None)
        self.store.save(mem)
        LOG.info("Compacted memory for %s / %s", mem.stream, mem.topic)

    def backfill_topic(self, mem: TopicMemory) -> None:
        """Pull historical messages into memory once when topic is new/empty."""
        if mem.ingested_message_ids:
            return
        narrow = [
            {"operator": "channel", "operand": mem.stream_id},
            {"operator": "topic", "operand": mem.topic},
        ]
        # Paginate newest-first batches until backfill_max_messages or exhausted.
        remaining = self.cfg.backfill_max_messages
        anchor: str | int = "newest"
        batch_size = 100
        collected: list[dict] = []
        while remaining > 0:
            n = min(batch_size, remaining)
            result = self.zulip.get_messages(
                narrow=narrow, num_before=n, num_after=0, anchor=anchor
            )
            msgs = result.get("messages") or []
            if not msgs:
                break
            collected.extend(msgs)
            remaining -= len(msgs)
            oldest_id = min(int(m["id"]) for m in msgs)
            if len(msgs) < n:
                break
            # Next page: messages strictly older than oldest we have.
            anchor = oldest_id
            # Avoid infinite loop: Zulip returns message at anchor in some modes;
            # use num_before with anchor as oldest and rely on shrinking set.
            if result.get("found_oldest"):
                break
            # De-dup safety
            if len(collected) >= self.cfg.backfill_max_messages:
                break

        # Ingest oldest → newest
        for m in sorted(collected, key=lambda x: int(x["id"])):
            mem.ingest_message(
                message_id=int(m["id"]),
                sender=m.get("sender_full_name") or "?",
                content=m.get("content") or "",
                ts=m.get("timestamp"),
            )
        while mem.needs_compaction():
            self.maybe_compact(mem)
        self.store.save(mem)
        LOG.info(
            "Backfilled %d messages into #%s / %s",
            len(mem.ingested_message_ids),
            mem.stream,
            mem.topic,
        )

    def handle_stream_message(self, message: dict) -> None:
        if message.get("type") != "stream":
            return
        stream = message.get("display_recipient")
        topic = message.get("subject") or message.get("topic")
        stream_id = message.get("stream_id")
        if not stream or topic is None or stream_id is None:
            return
        if self.cfg.allowed_streams and stream not in self.cfg.allowed_streams:
            return

        sender_id = int(message.get("sender_id", -1))
        mid = int(message["id"])
        content = message.get("content") or ""
        sender_name = message.get("sender_full_name") or "?"

        mem = self.store.get_or_create(
            stream_id=int(stream_id),
            stream=stream,
            topic=topic,
            live_char_budget=self.cfg.live_char_budget,
        )

        # First touch: backfill history so the agent has full topic knowledge.
        if not mem.ingested_message_ids:
            try:
                self.backfill_topic(mem)
            except ZulipAPIError as exc:
                LOG.warning("Backfill failed: %s", exc)

        is_bot = sender_id == self.bot_user_id
        is_mention = (not is_bot) and message_mentions_bot(
            message, self.bot_user_id, self.bot_full_name
        )

        # Always ingest into durable memory (continuous presence).
        if not is_bot:
            new = mem.ingest_message(
                message_id=mid,
                sender=sender_name,
                content=content,
                ts=message.get("timestamp"),
            )
            self.store.save(mem)
            if new and not is_mention and self.cfg.ambient_llm_observe:
                ctx = mem.build_agent_context()
                newest = f"[{mid}] {sender_name}:\n{content}"
                prompt = observe_prompt(stream=stream, topic=topic, context=ctx, new_message=newest)
                try:
                    self._run_model(
                        prompt=prompt,
                        mem=mem,
                        max_turns=self.cfg.observe_max_turns,
                        allowed_tools=self.cfg.observe_tools,
                        timeout_sec=180,
                    )
                except Exception:
                    LOG.exception("Ambient observe failed")
            self.maybe_compact(mem)

        if is_bot or not is_mention:
            return

        user_request = strip_bot_mentions(content, self.bot_full_name)
        if RESET_RE.match(user_request or ""):
            mem = self.store.reset(int(stream_id), topic, stream=stream)
            self._started_sessions.discard(mem.session_id)
            self.zulip.send_stream_message(
                stream,
                topic,
                f"Reset topic memory and agent session (`{mem.session_id[:8]}…`). "
                "I will re-backfill as new messages arrive.",
            )
            return

        with contextlib.suppress(ZulipAPIError):
            self.zulip.add_reaction(mid, "eyes")

        ctx = mem.build_agent_context()
        prompt = mention_prompt(
            stream=stream,
            topic=topic,
            requester=sender_name,
            user_request=user_request or "(empty mention)",
            context=ctx,
        )
        try:
            reply = self._run_model(
                prompt=prompt,
                mem=mem,
                max_turns=self.cfg.max_turns,
                allowed_tools=self.cfg.allowed_tools,
                timeout_sec=600,
            )
        except Exception as exc:
            LOG.exception("Mention agent failed")
            reply = f"Grok Tag failed: `{exc}`"

        if self.cfg.dry_run:
            reply = (
                f"**Grok Tag** (dry-run)\n\n"
                f"I have continuous memory for this topic with "
                f"**{len(mem.ingested_message_ids)}** ingested messages "
                f"({len(mem.entries)} live entries"
                f"{', plus long-term summary' if mem.long_term_summary else ''}).\n\n"
                f"You asked: {user_request or '(empty)'}\n\n"
                f"Session `{mem.session_id[:8]}…` — memory file under `{self.cfg.memory_dir}`."
            )

        if len(reply) > 9000:
            reply = reply[:8800] + "\n\n… _(truncated)_"

        self.zulip.send_stream_message(stream, topic, reply)
        # Ingest our own reply into memory so continuity includes agent output.
        # (We need the new message id — send response includes it.)
        with contextlib.suppress(ZulipAPIError):
            self.zulip.remove_reaction(mid, "eyes")
            self.zulip.add_reaction(mid, "check")

    def run_forever(self) -> None:
        while True:
            try:
                reg = self.zulip.register_events(["message"])
                queue_id = reg["queue_id"]
                last_event_id = int(reg["last_event_id"])
                LOG.info("Event queue %s", queue_id)
                while True:
                    try:
                        ev = self.zulip.get_events(queue_id, last_event_id)
                    except ZulipAPIError as exc:
                        if "bad event queue" in str(exc).lower():
                            LOG.warning("Queue expired; re-registering")
                            break
                        LOG.warning("get_events: %s", exc)
                        time.sleep(2)
                        continue
                    for event in ev.get("events") or []:
                        last_event_id = max(last_event_id, int(event["id"]))
                        if event.get("type") != "message":
                            continue
                        try:
                            self.handle_stream_message(event.get("message") or {})
                        except Exception:
                            LOG.error("handler crash:\n%s", traceback.format_exc())
            except KeyboardInterrupt:
                LOG.info("Shutting down")
                return
            except Exception:
                LOG.error("loop error:\n%s", traceback.format_exc())
                time.sleep(3)


def main(argv: list[str] | None = None) -> None:
    parser = argparse.ArgumentParser(description="Grok Tag worker for Zulip")
    parser.add_argument("--config", type=Path, default=None)
    parser.add_argument("-v", "--verbose", action="store_true")
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Do not call grok; still ingest memory and post dry-run replies",
    )
    args = parser.parse_args(argv)
    logging.basicConfig(
        level=logging.DEBUG if args.verbose else logging.INFO,
        format="%(asctime)s %(levelname)s %(name)s: %(message)s",
    )
    cfg = load_config(args.config)
    if args.dry_run:
        cfg.dry_run = True
    GrokTagWorker(cfg).run_forever()


if __name__ == "__main__":
    main()
