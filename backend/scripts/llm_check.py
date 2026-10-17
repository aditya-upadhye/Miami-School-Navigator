"""Check that the configured LLM works for this app. Run after changing any LLM_* setting:

    python scripts/llm_check.py            # uses your environment / .env-style variables
    python scripts/llm_check.py --backups  # also checks every route in LLM_BACKUPS (one at a time)
    LLM_PROVIDER=ollama LLM_MODEL=gemma4 python scripts/llm_check.py

It verifies: configuration, reachability + auth, whether a system role is accepted (the adapter adapts either way), that the model
emits a *native* tool call with valid JSON arguments (required by the chat agent), and shows short Spanish and Haitian Creole replies
for you to read. Exit code 1 if the model cannot do tool calling.
"""
from __future__ import annotations

import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app.chat.llm import LlmConfig, LlmUnavailable, OpenAICompatLlm, parse_backups  # noqa: E402
from app.chat.tools import TOOLS  # noqa: E402


def step(label: str, ok: bool, detail: str = "") -> bool:
    print(f"[{'PASS' if ok else 'FAIL'}] {label}" + (f": {detail}" if detail else ""))
    return ok


def main() -> int:
    cfg = LlmConfig.from_env()  # also reads backend/.env
    code = check(cfg)
    if "--backups" in sys.argv:
        import os

        routes, problems = parse_backups(os.environ.get("LLM_BACKUPS"), cfg, os.environ)
        for p in problems:
            print(f"\n[FAIL] {p}")
            code = 1
        for backup, cap in routes:
            print(f"\n--- backup route (daily cap {cap or 'none'}) ---")
            code = check(backup) or code
    return code


def check(cfg: LlmConfig) -> int:
    d = cfg.describe()
    print(f"provider={d['provider']} model={d['model']} base_url={d['base_url']}")
    if not step("configuration", d["configured"], "; ".join(d["problems"])):
        return 1
    llm = OpenAICompatLlm(cfg)

    try:
        t0 = time.time()
        t = llm.create(system="You are terse.", messages=[{"role": "user", "content": "Reply with the single word: OK"}], tools=[])
        step("reachable + authenticated", bool(t.text), f"{t.text[:40]!r} in {time.time() - t0:.1f}s")
        step("system role", True, "folded into the user message (model rejected a system role)" if llm._fold else "accepted")
        if llm._send_temperature is False and cfg.temperature is not None:
            print("      note: this model rejects `temperature`; it was dropped automatically")
    except LlmUnavailable as exc:
        step("reachable + authenticated", False, str(exc))
        return 1

    ok = True
    try:
        t = llm.create(system="Use tools whenever they help. Never answer dates from memory.",
                       messages=[{"role": "user", "content": "When do magnet applications close? Use your tools."}], tools=TOOLS)
        names = [c["name"] for c in t.tool_calls]
        ok = step("native tool call", bool(t.tool_calls) and all(c["invalid"] is None for c in t.tool_calls),
                  f"called {names}" if names else f"no tool call; replied {t.text[:80]!r} (this model may not support tool calling)")
        if t.tool_calls and "get_dates" not in names:
            print(f"      note: expected get_dates, got {names}; fine if reasonable")
    except LlmUnavailable as exc:
        ok = step("native tool call", False, str(exc))

    for lang, q in (("Spanish", "En una frase: ¿qué es una escuela magnet?"), ("Haitian Creole", "Nan yon fraz: kisa yon lekòl piblik ye?")):
        try:
            t = llm.create(system=f"Answer only in {lang}.", messages=[{"role": "user", "content": q}], tools=[])
            print(f"[info] {lang} reply (read it yourself): {t.text[:160]!r}")
        except LlmUnavailable as exc:
            print(f"[info] {lang} probe failed: {exc}")
    print("\nNext: python scripts/golden.py   (the 10 spec cases, against the running service)")
    return 0 if ok else 1


if __name__ == "__main__":
    raise SystemExit(main())
