"""The tools the chat agent may call. They wrap the same service functions as the REST API, and return compact,
citation-tagged JSON so the model can cite every claim."""
from __future__ import annotations

import json
import re
from typing import Any

from ..domain import STAGES, stage_for_age
from ..i18n import current_lang, use_lang
from ..schemas import Child, PathwayRequest, SchoolSummary
from ..services import compare as compare_svc
from ..services import dates as dates_svc
from ..services import geocode as geocode_svc
from ..services import pathway as pathway_svc
from ..services import schools as schools_svc
from ..services import zones as zones_svc
from ..services.errors import ApiError
from .citations import CitationBook

LOC = {"lat": {"type": "number", "description": "Latitude (from geocode or the family's profile)"},
       "lon": {"type": "number", "description": "Longitude"}}

TOOLS: list[dict] = [
    {"name": "geocode",
     "description": "Turn a street address or 5-digit ZIP in Miami-Dade into lat/lon. A ZIP gives only an approximate point. Skip this if the profile already has lat/lon.",
     "input_schema": {"type": "object", "properties": {"q": {"type": "string"}}, "required": ["q"]}},
    {"name": "get_zones",
     "description": "Which elementary, middle and high school a location is zoned for (official county attendance boundaries).",
     "input_schema": {"type": "object", "properties": LOC, "required": ["lat", "lon"]}},
    {"name": "search_schools",
     "description": ("Find schools/early-learning near a location with a transparent match score and reasons. Pass `ages` for the children (it maps ages to stages and "
                     "covers several children in ONE call). Put soft wishes (e.g. STEM) in `priorities`; use `specialties` only for a hard 'only X' request. "
                     "Use `q` to look a school up by name (it then searches the whole county unless you set radius_mi; lat/lon may be omitted for a name lookup). "
                     "Results include distance, zoning, state grade, tuition and other fields, each with status and a `cite` id."),
     "input_schema": {"type": "object", "properties": {
         **LOC, "radius_mi": {"type": "number", "description": "Default 3 (25 when `q` is given)"},
         "q": {"type": "string", "description": "School name (or part of it) to look up"},
         "kinds": {"type": "array", "items": {"type": "string", "enum": ["public", "charter", "private", "early_learning"]}},
         "ages": {"type": "array", "items": {"type": "integer"}, "description": "Children's ages"},
         "stages": {"type": "array", "items": {"type": "string", "enum": STAGES}},
         "free_only": {"type": "boolean"}, "grade_min": {"type": "string", "enum": ["A", "B", "C", "D", "F"], "description": "Public/charter state grade floor"},
         "specialties": {"type": "array", "items": {"type": "string"}}, "priorities": {"type": "array", "items": {"type": "string"}},
         "ese": {"type": "boolean"}, "scholarship": {"type": "boolean"},
         "sort": {"type": "string", "enum": ["match", "distance", "grade", "name"]}, "limit": {"type": "integer", "description": "Default 5, max 10. Leave it out so the list matches the family's map"}},
         "required": []}},
    {"name": "get_school",
     "description": "Full detail for one school id: fields, how to apply (with sources), nearby parks/libraries, and questions to ask the school.",
     "input_schema": {"type": "object", "properties": {"school_id": {"type": "string"}, **LOC}, "required": ["school_id"]}},
    {"name": "compare",
     "description": "Side-by-side comparison of up to 3 school ids. 'Best' is flagged only on numeric official fields.",
     "input_schema": {"type": "object", "properties": {"ids": {"type": "array", "items": {"type": "string"}, "maxItems": 3}, **LOC}, "required": ["ids"]}},
    {"name": "get_dates",
     "description": ("Key application dates AND application rules, each with a source and verification level: magnet window, who must apply "
                     "(including families zoned for the school), how to apply, lottery, results, VPK eligibility, charter and scholarship rules. "
                     "Call this first for any question about deadlines, eligibility or how to apply; never answer those from memory."),
     "input_schema": {"type": "object", "properties": {}}},
    {"name": "get_pathway",
     "description": "Preschool-to-high-school pathway for each child at an address: for every stage the best-scoring schools within the travel distance (same match score as search_schools), plus key dates.",
     "input_schema": {"type": "object", "properties": {**LOC, "children": {"type": "array", "items": {"type": "object", "properties": {
         "age": {"type": "integer"}, "name": {"type": "string"}}, "required": ["age"]}}, "free_only": {"type": "boolean"}, "radius_mi": {"type": "number"}},
         "required": ["lat", "lon", "children"]}},
    {"name": "save_children",
     "description": ("Remember the children the family tells you about (name and age) so the app keeps them, uses them to pick and rank schools and can filter the map by child. "
                     "Call it whenever the family states a child's age or name that is not already in the profile, or corrects one. Pass only what they said; never guess an age. "
                     "Children already in the profile are kept; a child with the same name is updated."),
     "input_schema": {"type": "object", "properties": {"children": {"type": "array", "maxItems": 8, "items": {"type": "object", "properties": {
         "age": {"type": "integer", "minimum": 0, "maximum": 21}, "name": {"type": "string"}}, "required": ["age"]}}}, "required": ["children"]}},
    {"name": "remember",
     "description": ("Keep a short note about the family for every later chat: a lasting preference or need (for example 'wants a bilingual program', 'worried about long commutes', "
                     "'Ana has an IEP'), a decision, or a school they liked or ruled out (name it). Use the family's own words, one short sentence each. Do NOT note small talk, "
                     "questions, or school facts (those come from tools). Notes already remembered are kept; do not repeat them."),
     "input_schema": {"type": "object", "properties": {"notes": {"type": "array", "maxItems": 6, "items": {"type": "string"}}}, "required": ["notes"]}},
    {"name": "update_map_filters",
     "description": ("Change the filters on the family's map (the Explore page next to this chat). Call it ONLY when the family clearly tells you to apply, set, show, "
                     "filter, change, update or reset something on the map, or says yes to your offer to apply filters. For a question or when they are just exploring, "
                     "do NOT call it: answer, then offer to apply. Pass only the filters the family asked for; anything you leave out stays as it is."),
     "input_schema": {"type": "object", "properties": {
         "reset": {"type": "boolean", "description": "Clear every filter first, then apply the others"},
         "radius_mi": {"type": "number", "description": "Travel distance in miles, 1 to 25"},
         "kinds": {"type": "array", "items": {"type": "string", "enum": ["public", "charter", "private", "early_learning"]}, "description": "Which kinds of school to show"},
         "free_only": {"type": "boolean"},
         "grade_min": {"type": "string", "enum": ["A", "B", "C", "D", "F"], "description": "State grade floor. A or B turns on the 'B or better' filter; C or lower turns it off"},
         "programs": {"type": "array", "items": {"type": "string", "enum": ["STEM", "Arts", "Bilingual", "IB", "Montessori"]}},
         "only_programs": {"type": "boolean", "description": "True to show only schools with those programs; false to just rank them higher"},
         "ese": {"type": "boolean", "description": "Schools with exceptional student education (special needs) support"},
         "values": {"type": "array", "items": {"type": "string", "enum": ["academics", "programs", "popularity", "proximity"]}, "description": "What matters most"},
         "view": {"type": "string", "enum": ["top", "all"], "description": "top = the 5 best matches, all = everything nearby by distance"},
         "child": {"type": "string", "description": "Show schools for one child: pass the child's name from the profile, or 'all' for every child, or 'any' for no child filter"}},
         "required": []}},
]

