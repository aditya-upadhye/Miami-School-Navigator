"""School summaries, search with a transparent match score, and school detail."""
from __future__ import annotations

import json
import re
import sqlite3
from datetime import date

from ..domain import GRADE_ORDER, STAGES, bbox_for_radius, haversine_mi, norm_text
from ..i18n import t as tr  # `t` is a common loop variable in this module
from ..schemas import (ApplyStep, LookupHit, LookupResponse, Field, Nearby, Provenance, ScoreFactor, SchoolDetail, SchoolSummary, SearchMeta,
                       SearchResponse, ZonesResult)
from .context import Navigator
from .errors import ApiError
from .zones import zoned_for, zoned_place_ids

# --- match score weights (documented in README; the breakdown of every score is returned to the client) ---
# Distance used to carry 30 of 100 points; it is now 15, so a better fit a little farther away can outrank the closest school. The family's travel
# limit (`radius_mi`) is still a hard cutoff: nothing beyond it is ever suggested.
W_ZONED, W_DISTANCE, W_GRADE, W_PRIORITY, W_SCHOLARSHIP, W_POPULARITY = 15, 15, 20, 15, 10, 10
# What the family says matters most (`values`) multiplies the weight of the factors it names, for that family only.
VALUES = ("academics", "programs", "popularity", "proximity")
VALUE_BOOST = {"academics": {"state_grade": 2.5}, "programs": {"priorities": 2.5}, "popularity": {"popularity": 3.0},
               "proximity": {"distance": 2.0, "zoned": 2.0}}
# A factor that cannot be scored for a school (no state grade, no enrollment numbers, a kind of school the state does not grade) counts as
# NEUTRAL: half of its points, shown in the breakdown. It is neither a guess about the school nor a way to hide the gap: it only stops a
# school we know nothing about from beating one that is known to be good just because it is a little closer.
NEUTRAL = 0.5
GRADE_POINTS = {"A": 1.0, "B": 0.75, "C": 0.4, "D": 0.15, "F": 0.0}

# Specialty keywords found in an *official school name*. This is a weak signal and is labelled `derived`.
SPECIALTY_PATTERNS = {
    "STEM": r"\b(stem|steam|science|engineering|robotics|aerospace|aviation|technology)\b",
    "Arts": r"\b(arts?|music|theat(?:er|re)|dance|performing)\b",
    "Montessori": r"\bmontessori\b",
    "Bilingual": r"\b(bilingual|dual[- ]language)\b",
    "International": r"\binternational\b",
    "IB": r"\b(ib|baccalaureate)\b",
}
SPECIALTY_ALIASES = {"steam": "STEM", "science": "STEM", "technology": "STEM", "art": "Arts", "dual language": "Bilingual",
                     "dual-language": "Bilingual", "bilingual / dual language": "Bilingual", "montessori": "Montessori"}


def canonical_specialty(s: str) -> str:
    key = s.strip().lower()
    if key in SPECIALTY_ALIASES:
        return SPECIALTY_ALIASES[key]
    for name in list(SPECIALTY_PATTERNS) + []:
        if key == name.lower():
            return name
    return s.strip()


def _keywords(name: str) -> list[str]:
    return [k for k, pat in SPECIALTY_PATTERNS.items() if re.search(pat, name, re.I)]


ONLINE_NAME = re.compile(r"\b(online|virtual)\b", re.I)


def is_online(p: dict) -> bool:
    """Virtual schools have an office address but no campus; ranking them by distance would be misleading."""
    return bool(ONLINE_NAME.search(p["name"]))


def _rfield(nav: Navigator, p: dict, key: str, value=None) -> Field | None:
    """A researched value (data/curated/school_research.json) as a Field carrying its own source URL, date and confidence."""
    r = (p["extra"].get("research") or {}).get(key)
    if not r:
        return None
    conf = r.get("confidence") if r.get("confidence") in ("high", "medium", "low") else "medium"
    method = tr("m.researched", confidence=tr(f"conf.{conf}"))
    note = (r.get("note") or "").strip()
    if note:
        method += " " + (note if len(note) <= 300 else note[:297] + "...")
    return Field(value=r["value"] if value is None else value, status=r["status"], source=r["source"], url=r.get("url"),
                 as_of=r.get("as_of") or nav.prov("school_research").as_of or date.today().isoformat(), method=method)


