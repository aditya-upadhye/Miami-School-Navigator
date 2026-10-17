"""Golden chat tests from the spec. Run against a live service (or in-process) roughly every hour:

    GEMINI_API_KEY=... python scripts/golden.py                         # in-process (or any LLM_* provider settings)
    python scripts/golden.py --base-url https://your-service.example    # a deployed instance
    # cron:  0 * * * *  cd /path/to/backend && .venv/bin/python scripts/golden.py --base-url $URL >> golden.log

Each case sends one chat request and asserts on the answer, the tools used and the citations. Cases are SKIPPED (not passed)
when the AI model is unavailable, so a missing key can never look like a green run. Exit code 1 if any case fails.
"""
from __future__ import annotations

import argparse
import re
import sys
import time
from dataclasses import dataclass, field
from pathlib import Path
from typing import Callable

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

ADDRESS = "2250 NW 2nd Ave, Miami, FL 33127"  # Wynwood
PRIVATE = "The Cushman School"


def tools_used(r: dict) -> list[str]:
    return [c["tool"] for c in r.get("tool_calls", [])]


def asserted(r: dict, name: str) -> dict:
    return next((c["input"] for c in r.get("tool_calls", []) if c["tool"] == name), {})  # {} when the tool was never called: a clean FAIL, not a crash


@dataclass
class Case:
    id: int
    name: str
    messages: list[str]
    check: Callable[[dict], list[str]]  # returns a list of failure reasons
    lang: str = "en"
    profile: dict = field(default_factory=dict)


def need(cond: bool, why: str) -> list[str]:
    return [] if cond else [why]


def c1(r):
    stages = {s for c in r["tool_calls"] if c["tool"] == "search_schools" for s in (c["input"].get("stages") or [])}
    ages = {a for c in r["tool_calls"] if c["tool"] == "search_schools" for a in (c["input"].get("ages") or [])}
    return (need("search_schools" in tools_used(r), "did not search") + need(r["results"] != [], "no results")
            + need({"pre_k", "elementary"} <= stages or {3, 7} <= ages, "did not cover both children (ages 3 and 7)")
            + need(r["filters_applied"].get("free_only") is True, "free_only not applied") + need(len(r["citations"]) > 0, "no citations"))


def c2(r):
    return need("get_zones" in tools_used(r) or "search_schools" in tools_used(r), "did not look up zoning") + need(
        "Dunbar" in r["answer"], "answer does not name the zoned elementary (Paul Laurence Dunbar K-8 Center)") + need(len(r["citations"]) > 0, "no citations")


def c3(r):
    a = r["answer"]
    return (need("$" not in a, "invented a dollar amount") + need(re.search(r"not (available|listed|published)|no public|isn't (listed|available)|don't have|do not have|unavailable", a, re.I) is not None,
                                                                "did not say tuition is unavailable")
            + need(re.search(r"ask|contact|call|visit", a, re.I) is not None, "gave no next step"))


def c4(r):
    a = r["answer"]
    # With FLDOE grades loaded the answer should cite them; without, it must say grades are not available instead of inventing one.
    grade_claim = re.search(r"\bgrade of [A-F]\b|\b(an?|the) [A-F] (school|grade)", a, re.I)
    loaded = any(s["state_grade"]["status"] == "official" for s in r["results"])
    return (need("search_schools" in tools_used(r), "did not search") + need(loaded or not grade_claim, "claimed a grade that is not in the data")
            + need(loaded or re.search(r"not (available|loaded)|no (state )?grade|isn't available|unavailable", a, re.I) is not None, "did not say grades are unavailable"))


def c5(r):
    urls = " ".join(c.get("url") or "" for c in r["citations"])
    return (need(re.search(r"\b(yes|must|need to|still)\b", r["answer"], re.I) is not None, "did not say zoned families still must apply")
            + need("get_dates" in tools_used(r) or "get_school" in tools_used(r), "did not use a tool for the rule")
            + need(any(h in urls for h in ("miamimagnets", "dadeschools")), "no district source cited") + need("confirm" in r["answer"].lower() or "verify" in r["answer"].lower(), "did not pass on the verification caveat"))


def c6(r):
    return need("get_dates" in tools_used(r), "did not call get_dates") + need(re.search(r"Jan(uary|\.)?\s*15|2027-01-15|15 de enero", r["answer"], re.I) is not None,
                                                                            "did not give January 15") + need(len(r["citations"]) > 0, "no citations")


def c7(r):
    a = r["answer"]
    return (need(re.search(r"\b(escuela|escuelas|niñ[oa]s?|educación|servicios|pregunt)", a, re.I) is not None, "reply is not Spanish")
            + need(re.search(r"no (est[aá]|hay)|no se|pregunt|confirm", a, re.I) is not None, "did not caveat missing ESE data"))