TOOL_NAMES = {t["name"] for t in TOOLS}


# What the family just asked for in plain words. The model is told to pass these filters itself; this makes sure the search (and so the
# map, which copies the search's filters) reflects them even when it does not.
_ESE = re.compile(r"special[- ]needs|special education|\bese\b|\biep\b|\b504\b|disabilit|autis|dyslex|\badhd\b|wheelchair|learning difference|necesidades especiales|educaci[oó]n especial|discapacidad|autismo|bezwen espesyal|andikap|otis", re.I)
_PROGRAMS = {"STEM": re.compile(r"\bstem\b", re.I), "Arts": re.compile(r"\barts?\b|\bartes\b|\bmusic\b", re.I), "Bilingual": re.compile(r"bilingual|biling[uü]e|bileng", re.I),
             "IB": re.compile(r"\bIB\b|international baccalaureate", re.I), "Montessori": re.compile(r"montessori", re.I)}
_KINDS = {"charter": re.compile(r"\bcharter|ch[aá]rter", re.I), "private": re.compile(r"\bprivate|privad[ao]|pwive", re.I), "public": re.compile(r"\bpublic|p[uú]blic[ao]|piblik", re.I)}
_FREE = re.compile(r"\bfree\b|no tuition|tuition[- ]free|gratis|gratuit", re.I)


