"""Load config from config.toml + environment overrides."""

from __future__ import annotations

import os
import sys
from dataclasses import dataclass, field
from pathlib import Path

try:
    import tomllib
except ModuleNotFoundError:  # Python < 3.11
    import tomli as tomllib  # type: ignore[no-redef, import-not-found]  # fallback for 3.10

ROOT = Path(__file__).resolve().parent
REPO_ROOT = ROOT.parent.parent


@dataclass
class Config:
    site: str
    email: str
    api_key: str
    grok_bin: str = ""
    cwd: Path = field(default_factory=lambda: REPO_ROOT)
    model: str = ""
    effort: str = "medium"
    max_turns: int = 30
    # Ambient observe uses fewer turns / no tools by default.
    observe_max_turns: int = 3
    observe_tools: str = ""  # empty = no --tools flag restriction beyond observe prompt
    live_char_budget: int = 48000
    # Backfill when first seeing a topic: how many historical messages to pull (all ingested, not windowed away).
    backfill_max_messages: int = 500
    memory_dir: Path = field(default_factory=lambda: Path.home() / ".grok" / "grok-tag")
    allowed_tools: str = (
        "read_file,grep,list_dir,web_search,web_fetch,open_page,open_page_with_find"
    )
    always_approve: bool = True
    allowed_streams: list[str] = field(default_factory=list)
    # If True, call grok on every message for observe (slower). If False, only
    # update on-disk memory and call grok on mention (+ optional compact).
    ambient_llm_observe: bool = True
    # Use LLM for compaction; False uses extractive merge (deterministic).
    llm_compaction: bool = False
    # Dry-run: never call grok, write fake replies (for e2e without model).
    dry_run: bool = False


def _load_toml(path: Path) -> dict[str, object]:
    if not path.is_file():
        return {}
    with path.open("rb") as f:
        return tomllib.load(f)


def load_config(path: Path | None = None) -> Config:
    cfg_path = path or Path(os.environ.get("GROK_TAG_CONFIG", ROOT / "config.toml"))
    raw = _load_toml(cfg_path)

    zulip = raw.get("zulip") or {}
    agent = raw.get("agent") or {}
    memory = raw.get("memory") or {}
    safety = raw.get("safety") or {}
    filters = raw.get("filters") or {}

    site = os.environ.get("ZULIP_SITE") or zulip.get("site") or ""
    email = os.environ.get("ZULIP_EMAIL") or zulip.get("email") or ""
    api_key = os.environ.get("ZULIP_API_KEY") or zulip.get("api_key") or ""

    if not site or not email or not api_key:
        print(
            "Missing Zulip credentials. Set ZULIP_SITE, ZULIP_EMAIL, ZULIP_API_KEY "
            f"or copy config.example.toml to {cfg_path}",
            file=sys.stderr,
        )
        sys.exit(2)

    cwd_raw = os.environ.get("GROK_TAG_CWD") or agent.get("cwd") or ""
    cwd = Path(cwd_raw).expanduser() if cwd_raw else REPO_ROOT
    mem_raw = os.environ.get("GROK_TAG_MEMORY") or memory.get("dir") or "~/.grok/grok-tag"

    allowed_streams = filters.get("allowed_streams") or []
    if isinstance(allowed_streams, str):
        allowed_streams = [s.strip() for s in allowed_streams.split(",") if s.strip()]

    dry = os.environ.get("GROK_TAG_DRY_RUN", "").lower() in ("1", "true", "yes")
    if "dry_run" in agent:
        dry = bool(agent["dry_run"])

    ambient = True
    if "ambient_llm_observe" in agent:
        ambient = bool(agent["ambient_llm_observe"])
    if os.environ.get("GROK_TAG_AMBIENT_LLM", "").lower() in ("0", "false", "no"):
        ambient = False

    return Config(
        site=site.rstrip("/"),
        email=email,
        api_key=api_key,
        grok_bin=os.environ.get("GROK_BIN") or agent.get("grok_bin") or "",
        cwd=cwd.resolve(),
        model=os.environ.get("GROK_TAG_MODEL") or agent.get("model") or "",
        effort=os.environ.get("GROK_TAG_EFFORT") or agent.get("effort") or "medium",
        max_turns=int(agent.get("max_turns") or 30),
        observe_max_turns=int(agent.get("observe_max_turns") or 3),
        observe_tools=agent.get("observe_tools") or "",
        live_char_budget=int(memory.get("live_char_budget") or 48000),
        backfill_max_messages=int(memory.get("backfill_max_messages") or 500),
        memory_dir=Path(mem_raw).expanduser(),
        allowed_tools=os.environ.get("GROK_TAG_TOOLS")
        or safety.get("allowed_tools")
        or Config.allowed_tools,
        always_approve=bool(safety.get("always_approve", True)),
        allowed_streams=list(allowed_streams),
        ambient_llm_observe=ambient,
        llm_compaction=bool(memory.get("llm_compaction", False)),
        dry_run=dry,
    )
