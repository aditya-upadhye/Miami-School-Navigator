from __future__ import annotations

from ..i18n import t
from ..domain import haversine_mi
from ..schemas import CompareResponse, CompareRow, CompareScore, Field
from .context import Navigator
from .errors import ApiError
from .schemas_helpers import numeric
from .schools import get_place, score, summarize
from .zones import zoned_for, zoned_place_ids

# (key, attribute on SchoolSummary, best rule). Row labels are catalog keys `cmp.row.<key>`. `best` is only ever set on numeric OFFICIAL fields.
ROWS = [
    ("kind", None, None),
    ("grades", "grades", None),
    ("distance_mi", "distance_mi", None),
    ("zoned", "zoned", None),
    ("state_grade", "state_grade", None),
    ("gains_ela", "gains_ela", "max"),
    ("gains_math", "gains_math", "max"),
    ("proficiency_ela", "proficiency_ela", "max"),
    ("proficiency_math", "proficiency_math", "max"),
    ("enrollment", "enrollment", None),
    ("tuition", "tuition", None),
    ("aftercare", "aftercare", None),
    ("school_hours", "school_hours", None),
    ("is_magnet", "is_magnet", None),
    ("magnet_themes", "magnet_themes", None),
    ("specialties", "specialties", None),
    ("ese", "ese", None),
    ("application_method", "application_method", None),
    ("scholarship", "scholarship", None),
    ("phone", "phone", None),
    ("website", "website", None),
]


def compare(nav: Navigator, ids: list[str], lat: float | None = None, lon: float | None = None, radius_mi: float = 3.0,
            priorities: list[str] | None = None, values: list[str] | None = None) -> CompareResponse:
    ids = list(dict.fromkeys(ids))
    if not 1 <= len(ids) <= 3:
        raise ApiError(422, "bad_ids")
    origin = (lat, lon) if lat is not None and lon is not None else None
    zmap = zoned_place_ids(zoned_for(nav, lat, lon)) if origin else None
    places = [get_place(nav, i) for i in ids]
    sums = [summarize(nav, p, origin=origin, zoned_map=zmap) for p in places]
    scores = []
    if origin:  # the same match score the search uses, so the charts agree with the ranking
        for p in places:
            pts, factors, _ = score(p, haversine_mi(lat, lon, p["lat"], p["lon"]), radius_mi, zmap.get(p["id"]), True,
                                    [x for x in (priorities or []) if x.strip()], False, values)
            scores.append(CompareScore(id=p["id"], match_score=pts, breakdown=factors))

    rows: list[CompareRow] = []
    for key, attr, best in ROWS:
        if key == "kind":
            cells = [nav.official(s.kind.replace("_", " "), nav.conn.execute("SELECT source_layer FROM places WHERE id=?", (s.id,)).fetchone()[0],
                                  t("m.compare_kind")) for s in sums]
        else:
            cells = []
            for s in sums:
                f = getattr(s, attr)
                cells.append(f if f is not None else nav.not_available(t("cmp.needs_location.why"), t("cmp.needs_location.action")))
        best_index = None
        if best:
            vals = [(i, numeric(c)) for i, c in enumerate(cells) if c.status == "official" and numeric(c) is not None]
            if len(vals) >= 2 and len({v for _, v in vals}) > 1:
                best_index = max(vals, key=lambda t: t[1])[0]
        rows.append(CompareRow(key=key, label=t(f"cmp.row.{key}"), cells=cells, best_index=best_index,
                               best_rule=t("cmp.best_rule") if best_index is not None else None))

    notes = [t("cmp.note.best")]
    if not origin:
        notes.append(t("cmp.note.location"))
    return CompareResponse(schools=[{"id": s.id, "name": s.name, "kind": s.kind} for s in sums], rows=rows, scores=scores, notes=notes)
