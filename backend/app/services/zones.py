from __future__ import annotations

from ..i18n import t
from ..schemas import ZoneEntry, ZoneShapes, ZonesResult
from .context import Navigator
from .errors import ApiError
from .geocode import in_county

LEVEL_DATASET = {"elementary": "county_zone_elementary", "middle": "county_zone_middle", "high": "county_zone_high"}


def zoned_for(nav: Navigator, lat: float, lon: float) -> ZonesResult:
    if not in_county(lat, lon):
        raise ApiError(422, "outside_county")
    out: dict[str, list[ZoneEntry]] = {}
    for level, dataset in LEVEL_DATASET.items():
        entries = []
        for sid, name in nav.zones.lookup(level, lat, lon):
            place = nav.conn.execute("SELECT id, name FROM places WHERE kind='public' AND source_id=? ORDER BY id LIMIT 1", (sid,)).fetchone()
            display = (place["name"] if place else None) or name
            entries.append(ZoneEntry(
                school_source_id=sid, school_name=display, place_id=place["id"] if place else None,
                field=nav.official(display, dataset, t("m.zone.pip", level=t(f"level.{level}")))))
        out[level] = entries
    return ZonesResult(lat=lat, lon=lon, note=t("zone.note"), **out)


SIMPLIFY_DEG = 0.00005  # about 5 m: invisible on a map, keeps responses small
PRECISION = 5  # decimal places (about 1 m)


def _round_coords(obj):
    if isinstance(obj, (list, tuple)):
        return [_round_coords(x) for x in obj] if obj and isinstance(obj[0], (list, tuple)) else [round(x, PRECISION) for x in obj]
    return obj


def zone_shapes(nav: Navigator, lat: float, lon: float) -> ZoneShapes:
    """The attendance-zone polygons that contain a location, simplified for display. Same source and method as /api/zones."""
    from shapely.geometry import mapping

    if not in_county(lat, lon):
        raise ApiError(422, "outside_county")
    features = []
    for level, dataset in LEVEL_DATASET.items():
        for sid, name, geom in nav.zones.lookup_geoms(level, lat, lon):
            place = nav.conn.execute("SELECT id, name FROM places WHERE kind='public' AND source_id=? ORDER BY id LIMIT 1", (sid,)).fetchone()
            prov = nav.prov(dataset)
            g = mapping(geom.simplify(SIMPLIFY_DEG, preserve_topology=True))
            features.append({
                "type": "Feature",
                "geometry": {"type": g["type"], "coordinates": _round_coords(g["coordinates"])},
                "properties": {"level": level, "school_source_id": sid, "school_name": (place["name"] if place else None) or name,
                               "place_id": place["id"] if place else None, "source": prov.source, "url": prov.url, "as_of": prov.as_of,
                               "method": t("m.zone.shape", level=t(f"level.{level}"))},
            })
    return ZoneShapes(features=features, note=t("zone.note"))


def zoned_place_ids(zones: ZonesResult) -> dict[str, str]:
    """place_id -> level for the schools the location is zoned for."""
    m: dict[str, str] = {}
    for level in ("elementary", "middle", "high"):
        for e in getattr(zones, level):
            if e.place_id:
                m.setdefault(e.place_id, level)
    return m