def asked_for(text: str) -> dict:
    """Filters named in the family's latest message: ese, programs (ranked), kinds, free_only."""
    out: dict[str, Any] = {}
    if _ESE.search(text):
        out["ese"] = True
    progs = [p for p, rx in _PROGRAMS.items() if rx.search(text)]
    if progs:
        out["priorities"] = progs
    kinds = [k for k, rx in _KINDS.items() if rx.search(text)]
    if kinds:
        out["kinds"] = kinds
    if _FREE.search(text):
        out["free_only"] = True
    return out


_PROPS = {t["name"]: set(t["input_schema"].get("properties", {})) for t in TOOLS}


def _tidy_args(name: str, args: dict | None) -> dict:
    """Models sometimes pass a location as one object (`point`, `location`) or add arguments the tool does not have: fix the first, drop the second."""
    args = dict(args or {})
    for key in ("point", "location", "coordinates", "coords", "center"):
        v = args.pop(key, None)
        if isinstance(v, dict):
            args.setdefault("lat", v.get("lat", v.get("latitude")))
            args.setdefault("lon", v.get("lon", v.get("lng", v.get("longitude"))))
    allowed = _PROPS.get(name, set())
    return {k: v for k, v in args.items() if k in allowed}


def clean_map_filters(raw: dict | None) -> dict:
    """The family's current map search, reduced to safe values: Jarvis's searches start from it so its schools match the map."""
    raw = raw or {}
    out: dict[str, Any] = {}
    try:
        if raw.get("radius_mi") is not None:
            out["radius_mi"] = min(25.0, max(1.0, float(raw["radius_mi"])))
        if raw.get("limit") is not None:
            out["limit"] = min(10, max(1, int(raw["limit"])))
    except (TypeError, ValueError):
        pass
    for key, allowed in (("kinds", ("public", "charter", "private", "early_learning")), ("stage", tuple(STAGES))):
        v = [x for x in raw.get(key) or [] if x in allowed] if isinstance(raw.get(key), list) else []
        if v:
            out[key] = v
    for key in ("specialties", "priorities"):
        if isinstance(raw.get(key), list):
            out[key] = [str(x)[:40] for x in raw[key][:10]]
    if isinstance(raw.get("values"), list):
        out["values"] = [v for v in raw["values"] if v in schools_svc.VALUES]
    for key in ("free_only", "ese"):
        if raw.get(key) is not None:
            out[key] = bool(raw[key])
    if raw.get("grade_min") in ("A", "B", "C", "D", "F"):
        out["grade_min"] = raw["grade_min"]
    if raw.get("sort") in ("match", "distance"):
        out["sort"] = raw["sort"]
    return out
DOWNTOWN_MIAMI = (25.7617, -80.1918)


RESULT_TOOLS = {"search_schools", "get_school", "compare"}  # tools whose school summaries are returned to the family in the response


