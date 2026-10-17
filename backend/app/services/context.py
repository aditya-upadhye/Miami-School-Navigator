"""Process-wide read-only state: database, dataset metadata, zone index and curated rules. Built once at startup."""
from __future__ import annotations

import json
import sqlite3
from dataclasses import dataclass, field
from datetime import date
from pathlib import Path

from shapely import wkb
from shapely.geometry import Point
from shapely.strtree import STRtree

from .. import db
from ..config import Settings, get_settings
from ..i18n import current_lang, t
from ..schemas import Field, Provenance


@dataclass
class _Level:
    tree: STRtree | None
    meta: list[tuple[str, str | None]]  # (school source id, school name) per polygon
    geoms: list


class ZoneIndex:
    """Point-in-polygon over attendance zones (STRtree). One tree per level; a school may own several polygons."""

    def __init__(self, conn: sqlite3.Connection):
        self.levels: dict[str, _Level] = {}
        for level in ("elementary", "middle", "high"):
            geoms, meta = [], []
            for r in conn.execute("SELECT school_source_id, school_name, geometry FROM zones WHERE level=?", (level,)):
                geoms.append(wkb.loads(r["geometry"]))
                meta.append((r["school_source_id"], r["school_name"]))
            self.levels[level] = _Level(STRtree(geoms) if geoms else None, meta, geoms)

    def lookup(self, level: str, lat: float, lon: float) -> list[tuple[str, str | None]]:
        lv = self.levels[level]
        if lv.tree is None:
            return []
        seen, out = set(), []
        for i in lv.tree.query(Point(lon, lat), predicate="intersects"):
            sid, name = lv.meta[int(i)]
            if sid not in seen:
                seen.add(sid)
                out.append((sid, name))
        return out

    def lookup_geoms(self, level: str, lat: float, lon: float) -> list[tuple[str, str | None, object]]:
        """Like lookup(), but returns the polygon that actually contains the point (one entry per containing polygon)."""
        lv = self.levels[level]
        if lv.tree is None:
            return []
        pt = Point(lon, lat)
        out = []
        for i in lv.tree.query(pt, predicate="intersects"):
            sid, name = lv.meta[int(i)]
            out.append((sid, name, lv.geoms[int(i)]))
        return out

    def polygons(self, level: str, school_source_id: str) -> list:
        lv = self.levels[level]
        return [g for (sid, _), g in zip(lv.meta, lv.geoms) if sid == school_source_id]

    def all_polygons(self, level: str) -> list:
        lv = self.levels[level]
        return list(zip(lv.meta, lv.geoms))


@dataclass
class Navigator:
    settings: Settings
    conn: sqlite3.Connection
    datasets: dict[str, dict] = field(default_factory=dict)
    zones: ZoneIndex | None = None
    rules: dict = field(default_factory=dict)
    quality: dict = field(default_factory=dict)

    # ---- dataset provenance ----
    def prov(self, dataset: str) -> Provenance:
        d = self.datasets.get(dataset)
        if not d:
            return Provenance(source=f"{dataset} (not loaded)", url=None, as_of=None)
        return Provenance(source=d["title"], url=d["url"], as_of=d["as_of"] or (d["retrieved_at"] or "")[:10] or None)

    def has(self, dataset: str) -> bool:
        return dataset in self.datasets

    # ---- Field constructors ----
    def official(self, value, dataset: str, method: str, as_of: str | None = None) -> Field:
        p = self.prov(dataset)
        return Field(value=value, status="official", source=p.source, url=p.url, as_of=as_of or p.as_of, method=method)

    def derived(self, value, dataset: str, method: str, as_of: str | None = None) -> Field:
        p = self.prov(dataset)
        return Field(value=value, status="derived", source=p.source, url=p.url, as_of=as_of or p.as_of, method=method)

    def reported(self, value, dataset: str, method: str, as_of: str | None = None) -> Field:
        p = self.prov(dataset)
        return Field(value=value, status="reported_by_school", source=p.source, url=p.url, as_of=as_of or p.as_of, method=method)

    def curated(self, value, source: str, url: str | None, as_of: str | None, method: str) -> Field:
        return Field(value=value, status="curated", source=source, url=url, as_of=as_of, method=method)

    def not_available(self, why: str, action: str, *, checked: str | list[str] = (), as_of: str | None = None) -> Field:
        names = [checked] if isinstance(checked, str) else list(checked)
        provs = [self.prov(n) for n in names if self.has(n)]
        source = "; ".join(p.source for p in provs) if provs else "No dataset covers this"
        return Field(value=None, status="not_available", source=source, url=provs[0].url if provs else None,
                     as_of=as_of or (provs[0].as_of if provs and provs[0].as_of else date.today().isoformat()),
                     method=t("m.na_default"), why=why, suggested_action=action)

    def rule(self, rule_id: str) -> dict | None:
        return next((r for r in self.rules.get("rules", []) if r["id"] == rule_id), None)

    def rule_text(self, rule_id: str, lang: str | None = None) -> str | None:
        """The rule's text in `lang` (default: the request language), falling back to English when a translation is missing."""
        r = self.rule(rule_id)
        if r is None:
            return None
        lang = lang or current_lang()
        return (r.get("i18n", {}).get(lang) or {}).get("text") or r["text"]

    def rule_field(self, rule_id: str, value=None, lang: str | None = None) -> Field:
        r = self.rule(rule_id)
        if r is None:
            return self.not_available(t("rule.missing.why", lang, rule_id=rule_id), t("rule.missing.action", lang))
        return self.curated(value if value is not None else self.rule_text(rule_id, lang), r["source"], r["url"], r["verified_on"],
                            t("m.rule", lang, rule_id=rule_id, level=r["verification"]))


def load_navigator(settings: Settings | None = None) -> Navigator:
    s = settings or get_settings()
    conn = db.connect(s.db_path, readonly=True)
    nav = Navigator(settings=s, conn=conn)
    nav.datasets = {r["name"]: dict(r) for r in conn.execute("SELECT * FROM datasets")}
    nav.zones = ZoneIndex(conn)
    rules_path = s.curated_dir / "rules.json"
    nav.rules = json.loads(rules_path.read_text()) if rules_path.exists() else {}
    nav.quality = {r["key"]: json.loads(r["value"]) for r in conn.execute("SELECT key, value FROM quality")}
    return nav