def row_to_place(r: sqlite3.Row) -> dict:
    d = dict(r)
    d["stages"] = json.loads(d.pop("stage_flags") or "[]")
    d["themes"] = json.loads(d["magnet_themes"]) if d.get("magnet_themes") else []
    d["scholarships"] = json.loads(d["scholarship_flags"]) if d.get("scholarship_flags") else None
    d["extra"] = json.loads(d.get("extra") or "{}")
    return d


def get_place(nav: Navigator, place_id: str) -> dict:
    r = nav.conn.execute("SELECT * FROM places WHERE id=?", (place_id,)).fetchone()
    if r is None:
        raise ApiError(404, "school_not_found", params={"id": place_id})
    return row_to_place(r)


# ---------------------------------------------------------------- summaries
def summarize(nav: Navigator, p: dict, *, origin: tuple[float, float] | None = None, zoned_map: dict[str, str] | None = None) -> SchoolSummary:
    layer, kind = p["source_layer"], p["kind"]
    na = nav.not_available

    # stages (parsed from the grade range)
    if p["grades_text"] and kind != "early_learning":
        stages = nav.derived(p["stages"], layer, tr("m.stages", range=p["grades_text"]))
    elif kind == "early_learning":
        stages = nav.derived(p["stages"], layer, tr("m.stages_care"))
    else:
        stages = na(tr("na.stages.why"), tr("act.ask_grades"), checked=layer)

    grades = (nav.official(p["grades_text"], layer, tr("m.grades"))
              if p["grades_text"] else
              na(tr("na.grades.why"), tr("act.ask_ages") if kind == "early_learning" else tr("act.ask_grades"), checked=layer))

    # distance + zoning
    distance = zoned = None
    if origin:
        d = round(haversine_mi(origin[0], origin[1], p["lat"], p["lon"]), 2)
        distance = nav.derived(d, layer, tr("m.distance") + (tr("m.distance.online") if is_online(p) else ""))
        if kind == "public" and zoned_map is not None:
            level = zoned_map.get(p["id"])
            zoned = nav.derived({"zoned": level is not None, "level": level}, "county_zone_" + (level or "elementary"),
                                tr("m.zoned"))

    # state grade + learning gains (public and charter only)
    state = p["extra"].get("state", {})
    if kind in ("public", "charter"):
        if p["state_grade"]:
            method = tr("m.state_grade", year=p["state_grade_year"] or tr("m.latest_year"))
            if state.get("state_school_name"):
                method += tr("m.state_check", state_name=state["state_school_name"], name=p["name"], confidence=p["join_confidence"])
            state_grade = nav.official(p["state_grade"], "fldoe_school_grades", method,
                                       as_of=str(p["state_grade_year"]) if p["state_grade_year"] else None)
        elif nav.has("fldoe_school_grades") and p["state_key"]:
            state_grade = na(tr("na.state_grade.none.why", reason=state.get("grade_note") or tr("na.state_grade.default_reason")),
                             tr("act.ask_nograde"), checked="fldoe_school_grades")
        elif nav.has("fldoe_school_grades"):
            state_grade = na(tr("na.state_grade.nomatch.why"), tr("act.check_fldoe_grade"), checked="fldoe_school_grades")
        else:
            state_grade = na(tr("na.state_grade.notloaded.why"), tr("act.see_fldoe_grades"))
        gains_ela = (nav.official(p["gains_ela"], "fldoe_learning_gains", tr("m.gains_ela"))
                     if p["gains_ela"] is not None else na(tr("na.gains_ela.why"), tr("act.ask_school"), checked="fldoe_learning_gains") if nav.has("fldoe_learning_gains")
                     else na(tr("na.gains.notloaded.why"), tr("act.see_fldoe_gains")))
        gains_math = (nav.official(p["gains_math"], "fldoe_learning_gains", tr("m.gains_math"))
                      if p["gains_math"] is not None else na(tr("na.gains_math.why"), tr("act.ask_school"), checked="fldoe_learning_gains") if nav.has("fldoe_learning_gains")
                      else na(tr("na.gains.notloaded.why"), tr("act.see_fldoe_gains")))
    else:
        state_grade = gains_ela = gains_math = na(tr("na.state_only.why"), tr("act.ask_results"))
    state_grade = _rfield(nav, p, "state_grade") or state_grade
    gains_ela = _rfield(nav, p, "gains_ela") or gains_ela
    gains_math = _rfield(nav, p, "gains_math") or gains_math

    enrollment = (nav.official(p["enrollment"], "fldoe_enrollment" if state.get("enrollment_fldoe") else layer,
                               tr("m.enrollment_fldoe" if state.get("enrollment_fldoe") else "m.enrollment"))
                  if p["enrollment"] else na(tr("na.enrollment.why"), tr("act.ask_school"), checked=layer))
    enrollment = _rfield(nav, p, "enrollment") or enrollment

    # tuition: free for public/charter by definition; otherwise there is no dataset and we never guess
    if kind in ("public", "charter"):
        tuition = nav.derived(0, layer, tr("m.tuition_free"))
    elif kind == "private":
        tuition = na(tr("na.tuition.private.why"), tr("act.ask_tuition"), checked=layer)
    else:
        tuition = na(tr("na.tuition.care.why"), tr("act.ask_rates"), checked=layer)
    if kind == "private" and "tuition" in (p["extra"].get("research") or {}):
        tuition = _rfield(nav, p, "tuition")
    aftercare = na(tr("na.aftercare.why"), tr("act.ask_care"), checked=layer)
    care = (p["extra"].get("research") or {}).get("aftercare")
    if care:
        aftercare = _rfield(nav, p, "aftercare")  # structured value; the client words it in the family's language

    # magnet + specialties. Order of trust: the hand-curated magnet file, then researched values, then name keywords.
    research = p["extra"].get("research") or {}
    curated_magnet = bool(p["is_magnet"]) and "is_magnet" not in research
    if curated_magnet:
        meta = p["extra"].get("magnet", {})
        is_magnet = nav.curated(True, nav.prov("curated_magnet_themes").source, meta.get("catalog_url") or nav.prov("curated_magnet_themes").url,
                                meta.get("verified_on"), tr("m.magnet_verified", who=meta.get("verified_by") or tr("m.project_member")))
    elif "is_magnet" in research:
        is_magnet = _rfield(nav, p, "is_magnet")
    elif kind == "public":
        is_magnet = na(tr("na.magnet.unverified.why"), tr("act.check_magnets"), checked="curated_magnet_themes")
    else:
        is_magnet = na(tr("na.magnet.nonpublic.why"), tr("act.ask_programs"))

    if curated_magnet and p["themes"]:
        magnet_themes = nav.curated(p["themes"], nav.prov("curated_magnet_themes").source, nav.prov("curated_magnet_themes").url,
                                    p["extra"].get("magnet", {}).get("verified_on"), tr("m.themes"))
    elif "magnet_themes" in research:
        magnet_themes = _rfield(nav, p, "magnet_themes")
    elif is_magnet.status != "not_available" and is_magnet.value is False:
        magnet_themes = is_magnet.model_copy(update={"value": []})
    else:
        magnet_themes = is_magnet if is_magnet.status == "not_available" else na(tr("na.specialties.why"), tr("act.ask_programs"), checked=layer)

    if "specialties" in research:  # normalised tags (STEM, Arts, ...) match the filter chips; the full magnet themes have their own row
        specialties = _rfield(nav, p, "specialties")
    elif curated_magnet and p["themes"]:
        specialties = magnet_themes
    elif "magnet_themes" in research:
        specialties = magnet_themes
    elif _keywords(p["name"]):
        specialties = nav.derived(_keywords(p["name"]), layer, tr("m.keywords"))
    else:
        specialties = na(tr("na.specialties.why"), tr("act.ask_programs"), checked=layer)

    # ESE + scholarships
    if "ese" in research:
        ese = _rfield(nav, p, "ese", (research["ese"].get("details") or True) if research["ese"]["value"] else False)
    elif p["ese_signal"] == "special_center":
        ese = nav.derived(True, layer, tr("m.ese_center"))
    elif p["ese_signal"] == "directory_flag":
        ese = nav.reported(True, "fldoe_private_directory", tr("m.ese_flag"))
    else:
        ese = na(tr("na.ese.why"), tr("act.ask_ese"), checked=layer)
    if kind == "private":
        if p["scholarships"] is not None:
            scholarship = nav.reported(p["scholarships"], "fldoe_private_directory", tr("m.scholarship_flag"))
        else:
            scholarship = na(tr("na.scholarship.notloaded.why"), tr("act.ask_scholarship"), checked="fldoe_private_directory")
    else:
        scholarship = na(tr("na.scholarship.nonprivate.why"), tr("act.none_needed"))

    if kind == "private" and "scholarships" in research:
        scholarship = _rfield(nav, p, "scholarships")
    phone = (nav.official(p["phone"], layer, tr("m.county_listing")) if p["phone"] else na(tr("na.phone.why"), tr("act.search_site"), checked=layer))
    website = (nav.official(p["website"], layer, tr("m.county_listing")) if p["website"] else
               na(tr("na.website.why"), tr("act.search_page"), checked=layer))
    phone = _rfield(nav, p, "phone") or phone
    website = _rfield(nav, p, "website") or website

    def proficiency(key: str) -> Field:
        if state.get(key) is not None:
            return nav.official(state[key], "fldoe_school_grades", tr(f"m.{key}"))
        return na(tr("na.proficiency.why"), tr("act.ask_school"), checked=layer)

    proficiency_ela = _rfield(nav, p, "proficiency_ela") or proficiency("proficiency_ela")
    proficiency_math = _rfield(nav, p, "proficiency_math") or proficiency("proficiency_math")
    school_hours = _rfield(nav, p, "school_hours") or na(tr("na.hours.why"), tr("act.ask_school"), checked=layer)
    application_method = _rfield(nav, p, "application_method")
    if application_method is None:  # derived from how the school is run, with the curated rule it follows as the source
        if kind == "charter" and nav.rule("charter_lottery"):
            application_method = nav.rule_field("charter_lottery", "charter_lottery")
        elif zoned is not None and zoned.value.get("zoned"):
            application_method = nav.derived("zoned", "county_zone_" + zoned.value["level"], tr("m.zoned"))
        elif is_magnet.value is True and nav.rule("magnet_how_to_apply"):
            application_method = nav.rule_field("magnet_how_to_apply", "magnet_application")
        else:
            application_method = na(tr("na.apply.why"), tr("act.ask_school"), checked=layer)

    license_field = None
    if kind == "early_learning" and layer == "county_daycare":
        ex = p["extra"]
        if ex.get("license_number") or ex.get("license_expires"):
            expired = bool(ex.get("license_expires")) and ex["license_expires"] < date.today().isoformat()
            license_field = nav.official({"number": ex.get("license_number"), "expires": ex.get("license_expires"), "expired_per_county_record": expired},
                                         layer, tr("m.license"))
        else:
            license_field = na(tr("na.license.why"), tr("act.ask_license"), checked=layer)

    prov = nav.prov(layer)
    return SchoolSummary(
        id=p["id"], kind=kind, name=p["name"], address=p["address"], city=p["city"], zip=p["zip"], lat=p["lat"], lon=p["lon"],
        identity_source=Provenance(source=prov.source, url=prov.url, as_of=prov.as_of),
        stages=stages, grades=grades, distance_mi=distance, zoned=zoned, state_grade=state_grade, gains_ela=gains_ela,
        gains_math=gains_math, enrollment=enrollment, tuition=tuition, aftercare=aftercare, is_magnet=is_magnet,
        magnet_themes=magnet_themes, specialties=specialties, ese=ese, scholarship=scholarship, phone=phone, website=website,
        proficiency_ela=proficiency_ela, proficiency_math=proficiency_math, school_hours=school_hours,
        application_method=application_method, license=license_field,
        flags=((["online_school"] if is_online(p) else []) +
               (["grade_match_unverified"] if state.get("state_school_name") and p["state_grade"] and "state_grade" not in research else [])))