class ToolBox:
    """Runs the tools. Services always run in English here so what the model reads (and the golden tests check) never depends on the family's
    language; the model translates per its prompt. `lang` (the request language) only decides the text of the school summaries that are
    returned to the family next to the answer."""

    def __init__(self, nav, book: CitationBook, profile, lang: str | None = None, map_filters: dict | None = None, user_text: str = "") -> None:
        self.nav, self.book, self.profile = nav, book, profile
        self.asked = asked_for(user_text)
        self.mf = clean_map_filters(map_filters)
        self.lang = lang or current_lang()
        self.results: list[SchoolSummary] = []
        self.filters_applied: dict[str, Any] = {}
        self.calls: list[dict] = []
        self.map_update: dict[str, Any] | None = None  # filters the family asked to put on the map (the UI applies them)
        self.geo: dict[str, Any] | None = None  # the last place the model looked up with `geocode`
        self.origin: dict[str, Any] | None = None  # where the last school search was centred, when that is not the family's own location
        self.profile_update: dict[str, Any] | None = None  # details the family told us in the chat (the app stores them on this device)

    # ---- compact views ----
    def _school(self, s: SchoolSummary) -> dict:
        f = self.book.field
        d = {"id": s.id, "name": s.name, "kind": s.kind, "address": s.address, "grades": f(s.grades), "state_grade": f(s.state_grade),
             "tuition": f(s.tuition), "aftercare": f(s.aftercare), "magnet": f(s.is_magnet), "specialties": f(s.specialties),
             "ese": f(s.ese), "scholarship": f(s.scholarship), "stages": f(s.stages)}
        if s.flags:
            d["flags"] = s.flags
        if s.distance_mi:
            d["distance_mi"] = f(s.distance_mi)
        if s.zoned:
            d["zoned"] = f(s.zoned)
        if s.gains_ela.status != "not_available":
            d["gains_ela"], d["gains_math"] = f(s.gains_ela), f(s.gains_math)
        if s.magnet_themes.status != "not_available" and s.magnet_themes.value:
            d["magnet_themes"] = f(s.magnet_themes)
        if s.proficiency_ela.status != "not_available":
            d["proficiency_ela"], d["proficiency_math"] = f(s.proficiency_ela), f(s.proficiency_math)
        if s.match_score is not None:
            d["match_score"], d["reasons"] = s.match_score, s.reasons
        return d

    def _zones(self, z) -> dict:
        return {lv: [{"school": e.school_name, "place_id": e.place_id, "cite": self.book.field(e.field)["cite"]} for e in getattr(z, lv)]
                for lv in ("elementary", "middle", "high")} | {"note": z.note}

    # ---- dispatch ----
    def run(self, name: str, args: dict) -> dict:
        with use_lang("en"):
            out = self._run(name, args)
        if self.lang != "en" and name in RESULT_TOOLS and "error" not in out:
            self._localize_results(name, args)
        return out

    def _localize_results(self, name: str, args: dict) -> None:
        """Re-run a results tool in the family's language so `self.results` (returned in the HTTP response) carries translated text.
        The tool output the model saw is untouched, and the scratch citation book keeps the model's citation ids unchanged."""
        real_book, self.book = self.book, CitationBook()
        try:
            with use_lang(self.lang):
                getattr(self, f"_t_{name}")(**{k: v for k, v in (args or {}).items() if v is not None})
        except Exception:  # keep the English results rather than fail the turn
            pass
        finally:
            self.book = real_book

    def _run(self, name: str, args: dict) -> dict:
        if name in TOOL_NAMES:
            args = _tidy_args(name, args)
        self.calls.append({"tool": name, "input": args})
        if name not in TOOL_NAMES:
            return {"error": f"unknown tool '{name}'"}
        try:
            return getattr(self, f"_t_{name}")(**{k: v for k, v in (args or {}).items() if v is not None})
        except ApiError as e:
            return {"error": e.message, "next": e.suggested_action}
        except TypeError as e:  # the model passed an argument the tool does not take
            return {"error": f"bad arguments: {e}"}
        except Exception as e:  # never let a tool crash the whole chat turn
            return {"error": f"{type(e).__name__}: {e}"}

    def _loc(self, lat, lon):
        lat = lat if lat is not None else self.profile.lat
        lon = lon if lon is not None else self.profile.lon
        if lat is None or lon is None:
            raise ApiError(422, "no_location")
        return lat, lon

    def _t_geocode(self, q: str) -> dict:
        g = geocode_svc.geocode(self.nav, q)
        c = self.book.cite(g.source, g.url, g.as_of, "official" if g.precision == "address" else "derived")
        self.geo = {"lat": g.lat, "lon": g.lon, "label": g.matched_address, "precision": g.precision}
        out = {"lat": g.lat, "lon": g.lon, "matched_address": g.matched_address, "precision": g.precision, "confidence": g.confidence, "cite": c}
        if g.note:
            out["note"] = g.note
        return out

    def _t_get_zones(self, lat=None, lon=None) -> dict:
        lat, lon = self._loc(lat, lon)
        return self._zones(zones_svc.zoned_for(self.nav, lat, lon))

    def _t_search_schools(self, lat=None, lon=None, radius_mi=None, q=None, kinds=None, ages=None, stages=None, free_only=None, grade_min=None,
                          specialties=None, priorities=None, ese=None, scholarship=None, sort=None, limit=None) -> dict:
        if q and lat is None and lon is None and self.profile.lat is None:
            lat, lon = DOWNTOWN_MIAMI  # name lookup before we know where the family lives: search the whole county from the center
        else:
            lat, lon = self._loc(lat, lon)
        if not q:  # a search centred somewhere other than the family's own location (they asked about another place): the app moves the map there
            far = self.profile.lat is None or abs(lat - self.profile.lat) > 0.0005 or abs(lon - self.profile.lon) > 0.0005
            near_geo = self.geo and abs(lat - self.geo["lat"]) < 0.0005 and abs(lon - self.geo["lon"]) < 0.0005
            self.origin = ({"lat": lat, "lon": lon, "label": self.geo["label"] if near_geo else None, "precision": self.geo["precision"] if near_geo else None} if far else None)
        mf = {} if q else self.mf  # a name lookup is not a map search; anything else starts from what the map shows, so the lists match
        st = list(stages or [])
        if not st and not ages and not q:
            ages = [] if mf.get("stage") else [c.age for c in self.profile.children]  # the children the family told us about
            st = list(mf.get("stage") or [])
        for a in ages or []:
            s = stage_for_age(int(a))
            if s and s not in st:
                st.append(s)
        if not q:  # what they just said wins over the map's current setting, unless the model chose a value itself
            ese = self.asked.get("ese") if ese is None else ese
            kinds = kinds or self.asked.get("kinds")
            free_only = self.asked.get("free_only") if free_only is None else free_only
            if priorities is None and self.asked.get("priorities"):
                priorities = list(dict.fromkeys([*mf.get("priorities", self.profile.priorities), *self.asked["priorities"]]))
        free = (mf.get("free_only", self.profile.free_only)) if free_only is None else free_only  # the family's stated preference wins when the model omits it
        pri = priorities if priorities is not None else mf.get("priorities", self.profile.priorities)
        vals = mf.get("values") if "values" in mf else self.profile.values
        resp = schools_svc.search(self.nav, lat=lat, lon=lon, radius_mi=float(radius_mi or mf.get("radius_mi") or (25 if q else 3)), q=q, kinds=kinds or mf.get("kinds") or None,
                                  stages=st or None, free_only=bool(free), grade_min=grade_min or mf.get("grade_min"), specialties=specialties or mf.get("specialties") or None,
                                  ese=bool(mf.get("ese") if ese is None else ese), scholarship=bool(scholarship), sort=sort or mf.get("sort", "match"),
                                  limit=min(int(limit or mf.get("limit") or 5), 10), priorities=pri or None,
                                  values=[v for v in vals if v in schools_svc.VALUES] or None)  # the family's own stated values; the model cannot change them
        self.results, self.filters_applied = resp.results, resp.meta.filters_applied
        return {"schools": [self._school(s) for s in resp.results], "total_matching": resp.meta.total_matching,
                "filters_applied": resp.meta.filters_applied, "excluded_by_filter": resp.meta.excluded, "notes": resp.meta.notes,
                "zones": self._zones(resp.meta.zones) if resp.meta.zones else None}

    def _t_update_map_filters(self, reset=None, radius_mi=None, kinds=None, free_only=None, grade_min=None, programs=None, only_programs=None,
                              ese=None, values=None, view=None, child=None) -> dict:
        upd: dict[str, Any] = {}
        if reset:
            upd["reset"] = True
        if radius_mi is not None:
            upd["radius_mi"] = min(25.0, max(1.0, float(radius_mi)))
        if kinds is not None:
            clean = [k for k in kinds if k in ("public", "charter", "private", "early_learning")]
            if clean:  # an empty list would hide every school
                upd["kinds"] = clean
        for key, val in (("free_only", free_only), ("ese", ese), ("only_programs", only_programs)):
            if val is not None:
                upd[key] = bool(val)
        if grade_min is not None and grade_min in ("A", "B", "C", "D", "F"):
            upd["grade_min"] = grade_min
        if programs is not None:
            upd["programs"] = [p for p in programs if p in ("STEM", "Arts", "Bilingual", "IB", "Montessori")]
        if values is not None:
            upd["values"] = [v for v in values if v in schools_svc.VALUES]
        if view in ("top", "all"):
            upd["view"] = view
        if child is not None:
            names = [(c.name or "").strip().casefold() for c in self.profile.children]
            key = str(child).strip().casefold()
            if key in ("all", "any"):
                upd["kid"] = key
            elif key and key in names:
                upd["kid"] = names.index(key)
        if not upd:
            return {"error": "No valid filter was given. Pass at least one filter to apply."}
        self.map_update = {**(self.map_update or {}), **upd}
        return {"applied": upd, "note": "The map updates as soon as your answer is shown. Tell the family in one sentence what you changed."}

    def _t_save_children(self, children=None) -> dict:
        merged = [c.model_copy() for c in self.profile.children]
        for raw in (children or [])[:8]:
            try:
                age = int(raw["age"])
            except (KeyError, TypeError, ValueError):
                continue
            if not 0 <= age <= 21:
                continue
            name = " ".join(str(raw.get("name") or "").split())[:40] or None
            same = next((c for c in merged if name and c.name and c.name.casefold() == name.casefold()), None)
            if same is None and not name:
                same = next((c for c in merged if not c.name and c.age == age), None)
            if same is not None:
                same.age = age
            elif len(merged) < 8:
                merged.append(Child(age=age, name=name))
        self.profile.children = merged
        self.profile_update = {"children": [c.model_dump() for c in merged]}
        return {"saved": self.profile_update["children"], "note": "Saved on the family's device. Use these children from now on and tell them in one sentence what you saved."}

    def _t_remember(self, notes=None) -> dict:
        have = list(self.profile.memory)
        seen = {n.casefold() for n in have}
        for raw in (notes or [])[:6]:
            n = " ".join(str(raw).split())[:200]
            if n and n.casefold() not in seen:
                have.append(n)
                seen.add(n.casefold())
        have = have[-30:]  # the newest 30 notes
        self.profile.memory = have
        self.profile_update = {**(self.profile_update or {}), "memory": have}
        return {"remembered": have, "note": "Saved on the family's device for later chats. Do not announce every note; mention it briefly only if it helps."}

    def _t_get_school(self, school_id: str, lat=None, lon=None) -> dict:
        lat = lat if lat is not None else self.profile.lat
        lon = lon if lon is not None else self.profile.lon
        d = schools_svc.detail(self.nav, school_id, lat, lon)
        self.results = [d.school]
        s = d.school
        out = self._school(s)
        out["phone"], out["website"] = self.book.field(s.phone), self.book.field(s.website)
        if s.license:
            out["license"] = self.book.field(s.license)
        out["how_to_apply"] = [{"text": a.text, "cite": self.book.field(a.field)["cite"], "verification": a.field.method} for a in d.how_to_apply]
        out["nearby_parks"] = [{"name": n.name, "distance_mi": self.book.field(n.distance_mi)} for n in d.nearby_parks]
        out["nearby_libraries"] = [{"name": n.name, "distance_mi": self.book.field(n.distance_mi)} for n in d.nearby_libraries]
        out["questions_to_ask"], out["notes"] = d.questions_to_ask, d.notes
        return out

    def _t_compare(self, ids: list[str], lat=None, lon=None) -> dict:
        lat = lat if lat is not None else self.profile.lat
        lon = lon if lon is not None else self.profile.lon
        c = compare_svc.compare(self.nav, ids, lat, lon)
        origin = (lat, lon) if lat is not None and lon is not None else None
        self.results = [schools_svc.summarize(self.nav, schools_svc.get_place(self.nav, i), origin=origin) for i in dict.fromkeys(ids)]
        return {"schools": c.schools, "rows": [{"label": r.label, "cells": [self.book.field(x) for x in r.cells], "best_index": r.best_index} for r in c.rows],
                "notes": c.notes}

    def _t_get_dates(self) -> dict:
        d = dates_svc.get_dates(self.nav)
        rules = [{"id": r["id"], "title": r["title"], "text": r["text"], "applies_to": r["applies_to"], "verification": r["verification"],
                  "cite": self.book.field(self.nav.rule_field(r["id"]))["cite"]} for r in self.nav.rules.get("rules", [])]
        return {"dates": [{"label": k.label, "date": k.date, "approximate": k.approximate, "days_until": k.days_until,
                           "cite": self.book.field(k.field)["cite"], "verification": k.field.method} for k in d.dates], "rules": rules, "notes": d.notes}

    def _t_get_pathway(self, lat=None, lon=None, children=None, free_only=None, radius_mi=None) -> dict:
        lat, lon = self._loc(lat, lon)
        kids = children or [c.model_dump() for c in self.profile.children]
        req = PathwayRequest(lat=lat, lon=lon, children=[Child(**c) for c in kids], free_only=bool(free_only if free_only is not None else self.profile.free_only),
                             radius_mi=float(radius_mi or 3.0), priorities=list(self.profile.priorities), values=list(self.profile.values))
        p = pathway_svc.pathway(self.nav, req)
        return {"zones": self._zones(p.zones), "notes": p.notes, "children": [
            {"age": c.age, "name": c.name, "grade": c.grade_label, "stages": [
                {"stage": s.stage, "status": s.status, "estimate_note": s.estimate_note,
                 "options": [{"name": o.name, "place_id": o.place_id, "match_score": o.match_score, "reasons": o.reasons, "info": self.book.field(o.label)} for o in s.options],
                 "key_dates": [{"label": k.label, "date": k.date, "days_until": k.days_until, "cite": self.book.field(k.field)["cite"]} for k in s.key_dates]}
                for s in c.stages if s.status != "past"]} for c in p.children]}


def dumps(obj: Any) -> str:
    return json.dumps(obj, default=str, ensure_ascii=False, separators=(",", ":"))
