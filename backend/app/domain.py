"""Small pure helpers shared by ingestion and request handling: stages, grade parsing, distance."""
from __future__ import annotations

import math
import re

STAGES = ["infant_toddler", "pre_k", "elementary", "middle", "high"]
STAGE_LABELS = {
    "infant_toddler": "Infant & toddler care",
    "pre_k": "Pre-K",
    "elementary": "Elementary (K-5)",
    "middle": "Middle (6-8)",
    "high": "High (9-12)",
}
KINDS = ["public", "charter", "private", "early_learning"]
GRADE_ORDER = {"A": 4, "B": 3, "C": 2, "D": 1, "F": 0}


def stage_for_age(age: int) -> str | None:
    """Stage a child of this age (as of the school year) belongs to; None once past 12th grade."""
    if age < 0:
        return None
    if age < 3:
        return "infant_toddler"
    if age < 5:
        return "pre_k"
    if age < 11:
        return "elementary"  # age 5 = kindergarten
    if age < 14:
        return "middle"
    if age < 18:
        return "high"
    return None


def grade_label_for_age(age: int) -> str | None:
    if age < 1:
        return "Infant care"
    if age < 3:
        return "Toddler care"
    if age == 3:
        return "Pre-K 3"
    if age == 4:
        return "VPK (Pre-K 4)"
    if age == 5:
        return "Kindergarten"
    if age <= 17:
        return f"Grade {age - 5}"
    return None


_TOKEN = r"(?:PREK|PK\d?|KG|K|\d{1,2})"
_RANGE = re.compile(rf"^({_TOKEN})-({_TOKEN})$")
_PK_PLUS_RANGE = re.compile(r"^PK(\d{1,2})-(\d{1,2})$")  # e.g. "PK6-12" means PK plus grades 6-12


def _level(tok: str) -> int | None:
    tok = tok.upper()
    if tok in {"PREK"} or re.fullmatch(r"PK\d?", tok):
        return -1
    if tok in {"K", "KG"}:
        return 0
    if tok.isdigit() and 1 <= int(tok) <= 12:
        return int(tok)
    return None


def parse_grades(text: str | None) -> list[int]:
    """'PK-5' -> [-1, 0, 1, 2, 3, 4, 5]; PK = -1, K = 0. Unknown or '0' -> []."""
    if not text:
        return []
    t = re.sub(r"\s+", "", text.upper().replace("–", "-").replace("—", "-")).replace("TO", "-")
    if t in {"", "0", "N/A", "NA"}:
        return []
    m = _PK_PLUS_RANGE.match(t)
    if m and int(m.group(1)) >= 4:  # PK6-12 -> PK + 6..12 (PK3-5 stays an ordinary range)
        lo, hi = int(m.group(1)), int(m.group(2))
        return [-1] + list(range(lo, hi + 1))
    m = _RANGE.match(t)
    if m:
        lo, hi = _level(m.group(1)), _level(m.group(2))
        if lo is not None and hi is not None and lo <= hi:
            return list(range(lo, hi + 1))
        return []
    single = _level(t)
    return [single] if single is not None else []


def stages_for_grades(levels: list[int]) -> list[str]:
    out: set[str] = set()
    for g in levels:
        if g == -1:
            out.add("pre_k")
        elif 0 <= g <= 5:
            out.add("elementary")
        elif 6 <= g <= 8:
            out.add("middle")
        elif 9 <= g <= 12:
            out.add("high")
    return [s for s in STAGES if s in out]


def haversine_mi(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    r = 3958.7613  # Earth radius in miles
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dp, dl = p2 - p1, math.radians(lon2 - lon1)
    a = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return 2 * r * math.asin(math.sqrt(a))


def bbox_for_radius(lat: float, lon: float, radius_mi: float) -> tuple[float, float, float, float]:
    dlat = radius_mi / 69.0
    dlon = radius_mi / (69.17 * max(math.cos(math.radians(lat)), 0.01))
    return lat - dlat, lat + dlat, lon - dlon, lon + dlon


def norm_text(s: str | None) -> str:
    """Lowercase, strip punctuation and common suffixes; used for fuzzy joins."""
    s = re.sub(r"[^a-z0-9 ]+", " ", (s or "").lower())
    s = re.sub(r"\b(the|inc|llc|school|schools|academy)\b", " ", s)
    return re.sub(r"\s+", " ", s).strip()
