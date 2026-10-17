"""Why this school could suit this family's child, in a couple of plain sentences, for the signed-in family's school page.

Two layers so the page is fast and never wrong about the basics:
  1. Grade fit, computed here from the child's age and the school's grade range (instant, no model). It is also the fallback text.
  2. The language model turns those facts plus the school's verified data into 1-2 warm, short sentences per child, with a short timeout.
The model sees only grade fit, the school's verified fields and the family's stated priorities. It is told not to guess about the child.
"""
from __future__ import annotations

import json
import logging
import os
from collections import OrderedDict

from ..chat.agent import _ungrounded_amounts
from ..chat.llm import Llm, LlmUnavailable
from ..domain import STAGE_LABELS, STAGES, grade_label_for_age, haversine_mi, parse_grades, stage_for_age
from ..i18n import current_lang, t
from ..schemas import ChildFitRequest, ChildFitResponse
from .context import Navigator
from .schools import get_place, summarize
from .why_match import LANG_NAME, short_llm, two_sentences
from .zones import zoned_for, zoned_place_ids

log = logging.getLogger("child_fit")

TIMEOUT_S = float(os.environ.get("CHILD_FIT_TIMEOUT", 12))  # the page must not wait on the model: past this the grade-fit sentence stands alone
MAX_TOKENS = 160
SYSTEM = (
    "You write a short note on a school's page for a signed-in Miami-Dade parent: why this school could be a good fit for their child.\n"
    "Write in {language}. For each child give 1 short sentence (2 at most), warm and plain, naming the child when a name is given. "
    "Use ONLY the facts in the user message. Start from the grade fit: if the school does not serve the child's grade, say so plainly and do not "
    "call it a fit. Do not guess the child's interests, needs or abilities, and do not invent tuition, ratings, rankings or programs. "
    "Skip anything not in the facts. Plain text only: no markdown, bullets, quotes or emojis."
)
_CACHE: "OrderedDict[tuple, ChildFitResponse]" = OrderedDict()
_CACHE_MAX = 512


def _grade_fit(age: int, grades_text: str | None, school_stages: list[str]) -> dict:
    """Is the school's grade range right for a child of this age? Grade level: PK=-1, K=0, then 1..12 (age 5 = K, ages 3-4 = PK)."""
    level = -1 if age in (3, 4) else age - 5 if 5 <= age <= 17 else None
    levels = parse_grades(grades_text)
    if level is not None and levels:
        lo, hi = min(levels), max(levels)
        if lo <= level <= hi:
            return {"fit": "serves", "years_left": hi - level + 1, "last_grade": _grade_name(hi)}
        return {"fit": "later" if level < lo else "ended", "first_grade": _grade_name(lo), "last_grade": _grade_name(hi)}
    stage, known = stage_for_age(age), [x for x in STAGES if x in school_stages]
    if stage and known:  # no usable grade range (e.g. a child-care centre): compare the child's stage with the stages the school serves
        if stage in known:
            return {"fit": "serves", "last_grade": STAGE_LABELS[known[-1]]}
        return {"fit": "later" if STAGES.index(stage) < STAGES.index(known[0]) else "ended",
                "first_grade": STAGE_LABELS[known[0]], "last_grade": STAGE_LABELS[known[-1]]}
    return {"fit": "unknown"}


def _grade_name(level: int | None) -> str:
    return "Pre-K" if level == -1 else "Kindergarten" if level == 0 else f"grade {level}" if level is not None else ""


def _child_label(c, i: int) -> str:
    return (c.name or "").strip() or t("fit.your_child")


def _fallback(children, fits: list[dict]) -> str:
    out = []
    for i, (c, f) in enumerate(zip(children, fits)):
        who = _child_label(c, i)
        if f["fit"] == "serves":
            out.append(t("fit.serves", who=who, age=c.age, grade=grade_label_for_age(c.age) or ""))
        elif f["fit"] == "later":
            out.append(t("fit.later", who=who, first=f["first_grade"]))
        elif f["fit"] == "ended":
            out.append(t("fit.ended", who=who, last=f["last_grade"]))
        else:
            out.append(t("fit.unknown", who=who))
    return " ".join(out)


def explain(nav: Navigator, school_id: str, req: ChildFitRequest, llm: Llm | None = None) -> ChildFitResponse:
    lang = current_lang()
    children = req.children[:4]
    key = (school_id, lang, tuple((c.age, (c.name or "").strip()) for c in children), tuple(req.priorities), tuple(req.values),
           round(req.lat, 3) if req.lat is not None else None, round(req.lon, 3) if req.lon is not None else None)
    if req.ai and key in _CACHE:
        _CACHE.move_to_end(key)
        return _CACHE[key]
    p = get_place(nav, school_id)
    origin = (req.lat, req.lon) if req.lat is not None and req.lon is not None else None
    zmap = zoned_place_ids(zoned_for(nav, *origin)) if origin else None
    s = summarize(nav, p, origin=origin, zoned_map=zmap)
    fits = [_grade_fit(c.age, p["grades_text"], p["stages"]) for c in children]
    fallback = _fallback(children, fits)
    if not req.ai:
        return ChildFitResponse(id=school_id, summary=fallback, ai=False)

    def val(f):
        return f.value if f is not None and f.status != "not_available" and f.value not in (None, "", []) else None

    care = val(s.aftercare)
    school = {"name": p["name"], "type": s.kind.replace("_", " "), "grades": val(s.grades), "state_school_grade": val(s.state_grade),
              "ela_learning_gains_pct": val(s.gains_ela), "math_learning_gains_pct": val(s.gains_math), "magnet_themes": val(s.magnet_themes),
              "specialties": val(s.specialties), "free_tuition": True if val(s.tuition) == 0 else None,
              "before_or_after_care": ("before and after school" if care.get("before_care") and care.get("after_care") else "after school" if care.get("after_care") else "before school" if care.get("before_care") else None) if isinstance(care, dict) else None,
              "miles_from_home": round(haversine_mi(*origin, p["lat"], p["lon"]), 1) if origin else None}
    facts = {"school": {k: v for k, v in school.items() if v is not None}, "family_priorities": req.priorities, "family_values": req.values,
             "children": [{"name": (c.name or "").strip() or None, "age": c.age, "grade_next": grade_label_for_age(c.age), **f} for c, f in zip(children, fits)]}
    evidence = json.dumps(facts, ensure_ascii=False)
    text, ai = "", False
    try:
        turn = (llm or short_llm(TIMEOUT_S, MAX_TOKENS)).create(system=SYSTEM.format(language=LANG_NAME.get(lang, "English")), tools=[],
                                                               force_no_tools=True, messages=[{"role": "user", "content": evidence}])
        text = two_sentences(turn.text, limit=2 * len(children))
        ai = bool(text) and not _ungrounded_amounts(text, evidence)
    except LlmUnavailable as exc:  # not configured, too slow, rate limited or unreachable
        log.warning("child-fit: model unavailable: %s", exc)
    out = ChildFitResponse(id=school_id, summary=text if ai else fallback, ai=ai)
    if ai:
        _CACHE[key] = out
        while len(_CACHE) > _CACHE_MAX:
            _CACHE.popitem(last=False)
    return out
