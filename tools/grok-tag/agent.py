"""Invoke Grok headless for ambient observe and mention replies."""

from __future__ import annotations

import os
import shutil
import subprocess
from pathlib import Path


def resolve_grok_bin(configured: str) -> str:
    if configured:
        return str(Path(configured).expanduser())
    found = shutil.which("grok")
    if found:
        return found
    fallback = Path.home() / ".grok" / "bin" / "grok"
    if fallback.is_file():
        return str(fallback)
    raise FileNotFoundError("grok binary not found on PATH or at ~/.grok/bin/grok")


def observe_prompt(*, stream: str, topic: str, context: str, new_message: str) -> str:
    return f"""You are Grok Tag, continuously present in a Zulip topic (like Claude Tag in Slack).

Channel: #{stream}
Topic: {topic}

You are receiving an OBSERVE-ONLY update. A new message happened in this topic.
Update your understanding of the conversation. Do NOT draft a Zulip reply.
Do NOT say you will reply. Internally integrate the new information.

Full topic memory (long-term compacted summary + live log of every message
since last compaction — not a sliding window):
---
{context}
---

Newest message just ingested:
{new_message}

Acknowledge by outputting a single line: OBSERVED
"""


def mention_prompt(
    *,
    stream: str,
    topic: str,
    requester: str,
    user_request: str,
    context: str,
) -> str:
    return f"""You are Grok Tag, a shared multiplayer assistant in Zulip (Claude Tag–style).
You have been continuously following this topic; the memory below is your full
topic knowledge (compacted history + complete live log — not last-N only).

Channel: #{stream}
Topic: {topic}
Tagged by: {requester}

Topic memory:
---
{context}
---

Task / question (bot mention markup may be stripped):
{user_request}

Instructions:
- Reply in Zulip-friendly Markdown for the whole team in this topic.
- Use your topic memory; do not claim you only saw recent messages.
- Read-only / explain mode: do not modify files or run mutating commands.
- Be concise and actionable.
"""


def compact_prompt(*, prior_summary: str, block: str) -> str:
    return f"""Compress Zulip topic history for long-term agent memory.
Preserve decisions, names, action items, technical facts, and open questions.
Merge with any prior summary. Output only the summary markdown, no preamble.

Prior summary:
{prior_summary or "(none)"}

New segment to fold in:
{block}
"""


def run_grok(
    *,
    grok_bin: str,
    prompt: str,
    cwd: Path,
    session_id: str,
    resume: bool,
    model: str,
    effort: str,
    max_turns: int,
    allowed_tools: str,
    always_approve: bool,
    timeout_sec: int = 600,
) -> str:
    cmd: list[str] = [
        grok_bin,
        "-p",
        prompt,
        "--cwd",
        str(cwd),
        "--output-format",
        "plain",
        "--max-turns",
        str(max_turns),
        "--no-auto-update",
    ]
    if resume:
        cmd.extend(["--resume", session_id])
    else:
        cmd.extend(["--session-id", session_id])
    if model:
        cmd.extend(["-m", model])
    if effort:
        cmd.extend(["--effort", effort])
    if allowed_tools:
        cmd.extend(["--tools", allowed_tools])
    if always_approve:
        cmd.append("--always-approve")

    env = os.environ.copy()
    env.setdefault("CI", "1")

    proc = subprocess.run(
        cmd,
        cwd=str(cwd),
        env=env,
        capture_output=True,
        text=True,
        timeout=timeout_sec,
        check=False,
    )
    stdout = (proc.stdout or "").strip()
    stderr = (proc.stderr or "").strip()
    if proc.returncode != 0 and not stdout:
        raise RuntimeError(f"grok exited {proc.returncode}\n{stderr[-4000:] or '(no stderr)'}")
    if not stdout:
        return f"_Grok produced no text output._\n```\n{stderr[-2000:]}\n```"
    if proc.returncode != 0:
        return stdout + f"\n\n_(grok exit {proc.returncode})_"
    return stdout