# ---------------------------------------------------------------- scoring
def _specialty_set(p: dict) -> set[str]:
    tags = ((p["extra"].get("research") or {}).get("specialties") or {}).get("value") or []
    return {t.lower() for t in p["themes"]} | {k.lower() for k in _keywords(p["name"])} | {t.lower() for t in tags}


def seat_utilization(p: dict) -> float | None:
    """Enrollment divided by capacity: how full the school is. The only demand signal the county data has (it publishes no
    applications, waitlists or ratings). None when either number is missing."""
    enrolled, capacity = p.get("enrollment"), p.get("capacity")
    return enrolled / capacity if enrolled and capacity else None


def score(p: dict, distance_mi: float, radius_mi: float, zoned_level: str | None, zones_known: bool,
          priorities: list[str], scholarship_wanted: bool, values: list[str] | None = None) -> tuple[int, list[ScoreFactor], list[str]]:
    """Weighted sum over the factors that apply to this school. Every factor is returned so the score can be audited."""
    factors: list[ScoreFactor] = []
    reasons: list[str] = []
    boost: dict[str, float] = {}
    for v in values or []:
        boost.update(VALUE_BOOST.get(v, {}))

    def add(name: str, pts: float, mx: float, detail: str, reason: str | None = None):
        factors.append(ScoreFactor(factor=name, points=round(pts, 1), max_points=mx, detail=detail))
        if reason:
            reasons.append(reason)

    W_ZONED_, W_DISTANCE_ = W_ZONED * boost.get("zoned", 1), W_DISTANCE * boost.get("distance", 1)
    W_GRADE_, W_PRIORITY_ = W_GRADE * boost.get("state_grade", 1), W_PRIORITY * boost.get("priorities", 1)

    if p["kind"] == "public" and zones_known:
        if zoned_level:
            add("zoned", W_ZONED_, W_ZONED_, tr("score.zoned.detail", level=tr(f"level.{zoned_level}")), tr("score.zoned.reason", level=tr(f"level.{zoned_level}")))
        else:
            add("zoned", 0, W_ZONED_, tr("score.zoned.not"))
    if is_online(p):
        reasons.append(tr("score.online"))  # not scored: no distance points, and not counted as possible
    else:
        dist_pts = W_DISTANCE_ * max(0.0, 1 - distance_mi / radius_mi) if radius_mi > 0 else W_DISTANCE_
        add("distance", dist_pts, W_DISTANCE_, tr("score.distance.detail", distance=f"{distance_mi:.1f}", radius=f"{radius_mi:g}"),
            tr("score.distance.reason", distance=f"{distance_mi:.1f}"))
    if p["kind"] in ("public", "charter"):
        if p["state_grade"]:
            add("state_grade", W_GRADE_ * GRADE_POINTS[p["state_grade"]], W_GRADE_, tr("score.grade.detail", grade=p["state_grade"], year=p["state_grade_year"]),
                tr("score.grade.reason", grade=p["state_grade"]) + (f" ({p['state_grade_year']})" if p["state_grade_year"] else ""))
        else:
            add("state_grade", W_GRADE_ * NEUTRAL, W_GRADE_, tr("score.grade.neutral"), tr("score.grade.none"))
    else:
        add("state_grade", W_GRADE_ * NEUTRAL, W_GRADE_, tr("score.grade.private"))
    if priorities:
        have = _specialty_set(p)
        hits = [x for x in priorities if canonical_specialty(x).lower() in have]
        add("priorities", W_PRIORITY_ * len(hits) / len(priorities), W_PRIORITY_, tr("score.priorities.detail", hits=len(hits), total=len(priorities)),
            (tr("score.priorities.reason", hits=", ".join(hits)) if hits else None))
    if p["kind"] == "private" and scholarship_wanted:
        ok = bool(p["scholarships"])
        add("scholarship", W_SCHOLARSHIP if ok else 0, W_SCHOLARSHIP, tr("score.scholarship.yes") if ok else tr("score.scholarship.no"),
            tr("score.scholarship.yes") if ok else None)
    util = seat_utilization(p)
    if util is not None:
        pct = round(100 * util)
        add("popularity", W_POPULARITY * boost.get("popularity", 1) * min(1.0, max(0.0, (util - 0.5) / 0.5)), W_POPULARITY * boost.get("popularity", 1),
            tr("score.popularity.detail", pct=pct, enrolled=p["enrollment"], capacity=p["capacity"]),
            tr("score.popularity.reason", pct=pct) if util >= 0.9 else None)
    else:
        add("popularity", W_POPULARITY * boost.get("popularity", 1) * NEUTRAL, W_POPULARITY * boost.get("popularity", 1), tr("score.popularity.neutral"))
    earned, possible = sum(f.points for f in factors), sum(f.max_points for f in factors)
    return (round(100 * earned / possible) if possible else 0), factors, reasons


