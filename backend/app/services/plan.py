"""School-choice planner: for each child, what they are doing in the planning year (2027-28), whether they qualify for VPK or
kindergarten, and a dated checklist of what to do next.

Everything comes from curated rules (data/curated/rules.json, each with a source and verification level) and the child's birth
date. Nothing is invented: when only an age is known, ages at the September 1 cut-off are estimates and are labelled so.
"""
from __future__ import annotations

from datetime import date

from ..domain import bbox_for_radius, haversine_mi
from ..i18n import current_lang, date_text, month_day_text, t, use_lang
from ..schemas import (ChildPlan, Eligibility, GuideEntry, KeyDate, PlanChild, PlanItem, PlanRequest, PlanResponse)
from .context import Navigator
from .dates import key_dates
from .errors import ApiError
from .zones import zoned_for

SOON_DAYS = 30
# (rule id, program-name message key, the FLDOE directory flag labels it matches: these stay in English because they match stored data)
SCHOLARSHIP_GUIDE = [
    ("scholarship_fes_eo_ftc", "program.eo_ftc", ["FES Educational Options", "Florida Tax Credit (FTC)"]),
    ("scholarship_fes_ua", "program.ua", ["FES Unique Abilities"]),
    ("scholarship_pep", "program.pep", ["PEP Hybrid"]),
]


def age_on(birth: date, on: date) -> int:
    return on.year - birth.year - ((on.month, on.day) < (birth.month, birth.day))


def _cutoff(nav: Navigator) -> tuple[date, str]:
    planning = nav.rules.get("planning")
    if not planning:
        raise ApiError(503, "no_planning_rules")
    return date.fromisoformat(planning["age_cutoff"]), planning["school_year"]


def _year_label(start_year: int) -> str:
    return f"{start_year}-{str(start_year + 1)[2:]}"


def first_year_at_age(birth: date | None, age_now: int, cutoff: date, target: int) -> str:
    """School year (as 'YYYY-YY') in which the child is first `target` years old on September 1."""
    if birth is not None:
        y = cutoff.year
        while age_on(birth, date(y, cutoff.month, cutoff.day)) < target:
            y += 1
        return _year_label(y)
    return _year_label(cutoff.year + max(0, target - (age_now + 1)))


def _resolve_age(child: PlanChild, today: date, cutoff: date) -> tuple[int, int, str]:
    """(age today, age on the cut-off, basis)."""
    if child.birth_date is not None:
        if child.birth_date > today:
            raise ApiError(422, "birth_date_in_future")
        return age_on(child.birth_date, today), age_on(child.birth_date, cutoff), "birth_date"
    # Without a birth date: one birthday falls between now and the next cut-off for all but a 6-week window, so age + 1 is the estimate.
    return child.age, child.age + 1, "estimated_from_age"


def _status_for_window(open_d: date, close_d: date, today: date) -> str:
    if today < open_d:
        return "upcoming"
    if today > close_d:
        return "closed"
    return "closes_soon" if (close_d - today).days <= SOON_DAYS else "open"


def _nearby_count(nav: Navigator, lat: float, lon: float, kind: str, radius: float) -> int:
    la0, la1, lo0, lo1 = bbox_for_radius(lat, lon, radius)
    rows = nav.conn.execute("SELECT lat, lon FROM places WHERE kind=? AND lat BETWEEN ? AND ? AND lon BETWEEN ? AND ?", (kind, la0, la1, lo0, lo1)).fetchall()
    return sum(1 for r in rows if haversine_mi(lat, lon, r["lat"], r["lon"]) <= radius)


def _entering(a: int, lang: str) -> str:
    """What a child of age `a` on the cut-off is doing, in `lang` (English matches domain.grade_label_for_age)."""
    if a < 1:
        return t("entering.infant", lang)
    if a < 3:
        return t("entering.toddler", lang)
    if a == 3:
        return t("entering.prek3", lang)
    if a == 4:
        return t("entering.vpk", lang)
    if a == 5:
        return t("entering.kindergarten", lang)
    if a <= 17:
        return t("entering.grade", lang, n=a - 5)
    return t("entering.past", lang)


def _scholarship_guide(nav: Navigator, lat: float, lon: float, lang: str) -> list[GuideEntry]:
    la0, la1, lo0, lo1 = bbox_for_radius(lat, lon, 5.0)
    rows = nav.conn.execute("SELECT lat, lon, scholarship_flags FROM places WHERE kind='private' AND scholarship_flags IS NOT NULL "
                            "AND lat BETWEEN ? AND ? AND lon BETWEEN ? AND ?", (la0, la1, lo0, lo1)).fetchall()
    near = [r for r in rows if haversine_mi(lat, lon, r["lat"], r["lon"]) <= 5.0]
    out = []
    for rule_id, program_key, labels in SCHOLARSHIP_GUIDE:
        if nav.rule(rule_id) is None:
            continue
        n = sum(1 for r in near if any(f'"{lab}"' in r["scholarship_flags"] for lab in labels))
        out.append(GuideEntry(id=rule_id, program=t(program_key, lang), flag_labels=labels, summary=nav.rule_field(rule_id, lang=lang), schools_nearby=n))
    return out