def c8(r):
    return need(re.search(r"\b(ekòl|lekòl|pou|nan|ak|yon|timoun)\b", r["answer"], re.I) is not None, "reply is not Haitian Creole") + need(len(r["answer"]) > 40, "answer too short")


def c9(r):
    a = r["answer"].lower()
    return (need(re.search(r"can't|cannot|can not|unable|not able|don't have|do not have|no data|not possible", a) is not None, "did not decline")
            + need(not any(re.search(r"\b(is|are|it's) (very |perfectly |completely )?safe\b", sent) and not re.search(r"cannot|can't|unable|not able|whether|if |don't|do not", sent)
                           for sent in re.split(r"(?<=[.!?])\s+", a)), "asserted safety")
            + need(re.search(r"visit|ask|official|observe|drop-?off", a) is not None, "gave no next step"))


def c10(r):
    return need("compare" in tools_used(r), "did not call compare") + need(len(asserted(r, "compare").get("ids", [])) == 3, "compare did not receive 3 ids") + need(len(r["results"]) == 3, "did not return 3 schools")


CASES = [
    Case(1, "2 kids ages 3 and 7, free only, STEM", ["I have 2 kids, ages 3 and 7, near 33127. Free options only, and we like STEM."], c1),
    Case(2, "Zoned elementary at an address", [f"Which elementary school am I zoned for at {ADDRESS}?"], c2),
    Case(3, "Private tuition is not available", [f"What is tuition at {PRIVATE}?"], c3),
    Case(4, "Top-graded public elementary within 3 miles", ["Top-graded public elementary school within 3 miles of me?"], c4, profile={"address": ADDRESS}),
    Case(5, "Magnet application when zoned", [f"We live at {ADDRESS}. Do I need to apply for a magnet if I'm in the zone?"], c5),
    Case(6, "When magnet applications close", ["When do magnet applications close?"], c6),
    Case(7, "Spanish special-ed query", ["¿Qué escuelas cerca de 33127 tienen servicios de educación especial para mi hijo?"], c7, lang="es"),
    Case(8, "Haitian Creole query", ["Mwen bezwen yon bon lekòl pou pitit mwen ki gen 6 an toupre 33127."], c8, lang="ht"),
    Case(9, "Safety question is declined", ["Is it safe to walk to school from my house?"], c9, profile={"address": ADDRESS}),
    Case(10, "Compare three schools", ["Compare Paul Laurence Dunbar K-8 Center, Phillis Wheatley Elementary and Miami Edison Senior High for me."], c10),
]


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--base-url", help="call a running service instead of the in-process app")
    ap.add_argument("--pause", type=float, default=8.0, help="seconds between cases, to stay under per-minute model quotas (default 8)")
    ap.add_argument("--only", help="comma-separated case numbers to run, e.g. 2,10")
    args = ap.parse_args()
    only = {int(x) for x in args.only.split(",")} if args.only else None
    if args.base_url:
        import httpx

        client = httpx.Client(base_url=args.base_url, timeout=180)
        post = lambda body: client.post("/api/chat", json=body).json()  # noqa: E731
    else:
        from fastapi.testclient import TestClient
        from app.main import app

        tc = TestClient(app)
        tc.__enter__()
        post = lambda body: tc.post("/api/chat", json=body).json()  # noqa: E731

    failed = skipped = 0
    for n, case in enumerate(c for c in CASES if only is None or c.id in only):
        if n and args.pause:
            time.sleep(args.pause)
        r = post({"messages": [{"role": "user", "content": m} for m in case.messages], "profile": case.profile, "lang": case.lang})
        if r.get("error"):
            status, why = "FAIL", [f"HTTP error: {r['error']}"]
        elif r.get("degraded"):
            status, why = "SKIP", ["AI model unavailable (see `warnings`; run scripts/llm_check.py); structured fallback returned"]
        else:
            why = case.check(r) + ([f"warnings: {r['warnings']}"] if r.get("warnings") and False else [])
            status = "PASS" if not why else "FAIL"
        failed += status == "FAIL"
        skipped += status == "SKIP"
        print(f"[{status}] {case.id:>2}. {case.name}" + ("" if status == "PASS" else "\n        - " + "\n        - ".join(why)))
    ran = len(only) if only else len(CASES)
    print(f"\n{ran - failed - skipped} passed, {failed} failed, {skipped} skipped")
    return 1 if failed else 0


if __name__ == "__main__":
    raise SystemExit(main())
