# How to verify Grok Tag locally

## Automated (no Zulip server)

```bash
cd tools/grok-tag
python3 -m unittest test_memory.py test_e2e_dry_run.py -v
python3 run_live_e2e.py
```

## Browser proof (mock Zulip transcript UI)

If not already running:

```bash
# terminal 1
python3 tools/grok-tag/mock_zulip_server.py --port 18766

# terminal 2
python3 tools/grok-tag/worker.py --config tools/grok-tag/browser_config.toml --dry-run -v
```

Open **http://127.0.0.1:18766/** — you should see Alice’s ambient messages (OAuth / rotate keys / ship Friday), the `@**Grok Bot**` mention with eyes/check reactions, and Grok Bot’s dry-run reply citing **continuous memory** with **4 ingested messages**.

On-disk history (source of truth for “agent was always in the topic”):

```bash
cat tools/grok-tag/browser_proof_memory/*.json
```

Every human message appears under `entries` / `ingested_message_ids` — including messages **before** the mention (not last-N only).

Screenshot from Playwright pass: `tools/grok-tag/browser_proof.png`

## Real Zulip dev server

1. Restore/start your normal Zulip env (`source .venv/bin/activate && ./tools/run-dev`) — note: a mistaken `uv run` may have broken `.venv` on this machine; re-run `./tools/provision` if needed.
2. Create a bot (Personal settings → Bots), subscribe it to a channel.
3. `cp tools/grok-tag/config.example.toml tools/grok-tag/config.toml` and set credentials.
4. `python3 tools/grok-tag/worker.py -v` (or `--dry-run` without calling Grok).
5. Post messages in a topic without mentioning the bot → files appear under `~/.grok/grok-tag/`.
6. `@**Bot Name** …` → reply in-topic; memory JSON grows with full live log + optional `long_term_summary` after compaction.
