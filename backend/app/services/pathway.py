"""Preschool-to-12th-grade pathway for each child.

Elementary options use the official attendance zone. Middle and high school are *estimated* from how attendance zones
overlap (the county publishes no feeder patterns), and are labelled that way.
"""
from __future__ import annotations

from ..domain import STAGES, grade_label_for_age, haversine_mi, bbox_for_radius, stage_for_age
from ..i18n import current_lang, t
from ..schemas import (ChildPathway, Field, PathwayOption, PathwayRequest, PathwayResponse, PathwayStage)
from .context import Navigator
from .dates import key_dates
from .plan import _entering
from .schools import row_to_place
from .zones import zoned_for

DATE_KINDS = {"pre_k": {"early_learning"}, "elementary": {"public"}, "middle": {"public"}, "high": {"public"}}


def _nearest(nav: Navigator, lat: float, lon: float, stage: str, kinds: list[str], n: int, radius: float = 3.0) -> list[PathwayOption]:
    la0, la1, lo0, lo1 = bbox_for_radius(lat, lon, radius)
    rows = nav.conn.execute(f"SELECT * FROM places WHERE kind IN ({','.join('?' * len(kinds))}) AND lat BETWEEN ? AND ? AND lon BETWEEN ? AND ?",
                            [*kinds, la0, la1, lo0, lo1]).fetchall()
    found = []
    for r in rows:
        p = row_to_place(r)
        if stage in p["stages"] and not p["extra"].get("hidden"):
            d = haversine_mi(lat, lon, p["lat"], p["lon"])
            if d <= radius:
                found.append((d, p))
    found.sort(key=lambda t: t[0])
    return [PathwayOption(place_id=p["id"], name=p["name"], kind=p["kind"],
                          label=nav.derived(round(d, 2), p["source_layer"], t("m.path.nearest")))
            for d, p in found[:n]]


def _estimated(nav: Navigator, source_polys: list, level: str, top: int = 2) -> list[tuple[str, str | None, float]]:
    """(school id, name, share of the source area covered) for zones at `level` overlapping `source_polys`."""
    if not source_polys:
        return []
    from shapely.ops import unary_union

    src = unary_union(source_polys)
    if src.is_empty or src.area == 0:
        return []
    shares: dict[str, tuple[str | None, float]] = {}
    for (sid, name), geom in nav.zones.all_polygons(level):
        if geom.intersects(src):
            share = geom.intersection(src).area / src.area
            prev = shares.get(sid, (name, 0.0))
            shares[sid] = (name, prev[1] + share)
    ranked = sorted(((sid, nm, sh) for sid, (nm, sh) in shares.items() if sh >= 0.05), key=lambda t: -t[2])
    return ranked[:top]


def _place_for_source(nav: Navigator, sid: str):
    return nav.conn.execute("SELECT id, name FROM places WHERE kind='public' AND source_id=? ORDER BY id LIMIT 1", (sid,)).fetchone()


def pathway(nav: Navigator, req: PathwayRequest) -> PathwayResponse:
    zones = zoned_for(nav, req.lat, req.lon)
    home_zone = {lv: getattr(zones, lv) for lv in ("elementary", "middle", "high")}
    elem_polys = [g for e in home_zone["elementary"] for g in nav.zones.polygons("elementary", e.school_source_id)]

    est_middle = _estimated(nav, elem_polys, "middle")
    mid_polys = [g for sid, _, _ in est_middle for g in nav.zones.polygons("middle", sid)]
    est_high = _estimated(nav, mid_polys, "high")

    def zone_options(level: str) -> list[PathwayOption]:
        return [PathwayOption(place_id=e.place_id, name=e.school_name or e.school_source_id, kind="public",
                              label=e.field.model_copy(update={"method": t("m.path.zone", level=t(f"level.{level}"))})) for e in home_zone[level]]

    def estimate_options(est: list, level: str) -> list[PathwayOption]:
        out = []
        for sid, name, share in est:
            pl = _place_for_source(nav, sid)
            out.append(PathwayOption(
                place_id=pl["id"] if pl else None, name=(pl["name"] if pl else name) or sid, kind="public",
                label=nav.derived({"overlap_pct": round(100 * share)}, f"county_zone_{level}",
                                  t("m.path.estimated"))))
        return out

    children = []
    for i, c in enumerate(req.children):
        cur = stage_for_age(c.age)
        cur_idx = STAGES.index(cur) if cur else len(STAGES)
        stages: list[PathwayStage] = []
        for idx, st in enumerate(STAGES):
            status = "past" if idx < cur_idx else "current" if idx == cur_idx else "future"
            options: list[PathwayOption] = []
            note = None
            if status != "past":
                if st == "infant_toddler":
                    options = _nearest(nav, req.lat, req.lon, st, ["early_learning"], 3) if not req.free_only else []
                elif st == "pre_k":
                    kinds = ["public", "charter"] if req.free_only else ["early_learning", "public", "charter"]
                    options = _nearest(nav, req.lat, req.lon, st, kinds, 4)
                elif st == "elementary":
                    options = zone_options("elementary") + _nearest(nav, req.lat, req.lon, st, ["charter"], 2)
                elif st in ("middle", "high"):
                    if cur_idx >= STAGES.index("middle"):  # already in/near that level: today's official zone for the address
                        options = zone_options(st)
                    else:
                        options = estimate_options(est_middle if st == "middle" else est_high, st)
                        note = t("path.estimate")
                        if home_zone[st]:  # the address's own zone, for reference
                            options += zone_options(st)
            kd = key_dates(nav, DATE_KINDS.get(st)) if status != "past" and st in DATE_KINDS else []
            stages.append(PathwayStage(stage=st, label=t(f"path.stage.{st}"), ages=t(f"path.ages.{st}") if st != "elementary" else "K-5", status=status, options=options,
                                       estimate_note=note, key_dates=kd))
        children.append(ChildPathway(child_index=i, age=c.age, name=c.name, current_stage=cur, grade_label=_entering(c.age, current_lang()) if grade_label_for_age(c.age) else None, stages=stages))
    notes = []
    if req.free_only:
        notes.append(t("path.note.free_only"))
    return PathwayResponse(children=children, zones=zones, notes=notes)
