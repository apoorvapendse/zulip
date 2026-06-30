# Grok Tag — Claude Tag–style continuous presence for Zulip

Sidecar worker: the bot is **always in** topics (for channels you grant via
subscription / allowlist). Every message is ingested into **durable per-topic
memory** (and optionally into the Grok session). When someone **@-mentions** the
bot, it replies using that full memory — **not** a sliding window of last-N
messages.

Older discussion is preserved via **progressive compaction** into
`long_term_summary` when the live log exceeds a char budget. Facts are folded
forward, not dropped.

## Architecture

```
message events (all messages in subscribed streams)
    → append to TopicMemory (on disk under ~/.grok/grok-tag/)
    → optional ambient LLM observe (--resume session, no Zulip reply)
    → compact if live log too large (summary retains older content)

@mention
    → build_agent_context() = long_term_summary + full live log
    → grok --resume session → reply in same topic
```

## Setup

```bash
cp tools/grok-tag/config.example.toml tools/grok-tag/config.toml
# set zulip.site / email / api_key for your bot
```

Create a Zulip bot, subscribe it to channels, then:

```bash
# Dry-run (no model calls; still writes memory + posts proof replies)
GROK_TAG_DRY_RUN=1 python3 tools/grok-tag/worker.py -v --dry-run

# Full (uses ~/.grok/auth.json via grok CLI)
python3 tools/grok-tag/worker.py -v
```

## Tests

```bash
cd tools/grok-tag && python3 -m unittest test_memory.py test_e2e_dry_run.py -v
```

## Proof on a local server

1. Run Zulip dev (`./tools/run-dev`).
2. Create bot, put credentials in `config.toml`.
3. Start worker with `--dry-run` or full mode.
4. Post several messages in a topic **without** mentioning the bot.
5. Check `~/.grok/grok-tag/*.json` — all messages listed under `entries` /
   `ingested_message_ids`.
6. `@**Bot Name** what did we discuss?` — reply should reference continuous
   memory counts; in full mode, answer from session + memory.
7. Browser: open the topic and confirm bot reply + ✅ reaction on the mention.

## Reset

`@**Bot Name** reset` — clears topic memory and starts a new Grok session id.
