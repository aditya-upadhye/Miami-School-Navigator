"""What graduates of a school go on to do, from three public, aggregated sources (no individual is tracked):

* Florida DOE FETPIP: share of each year's graduates enrolled in college or employed, by school.
* U.S. Dept. of Education CRDC: how many students take AP, IB, dual enrollment and advanced math and science, by school.
* Wikidata: notable alumni (people who already have a public page). Not a representative sample.

The data files are built by scripts/fetch_*.py into data/outcomes/. A school with no rows in a source simply has an empty list for it.
"""
from __future__ import annotations

import gzip
import json
from collections import Counter, defaultdict
from functools import lru_cache
from pathlib import Path

from ..config import get_settings
from ..i18n import t
from ..schemas import AlumniGroup, AlumniPerson, CollegeYear, OutcomeSource, OutcomesResponse, ReadinessMetric, ReadinessYear
from .context import Navigator
from .schools import get_place

FLDOE_URL = "https://origin.fldoe.org/accountability/fl-edu-training-placement-info-program/high-school-reports.stml"
CRDC_URL = "https://civilrightsdata.ed.gov/data"
WIKIDATA_URL = "https://www.wikidata.org"

# FETPIP metric -> CollegeYear field. Percentages are of the graduates the state found outcome data for.
COLLEGE_FIELDS = {"enrolled_any_postsecondary": "enrolled_pct", "enrolled_florida_college_system": "florida_college_pct",
                  "enrolled_state_university": "state_university_pct", "enrolled_private_college_or_university": "private_college_pct",
                  "employed_florida": "employed_pct"}
# CRDC metrics shown, as a share of the school's total enrollment. Order is the display order.
READINESS_METRICS = ["ap_enrolled", "dual_enrolled", "ib_enrolled", "sat_act_takers", "calculus_enrolled", "physics_enrolled", "chemistry_enrolled"]
CS_METRICS = ("computer_science_enrolled", "ap_computer_science_enrolled")  # reported under either name; the larger is shown
# Middle schools have no AP or calculus. The one course path the data covers for them is Algebra I before 9th grade (reported for
# grade 8 up to 2020-21, for grades 7-8 together after that; the larger is shown).
ALGEBRA_METRICS = ("algebra1_enrolled_grade8", "algebra1_enrolled_grade7_8")
MAX_PEOPLE = 12


def _read(path: Path):
    if not path.exists():
        return []
    data = json.load(gzip.open(path, "rt", encoding="utf-8"))
    return data if isinstance(data, list) else data.get("records", [])


@lru_cache(maxsize=1)
def _data():
    d = get_settings().data_dir / "outcomes"
    fl: dict[str, dict[int, dict]] = defaultdict(lambda: defaultdict(dict))
    for r in _read(d / "fldoe_outcomes.json.gz"):
        if r.get("district_school_id"):
            fl[r["district_school_id"]][int(r["year"])][r["metric"]] = r
    xw = d / "federal" / "crosswalk_db.json"
    ncess = {k: v["place_id"] for k, v in json.load(open(xw)).get("map", {}).items()} if xw.exists() else {}
    fed: dict[str, dict[str, dict]] = defaultdict(lambda: defaultdict(dict))
    for r in _read(d / "federal_readiness.json.gz"):
        pid = ncess.get(r.get("ncessch"))
        if pid:
            fed[pid][r["year"]][r["metric"]] = r
    alumni: dict[str, list[dict]] = defaultdict(list)
    for r in _read(d / "notable_alumni.json.gz"):
        if r.get("place_id"):
            alumni[r["place_id"]].append(r)
    return fl, fed, alumni


def _pct(value, denominator) -> float | None:
    return round(100 * value / denominator, 1) if value is not None and denominator else None


def _college(rows: dict[int, dict]) -> list[CollegeYear]:
    out = []
    for year in sorted(rows):
        m = rows[year]
        total = m.get("graduates_total", {}).get("value")
        base = m.get("graduates_with_outcome_data", {}).get("value")
        fields = {}
        for metric, field in COLLEGE_FIELDS.items():
            rec = m.get(metric)
            if rec:
                fields[field] = _pct(rec["value"], rec.get("denominator") or base)
        if any(v is not None for v in fields.values()):
            out.append(CollegeYear(year=year, graduates=total, with_outcome_data=base, **fields))
    return out


def _readiness(rows: dict[str, dict], high: bool = True) -> list[ReadinessYear]:
    out = []
    for year in sorted(rows):
        m = rows[year]
        enrollment = m.get("enrollment_total", {}).get("value")
        if not enrollment:
            continue
        metrics = []
        for key in (READINESS_METRICS + ["computer_science"]) if high else ["algebra1"]:
            if key in ("computer_science", "algebra1"):
                vals = [m[k]["value"] for k in (CS_METRICS if key == "computer_science" else ALGEBRA_METRICS) if k in m]
                count = max(vals) if vals else None
            else:
                count = m.get(key, {}).get("value")
            if count:  # 0 and missing are both "no students reported", so the bar is left out
                metrics.append(ReadinessMetric(metric=key, count=count, pct=_pct(count, enrollment)))
        if metrics:
            out.append(ReadinessYear(year=year, enrollment=enrollment, metrics=metrics))
    return out


def outcomes(nav: Navigator, place_id: str) -> OutcomesResponse:
    p = get_place(nav, place_id)
    fl, fed, alumni = _data()
    levels = set(p["stages"])
    applies = p["kind"] in ("public", "charter", "private") and bool(levels & {"elementary", "middle", "high"})
    college, readiness = _college(fl.get(p["id"], {})), _readiness(fed.get(p["id"], {}), high="high" in levels)
    people = sorted(alumni.get(p["id"], []), key=lambda r: (r["occupation_group"] == "other", r.get("birth_decade") or 9999, r["person_name"]))
    groups = Counter(r["occupation_group"] for r in people)
    sources = []
    if college:
        sources.append(OutcomeSource(key="fldoe", name=t("outcomes.src.fldoe"), url=FLDOE_URL, years=f"{college[0].year}-{college[-1].year}", note=t("outcomes.note.college")))
    if readiness:
        sources.append(OutcomeSource(key="crdc", name=t("outcomes.src.crdc"), url=CRDC_URL, years=f"{readiness[0].year} to {readiness[-1].year}", note=t("outcomes.note.readiness")))
    if people:
        sources.append(OutcomeSource(key="wikidata", name=t("outcomes.src.wikidata"), url=WIKIDATA_URL, years=None, note=t("outcomes.note.alumni")))
    empty = None
    if applies and not (college or readiness or people):
        empty = t("outcomes.empty.private" if p["kind"] == "private" else "outcomes.empty.public" if "high" in levels else "outcomes.empty.lower")
    return OutcomesResponse(
        place_id=p["id"], applies=applies, empty_reason=empty, college=college, readiness=readiness, sources=sources,
        alumni_total=len(people), alumni_groups=[AlumniGroup(group=g, count=n) for g, n in groups.most_common()],
        alumni=[AlumniPerson(name=r["person_name"], group=r["occupation_group"], birth_decade=r.get("birth_decade"), url=r.get("source_url")) for r in people[:MAX_PEOPLE]])