# ---------------------------------------------------------------- search
def data_available(nav: Navigator) -> dict[str, bool]:
    """Which optional datasets actually have values, so a client can disable a filter that could never match."""
    def has(col: str) -> bool:
        return nav.conn.execute(f"SELECT 1 FROM places WHERE {col} IS NOT NULL LIMIT 1").fetchone() is not None

    return {"state_grades": has("state_grade"), "learning_gains": has("gains_ela"), "scholarship_flags": has("scholarship_flags"),
            "magnet_themes": has("magnet_themes"), "ese_signals": has("ese_signal")}


def search(nav: Navigator, *, lat: float, lon: float, radius_mi: float = 3.0, kinds: list[str] | None = None,
           stages: list[str] | None = None, free_only: bool = False, grade_min: str | None = None,
           specialties: list[str] | None = None, ese: bool = False, scholarship: bool = False, sort: str = "match",
           limit: int = 20, priorities: list[str] | None = None, q: str | None = None,
           values: list[str] | None = None) -> SearchResponse:
    if not (0 < radius_mi <= 25):
        raise ApiError(422, "bad_radius")
    if grade_min and grade_min.upper() not in GRADE_ORDER:
        raise ApiError(422, "bad_grade")
    for s_ in stages or []:
        if s_ not in STAGES:
            raise ApiError(422, "bad_stage", params={"stage": s_, "stages": ", ".join(STAGES)})
    for v in values or []:
        if v not in VALUES:
            raise ApiError(422, "bad_values", params={"value": v, "values": ", ".join(VALUES)})
    limit = max(1, min(limit, 100))
    zones = zoned_for(nav, lat, lon)  # also validates that the point is inside Miami-Dade
    zmap = zoned_place_ids(zones)

    la0, la1, lo0, lo1 = bbox_for_radius(lat, lon, radius_mi)
    sql, args = "SELECT * FROM places WHERE lat BETWEEN ? AND ? AND lon BETWEEN ? AND ?", [la0, la1, lo0, lo1]
    if kinds:
        sql += f" AND kind IN ({','.join('?' * len(kinds))})"
        args += kinds
    want_spec = [canonical_specialty(x).lower() for x in (specialties or [])]
    prio = [x for x in (priorities or []) if x.strip()]
    q_tokens = norm_text(q).split() if q else []
    excluded: dict[str, int] = {}
    cands = []
    for r in nav.conn.execute(sql, args):
        p = row_to_place(r)
        if p["extra"].get("hidden"):  # closed or duplicate record (see data/curated/school_research.json)
            continue
        d = haversine_mi(lat, lon, p["lat"], p["lon"])
        if d > radius_mi:
            continue

        def drop(why: str) -> None:
            excluded[why] = excluded.get(why, 0) + 1

        if q_tokens and not all(t in norm_text(p["name"]) for t in q_tokens):
            drop("name"); continue
        if stages and not set(stages) & set(p["stages"]):
            drop("stage"); continue
        if free_only and p["kind"] in ("private", "early_learning"):
            drop("free_only"); continue
        if grade_min and not (p["state_grade"] and GRADE_ORDER[p["state_grade"]] >= GRADE_ORDER[grade_min.upper()]):
            drop("grade_min"); continue
        if want_spec and not any(w in _specialty_set(p) for w in want_spec):
            drop("specialties"); continue
        if ese and not p["ese_signal"]:
            drop("ese"); continue
        if scholarship and not p["scholarships"]:
            drop("scholarship"); continue
        cands.append((p, d))

    scored = []
    for p, d in cands:
        pts, factors, reasons = score(p, d, radius_mi, zmap.get(p["id"]), True, prio, scholarship, values)
        scored.append((p, d, pts, factors, reasons))
    if sort == "distance":
        scored.sort(key=lambda t: (is_online(t[0]), t[1], t[0]["name"]))  # online schools have no campus: never "closest"
    elif sort == "grade":
        scored.sort(key=lambda t: (-GRADE_ORDER.get(t[0]["state_grade"], -1), is_online(t[0]), t[1]))
    elif sort == "name":
        scored.sort(key=lambda t: t[0]["name"].lower())
    elif sort == "match":
        scored.sort(key=lambda t: (-t[2], t[1]))
    else:
        raise ApiError(422, "bad_sort")

    results = []
    for p, d, pts, factors, reasons in scored[:limit]:
        s = summarize(nav, p, origin=(lat, lon), zoned_map=zmap)
        s.match_score, s.score_breakdown, s.reasons = pts, factors, reasons
        results.append(s)

    notes: list[str] = []
    if free_only:
        notes.append(tr("note.search.free_only"))
    if grade_min:
        notes.append(tr("note.search.grade_min") + ("" if nav.has("fldoe_school_grades") else tr("note.search.grade_min.nodata")))
    if ese:
        notes.append(tr("note.search.ese"))
    if want_spec:
        notes.append(tr("note.search.specialties"))
    if "popularity" in (values or []):
        notes.append(tr("note.search.popularity"))
    if any(r.state_grade.status == "not_available" for r in results if r.kind in ("public", "charter")):
        notes.append(tr("note.search.nograde"))

    applied = {"radius_mi": radius_mi, "kinds": kinds or list(("public", "charter", "private", "early_learning")), "stages": stages or [],
               "free_only": free_only, "grade_min": grade_min.upper() if grade_min else None, "specialties": specialties or [],
               "ese": ese, "scholarship": scholarship, "sort": sort, "limit": limit, "priorities": prio, "values": values or [], "q": q or None}
    return SearchResponse(results=results, meta=SearchMeta(origin={"lat": lat, "lon": lon}, total_matching=len(scored), returned=len(results),
                                                           filters_applied=applied, excluded=excluded, notes=notes, zones=zones,
                                                           data_available=data_available(nav)))


