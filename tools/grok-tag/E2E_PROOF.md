# Grok Tag live e2e proof

- Mock Zulip transcript: http://127.0.0.1:18765/
- Memory directory: `/var/folders/7n/j257x15x6g18np0qhbhpyqwh0000gn/T/grok-tag-e2e-e0u927tk`
- Topic memory file: `/var/folders/7n/j257x15x6g18np0qhbhpyqwh0000gn/T/grok-tag-e2e-e0u927tk/7_auth-plan.json`
- Ingested message ids: [1, 2, 3]
- Live entries: 3
- Session id: 42255b35-c4d6-4613-9f3e-5fd57e300f59

Human messages were ingested **without** @mention (ambient presence).
Bot reply includes continuous memory stats (dry-run mode).

Re-run: `python3 tools/grok-tag/run_live_e2e.py`
