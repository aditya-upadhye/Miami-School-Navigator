"""One or two plain sentences on why a school is a good match for this family, written by the language model.

The model is given only the facts the match score was built from (the same `score()` the search ranks by, plus a few verified fields), with no
tools, so it can explain but not search or invent. When the model is not configured, fails, or writes something that does not hold up
(a dollar amount that is not in the facts), the answer is built from the score's own reasons instead and `ai` is false.
"""
from __future__ import annotations

import dataclasses
import json
import logging
import os
import re
from collections import OrderedDict

from ..chat.agent import _ungrounded_amounts
from ..chat.llm import PRESETS, Llm, LlmConfig, LlmUnavailable, default_llm
from ..domain import haversine_mi
from ..i18n import current_lang
from ..schemas import WhyMatchRequest, WhyMatchResponse
from .context import Navigator
from .schools import get_place, score, summarize
from .zones import zoned_for, zoned_place_ids

log = logging.getLogger("why_match")

LANG_NAME = {"en": "English", "es": "Spanish", "ht": "Haitian Creole"}
SYSTEM = (
    "You write the short 'why this match' note on a school card for a Miami-Dade family choosing a school.\n"
    "Write 1 or 2 short sentences (at most 40 words in total) in {language}, addressed to the family, saying why this school is a good match.\n"
    "Use ONLY the facts in the user message. Lead with the factors that earned the most match points. Do not invent anything: no tuition, ratings, "
    "test scores, rankings or claims that are not in the facts, and say nothing about data that is missing. Do not repeat the score as a number "
    "more than once. Plain text only: no markdown, bullets, quotes, emojis or school-name headings."
)
TIMEOUT_S = float(os.environ.get("WHY_MATCH_TIMEOUT", 30))  # a card note is not worth a long wait: past this the score's own reasons are shown
MAX_TOKENS = 200


def short_llm(timeout: float = TIMEOUT_S, max_tokens: int = MAX_TOKENS) -> Llm:
    """A model client for small card-sized notes: a short wait, a short answer, and the provider's fast non-thinking model when it has one
    (LLM_FAST_MODEL overrides; otherwise LLM_MODEL), never the chat's long timeouts."""
    cfg = LlmConfig.from_env()
    fast = os.environ.get("LLM_FAST_MODEL") or PRESETS.get(cfg.provider, {}).get("fast_model") or cfg.model
    return default_llm(dataclasses.replace(cfg, model=fast, timeout=timeout, max_tokens=max_tokens))


_CACHE: "OrderedDict[tuple, WhyMatchResponse]" = OrderedDict()
_CACHE_MAX = 512


def _value(field):
    return field.value if field is not None and field.status != "not_available" and field.value not in (None, "", []) else None


def _facts(nav: Navigator, req: WhyMatchRequest, school_id: str) -> tuple[dict, int, list[str]]:
    p = get_place(nav, school_id)
    zmap = zoned_place_ids(zoned_for(nav, req.lat, req.lon))
    prio = [x for x in req.priorities if x.strip()]
    pts, factors, reasons = score(p, haversine_mi(req.lat, req.lon, p["lat"], p["lon"]), req.radius_mi, zmap.get(p["id"]), True, prio, req.scholarship, req.values)
    s = summarize(nav, p, origin=(req.lat, req.lon), zoned_map=zmap)
    shown = {"type": s.kind.replace("_", " "), "grades": _value(s.grades), "miles_from_home": _value(s.distance_mi),
             "state_school_grade": _value(s.state_grade), "ela_learning_gains_pct": _value(s.gains_ela), "math_learning_gains_pct": _value(s.gains_math),
             "magnet_themes": _value(s.magnet_themes), "specialties": _value(s.specialties),
             "zoned_for_home_address": (_value(s.zoned) or {}).get("zoned") if _value(s.zoned) else None}
    facts = {"school": p["name"], "match_points": pts, "family_priorities": prio, "family_values": req.values,
             "score_factors": [{"factor": f.factor, "points": f.points, "out_of": f.max_points, "detail": f.detail} for f in factors],
             "reasons": reasons, "school_facts": {k: v for k, v in shown.items() if v is not None}}
    return facts, pts, reasons


def _fallback(reasons: list[str]) -> str:
    usable = [r.strip().rstrip(".") for r in reasons if r and not re.search(r"not scored", r, re.I)][:2]
    return (". ".join(usable) + ".") if usable else ""


def two_sentences(text: str, limit: int = 2) -> str:
    text = re.sub(r"\s+", " ", re.sub(r"[*_`#>]+", "", text)).strip().strip('"“”')
    parts = re.split(r"(?<=[.!?])\s+", text)
    return " ".join(parts[:limit]).strip()


def explain(nav: Navigator, school_id: str, req: WhyMatchRequest, llm: Llm | None = None) -> WhyMatchResponse:
    lang = current_lang()
    key = (school_id, lang, round(req.lat, 4), round(req.lon, 4), req.radius_mi, tuple(req.priorities), tuple(req.values), req.scholarship)
    if key in _CACHE:
        _CACHE.move_to_end(key)
        return _CACHE[key]
    facts, pts, reasons = _facts(nav, req, school_id)
    evidence = json.dumps(facts, ensure_ascii=False)
    text, ai = "", False
    try:
        turn = (llm or short_llm()).create(system=SYSTEM.format(language=LANG_NAME.get(lang, "English")), tools=[], force_no_tools=True,
                                              messages=[{"role": "user", "content": evidence}])
        text = two_sentences(turn.text)
        ai = bool(text) and not _ungrounded_amounts(text, evidence)
    except LlmUnavailable as exc:  # not configured, timed out, rate limited or unreachable
        log.warning("why-match: model unavailable: %s", exc)
    out = WhyMatchResponse(id=school_id, summary=text if ai else _fallback(reasons), ai=ai, match_score=pts)
    if ai:  # a fallback is not cached, so the model gets another chance on the next open
        _CACHE[key] = out
        while len(_CACHE) > _CACHE_MAX:
            _CACHE.popitem(last=False)
    return out