# ---------------------------------------------------------------- lookup by name
KIND_ORDER = {"public": 0, "charter": 1, "private": 2, "early_learning": 3}


def lookup(nav: Navigator, q: str, lat: float | None = None, lon: float | None = None, limit: int = 8) -> LookupResponse:
    """Find schools by name anywhere in the county (no radius, no filters), to jump the map to one. Every word typed must appear in the
    name. Best first: names that start with the query, then public/charter before private and child care, then nearest."""
    tokens = norm_text(q).split()
    if not tokens:
        raise ApiError(422, "bad_query")
    norm_q = " ".join(tokens)
    hits = []
    for r in nav.conn.execute("SELECT * FROM places"):
        p = row_to_place(r)
        name = norm_text(p["name"])
        if all(tk in name for tk in tokens):
            d = haversine_mi(lat, lon, p["lat"], p["lon"]) if lat is not None and lon is not None else None
            hits.append((not name.startswith(norm_q), KIND_ORDER.get(p["kind"], 9), d if d is not None else 0, len(name), p, d))
    hits.sort(key=lambda h: h[:4])
    return LookupResponse(total=len(hits), results=[
        LookupHit(id=p["id"], name=p["name"], kind=p["kind"], address=p.get("address"), city=p.get("city"), lat=p["lat"], lon=p["lon"],
                  distance_mi=round(d, 2) if d is not None else None) for *_, p, d in hits[:max(1, min(limit, 20))]])