def plan(nav: Navigator, req: PlanRequest, today: date | None = None) -> PlanResponse:
    """The body `lang` wins; without one the request language (X-Lang header) applies. Errors raised inside follow it too."""
    lang = req.lang or current_lang()
    with use_lang(lang):
        return _plan(nav, req, today, lang)


def _plan(nav: Navigator, req: PlanRequest, today: date | None, lang: str) -> PlanResponse:
    today = today or date.today()
    cutoff, school_year = _cutoff(nav)
    zones = zoned_for(nav, req.lat, req.lon)  # also validates that the point is inside Miami-Dade
    dates = {k.id: k for k in key_dates(nav, today=today, lang=lang)}
    magnet_open, magnet_close, magnet_results = dates.get("magnet_opens"), dates.get("magnet_closes"), dates.get("magnet_results")
    cutoff_text = date_text(cutoff, lang)
    cutoff_md = month_day_text(cutoff, lang)
    rf = lambda rid: nav.rule_field(rid, lang=lang)  # noqa: E731  (rule field in the plan's language)
    rt = lambda rid: nav.rule_text(rid, lang)  # noqa: E731

    children: list[ChildPlan] = []
    for i, c in enumerate(req.children):
        age_now, a, basis = _resolve_age(c, today, cutoff)
        exact = basis == "birth_date"
        hedge = "" if exact else t("hedge", lang, cutoff_md=cutoff_md)
        entering = _entering(a, lang)
        grade = a - 5  # kindergarten = 5 at the cut-off
        stage = ("infant_toddler" if a < 3 else "pre_k" if a < 5 else "elementary" if grade <= 5 else "middle" if grade <= 8 else "high" if grade <= 12 else "past")

        # ---- eligibility ----
        elig: list[Eligibility] = []
        vpk_year = first_year_at_age(c.birth_date, age_now, cutoff, 4)
        vpk_label = t("elig.vpk.label", lang)
        if a == 4:
            elig.append(Eligibility(key="vpk", label=vpk_label, result="eligible", exact=exact, field=rf("vpk_age"),
                                    explanation=t("elig.vpk.eligible", lang, cutoff=cutoff_text, year=school_year, hedge=hedge)))
        elif a < 4:
            elig.append(Eligibility(key="vpk", label=vpk_label, result="later", exact=exact, year=vpk_year, field=rf("vpk_age"),
                                    explanation=t("elig.vpk.later", lang, cutoff=cutoff_text, year=vpk_year, hedge=hedge)))
        elif a == 5:  # a school-age child no longer needs a VPK row: show it only for the kindergarten-age year
            elig.append(Eligibility(key="vpk", label=vpk_label, result="not_eligible", exact=exact, field=rf("vpk_age"),
                                    explanation=t("elig.vpk.past", lang, cutoff=cutoff_text, hedge=hedge)))
        if nav.rule("kindergarten_age") and a <= 5:
            if a == 5:
                elig.append(Eligibility(key="kindergarten", label=t("elig.k.label", lang), result="eligible", exact=exact, field=rf("kindergarten_age"),
                                        explanation=t("elig.k.eligible", lang, cutoff=cutoff_text, year=school_year, hedge=hedge)))
            else:
                ky = first_year_at_age(c.birth_date, age_now, cutoff, 5)
                elig.append(Eligibility(key="kindergarten", label=t("elig.k.label", lang), result="later", exact=exact, year=ky, field=rf("kindergarten_age"),
                                        explanation=t("elig.k.later", lang, cutoff=cutoff_text, year=ky, hedge=hedge)))

        # ---- zoned school at the level the child enters ----
        level = {"elementary": "elementary", "middle": "middle", "high": "high"}.get(stage)
        zoned = (getattr(zones, level)[0] if level and getattr(zones, level) else None)

        # ---- checklist ----
        items: list[PlanItem] = []
        who = c.name or t("child", lang, n=i + 1)
        transition_note: str | None = None

        def add(**kw):
            items.append(PlanItem(**kw))

        magnet_status = _status_for_window(date.fromisoformat(magnet_open.date), date.fromisoformat(magnet_close.date), today) if magnet_open and magnet_close else "info"
        if stage == "infant_toddler":
            n = _nearby_count(nav, req.lat, req.lon, "early_learning", 3.0)
            add(id="find-care", title=t("care.title", lang), status="info", link="explore", detail=t("care.detail", lang, n=n),
                field=nav.derived(n, "county_daycare", t("m.plan.care_count", lang)))
            add(id="plan-vpk", title=t("planvpk.title", lang, year=vpk_year), status="info", rule_ids=["vpk_age"],
                detail=t("planvpk.detail", lang, cutoff_md=cutoff_md, explanation=elig[0].explanation), field=rf("vpk_age"))
        elif stage == "pre_k" and a == 3:
            n = _nearby_count(nav, req.lat, req.lon, "early_learning", 3.0)
            add(id="prek3", title=t("prek3.title", lang), status="info", link="explore", detail=t("prek3.detail", lang, n=n),
                field=nav.derived(n, "county_daycare", t("m.plan.care_count", lang)))
            add(id="plan-vpk", title=t("planvpk.title", lang, year=vpk_year), status="info", rule_ids=["vpk_age"], detail=elig[0].explanation, field=rf("vpk_age"))
        elif a == 4:
            add(id="vpk-apply", title=t("vpkapply.title", lang), rule_ids=["vpk_apply", "vpk_age"],
                status=magnet_status if magnet_close else "rolling", deadline=magnet_close,
                detail=rt("vpk_apply") or t("vpkapply.fallback", lang), field=rf("vpk_apply"))
            add(id="vpk-provider", title=t("vpkprov.title", lang), status="info", link="explore", detail=t("vpkprov.detail", lang),
                field=rf("vpk_age"), rule_ids=["vpk_age"])
        elif stage != "past":
            lvl_name = t(f"level.{level}", lang)
            where = (t("zoned.where", lang, level=lvl_name, school=zoned.school_name) if zoned else t("zoned.none", lang, level=lvl_name))
            if grade == 0 or grade in (6, 9):
                transition_note = t({0: "trans.k", 6: "trans.6", 9: "trans.9"}[grade], lang, who=who, year=school_year)
            if zoned:
                add(id="zoned", title=t("zoned.title", lang, level=lvl_name, school=zoned.school_name), status="info", rule_ids=[],
                    detail=t("zoned.detail", lang, where=where), field=zoned.field)
            if level and nav.rule("magnet_how_to_apply"):
                items.append(PlanItem(
                    id="magnet", title=t("magnet.title", lang), status=magnet_status, deadline=magnet_close,
                    rule_ids=["magnet_window", "magnet_how_to_apply", "magnet_zoned_must_apply", "magnet_programs_limit", "magnet_lottery"],
                    detail=t("magnet.detail", lang, window=rt("magnet_window"), how=rt("magnet_how_to_apply")),
                    field=rf("magnet_window")))
                if magnet_results:
                    add(id="magnet-results", title=t("magnetresults.title", lang), status="upcoming" if date.fromisoformat(magnet_results.date) >= today else "info", deadline=magnet_results,
                        rule_ids=["magnet_results"], detail=rt("magnet_results"), field=rf("magnet_results"))
            add(id="charter", title=t("charter.title", lang), status="rolling", rule_ids=["charter_lottery"], link="explore",
                detail=rt("charter_lottery"), field=rf("charter_lottery"))
            if not req.free_only:
                add(id="private", title=t("private.title", lang), status="rolling", rule_ids=["scholarships"], link="scholarships",
                    detail=t("private.detail", lang), field=rf("scholarships"))
        if a == 4:
            transition_note = t("trans.vpk", lang, who=who, year=school_year)
        cp = ChildPlan(child_index=i, name=c.name, age_now=age_now, age_at_cutoff=a, age_basis=basis, entering=entering, stage=stage,
                       transition_note=transition_note, zoned=zoned, eligibility=elig, items=items)
        children.append(cp)

    notes = []
    if any(c.age_basis != "birth_date" for c in children):
        notes.append(t("note.age", lang, cutoff_md=cutoff_md))
    unconfirmed = sorted({rid for ch in children for it in ch.items for rid in it.rule_ids
                          if (nav.rule(rid) or {}).get("verification") not in (None, "confirmed_district_source")})
    if unconfirmed:
        notes.append(t("note.unconfirmed", lang))
    intro = rf("scholarships") if nav.rule("scholarships") else None
    return PlanResponse(lang=lang, school_year=school_year, cutoff_date=cutoff.isoformat(), today=today.isoformat(), children=children,
                        key_dates=list(dates.values()), scholarship_guide=_scholarship_guide(nav, req.lat, req.lon, lang), scholarship_intro=intro, notes=notes)