# ---------------------------------------------------------------- detail
def _nearby(nav: Navigator, p: dict, kind: str, within_mi: float = 1.0, n: int = 3) -> list[Nearby]:
    la0, la1, lo0, lo1 = bbox_for_radius(p["lat"], p["lon"], within_mi)
    rows = nav.conn.execute("SELECT * FROM pois WHERE kind=? AND lat BETWEEN ? AND ? AND lon BETWEEN ? AND ?", (kind, la0, la1, lo0, lo1)).fetchall()
    ranked = sorted(((haversine_mi(p["lat"], p["lon"], r["lat"], r["lon"]), r) for r in rows), key=lambda t: t[0])
    out = []
    for d, r in ranked:
        if d > within_mi:
            break
        out.append(Nearby(kind=kind, name=r["name"], address=r["address"],  # type: ignore[arg-type]
                          distance_mi=nav.derived(round(d, 2), r["source_layer"], tr("m.nearby"))))
        if len(out) == n:
            break
    return out


APPLY_RULES = {
    "public": ["magnet_how_to_apply", "magnet_window", "magnet_programs_limit", "magnet_lottery", "magnet_zoned_must_apply", "magnet_results", "vpk_apply"],
    "charter": ["charter_lottery"],
    "private": ["scholarships"],
    "early_learning": ["vpk_age", "vpk_apply"],
}


def questions_for(nav: Navigator, s: SchoolSummary) -> list[str]:
    q: list[str] = []
    if s.kind == "private":
        q += [tr("q.private.tuition"), tr("q.private.scholarship")]
    if s.kind == "early_learning":
        q += [tr("q.care.ages"), tr("q.care.vpk"), tr("q.care.hours")]
    if s.aftercare.status == "not_available":
        q.append(tr("q.aftercare"))
    if s.ese.status == "not_available":
        q.append(tr("q.ese"))
    if s.kind == "public" and s.is_magnet.status == "not_available":
        q.append(tr("q.magnet"))
    if s.kind == "charter":
        q.append(tr("q.charter"))
    if s.kind in ("public", "charter") and s.state_grade.status == "not_available":
        q.append(tr("q.nograde"))
    q += [tr("q.arrival"), tr("q.tour")]
    return q


def detail(nav: Navigator, place_id: str, lat: float | None = None, lon: float | None = None) -> SchoolDetail:
    p = get_place(nav, place_id)
    origin = (lat, lon) if lat is not None and lon is not None else None
    zones: ZonesResult | None = zoned_for(nav, lat, lon) if origin else None
    s = summarize(nav, p, origin=origin, zoned_map=zoned_place_ids(zones) if zones else None)

    steps = []
    for rid in APPLY_RULES.get(p["kind"], []):
        r = nav.rule(rid)
        if r:
            steps.append(ApplyStep(text=nav.rule_text(rid), rule_id=rid, field=nav.rule_field(rid)))
    notes = []
    if p["kind"] == "public" and s.is_magnet.status == "not_available":
        notes.append(tr("note.detail.magnet"))
    if any(st.field.status == "curated" and "unconfirmed" in (st.field.method or "") for st in steps):
        notes.append(tr("note.detail.unconfirmed"))

    links: dict[str, str] = {}
    if p["website"]:
        links["school_website"] = p["website"]
    links["data_source"] = nav.prov(p["source_layer"]).url or ""
    if p["kind"] in ("public", "charter"):
        links["fldoe_school_grades"] = nav.prov("fldoe_school_grades").url or "https://www.fldoe.org/accountability/accountability-reporting/school-grades/"
    if p["kind"] == "public":
        links["magnet_catalog"] = "https://www.miamimagnets.org/"
    links = {k: v for k, v in links.items() if v}
    return SchoolDetail(school=s, how_to_apply=steps, nearby_parks=_nearby(nav, p, "park"), nearby_libraries=_nearby(nav, p, "library"),
                        questions_to_ask=questions_for(nav, s), links=links, zones=zones, notes=notes)
