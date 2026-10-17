"""Researched school data (data/curated/school_research.json): source-cited values for the schools used in the demo.

Each school entry carries cited values: {"value", "year", "source_type", "source_url", "as_of", "confidence", "note"}. A value is
only loaded when it is present (null means "not found" and the field stays `not_available`). Loaded values override what the county
and FLDOE ingest produced for that school, and carry their own source URL, date and confidence so the UI can show where they came from.

File layout: {"as_of", "source", "hidden": {place_id: reason}, "schools": [<one object per school, keyed by "id">]}. `hidden` takes a
school out of search and pathway results (closed or duplicate county records); it stays reachable by id.
"""
from __future__ import annotations

import json
import logging
import re
import sqlite3
from pathlib import Path
from urllib.parse import urlparse

log = logging.getLogger("ingest.research")
RESEARCH_FILE = "school_research.json"

STATUS_FOR_SOURCE = {"official": "official", "school": "reported_by_school", "third_party": "derived", "derived": "derived"}
SOURCE_LABELS = (("fldoe.org", "Florida Department of Education"), ("yourchoicemiami.org", "M-DCPS magnet programs"),
                 ("dadeschools.net", "Miami-Dade County Public Schools"), ("miamidade.gov", "Miami-Dade County GIS"),
                 ("mdc.edu", "Miami Dade College"), ("sfasas.org", "South Florida After-School All-Stars"))
VALID_GRADES = set("ABCDF")


def _source_label(url: str | None, source_type: str | None) -> str:
    host = (urlparse(url).hostname or "").removeprefix("www.") if url else ""
    for domain, label in SOURCE_LABELS:
        if host == domain or host.endswith("." + domain):
            return label
    if host:
        return f"{host} ({'school website' if source_type == 'school' else 'web source'})"
    return "Researched from public sources"


def _has_value(v) -> bool:
    return v is not None and v != "" and v != [] and v != {}


def _end_year(label) -> int | None:
    """'2025-26' -> 2026 (the School Grades year convention); '2026' -> 2026."""
    m = re.match(r"^(\d{4})(?:-(\d{2}))?", str(label or ""))
    if not m:
        return None
    return int(m.group(1)[:2] + m.group(2)) if m.group(2) else int(m.group(1))


def _website(v) -> str | None:
    t = str(v or "").strip()
    return t if re.match(r"^https?://\S+\.\S+$", t) else None


def _num(v):
    return float(v) if isinstance(v, (int, float)) and not isinstance(v, bool) else None


def _entry(cited: dict, value, researched_on: str | None) -> dict:
    """Normalised record stored under extra["research"][key]; `value` is the already-cleaned value."""
    return {"value": value, "year": cited.get("year"), "status": STATUS_FOR_SOURCE.get(cited.get("source_type"), "derived"),
            "source": _source_label(cited.get("source_url"), cited.get("source_type")), "url": cited.get("source_url"),
            "as_of": cited.get("as_of") or researched_on, "confidence": cited.get("confidence") or "medium",
            "note": cited.get("note")}


def _cited(obj: dict, key: str, *, optional: bool = False) -> dict | None:
    c = (obj.get("optional") or {}).get(key) if optional else obj.get(key)
    return c if isinstance(c, dict) and _has_value(c.get("value")) else None


def _clean_theme(s: str) -> str:
    return s.strip().rstrip("*").strip()


def _extract(obj: dict, kind: str, curated_magnet: bool = False) -> tuple[dict, dict]:
    """(research entries, column updates) for one school object."""
    on = obj.get("researched_on")
    r: dict[str, dict] = {}
    cols: dict = {}

    def put(key: str, cited: dict | None, value=None, *, clean=None):
        if cited is None:
            return None
        v = cited["value"] if value is None else value
        v = clean(v) if clean else v
        if not _has_value(v) and v is not False:
            return None
        r[key] = _entry(cited, v, on)
        return v

    grade = put("state_grade", _cited(obj, "state_grade"), clean=lambda v: str(v).strip().upper() if str(v).strip().upper() in VALID_GRADES else None)
    if grade:
        cols["state_grade"] = grade
        cols["state_grade_year"] = _end_year((obj["state_grade"] or {}).get("year"))
    for key in ("gains_ela", "gains_math"):
        v = put(key, _cited(obj, key), clean=_num)
        if v is not None:
            cols[key] = v
    v = put("enrollment", _cited(obj, "enrollment"), clean=lambda v: int(v) if _num(v) and v > 0 else None)
    if v:
        cols["enrollment"] = v
    v = put("phone", _cited(obj, "phone"), clean=lambda v: re.sub(r"\s+", " ", str(v)).strip())
    if v:
        cols["phone"] = v
    v = put("website", _cited(obj, "website"), clean=_website)
    if v:
        cols["website"] = v
    v = put("grades_served", _cited(obj, "grades_served"), clean=lambda v: str(v).strip())

    # magnet programs exist only for district schools; for charters a "not a magnet" answer carries no information
    if kind == "public" and not curated_magnet:  # a hand-verified magnet entry always wins
        magnet = obj.get("is_magnet")
        if isinstance(magnet, dict) and isinstance(magnet.get("value"), bool):
            r["is_magnet"] = _entry(magnet, magnet["value"], on)
            themes = [_clean_theme(x) for x in ((obj.get("magnet_themes") or {}).get("value") or []) if str(x).strip()]
            if magnet["value"]:
                cols["is_magnet"] = 1
                cols["magnet_themes"] = json.dumps(themes) if themes else None
            if themes:
                r["magnet_themes"] = _entry(obj["magnet_themes"], themes, on)

    # tags are only trusted when the research found some; an empty list means "nothing documented", not "verified none"
    tags = put("specialties", _cited(obj, "specialties"), clean=lambda v: [str(x).strip() for x in v if str(x).strip()] or None)
    if tags:
        r["specialties"]["detail"] = obj.get("specialties_detail") or {}

    ese = _cited(obj, "ese")
    if ese and isinstance(ese["value"], dict) and isinstance(ese["value"].get("offers_ese"), bool):
        r["ese"] = _entry(ese, bool(ese["value"]["offers_ese"]), on)
        r["ese"]["details"] = (ese["value"].get("details") or "").strip() or None
        if ese["value"]["offers_ese"]:
            cols["ese_signal"] = "researched"

    care = _cited(obj, "aftercare")
    if care and isinstance(care["value"], dict):
        cv = care["value"]
        keep = {k: cv.get(k) for k in ("before_care", "after_care", "hours", "cost", "provider") if _has_value(cv.get(k))}
        if keep:
            r["aftercare"] = _entry(care, keep, on)

    if kind == "private":  # private schools have no state data: tuition and scholarship participation come from the school and FLDOE's directory
        put("tuition", _cited(obj, "tuition"), clean=lambda v: _num(v) if _num(v) and v > 0 else None)
        sch = obj.get("scholarships")
        if isinstance(sch, dict) and isinstance(sch.get("value"), list):  # an empty list is a real answer: "accepts none"
            names = [str(x).strip() for x in sch["value"] if str(x).strip()]
            r["scholarships"] = _entry(sch, names, on)
            cols["scholarship_flags"] = json.dumps(names)

    for key, clean in (("proficiency_ela", _num), ("proficiency_math", _num), ("school_hours", lambda v: str(v).strip()),
                       ("application_method", lambda v: str(v).strip())):
        c = _cited(obj, key, optional=True)
        if c:
            fldoe = "fldoe" in (c.get("source_url") or "")  # the optional entries are bare {value, source_url, as_of} records
            c = {"source_type": "official" if fldoe else "school", "confidence": "high" if fldoe else "medium", **c}
            put(key, c, clean=clean)
    return r, cols


def apply(conn: sqlite3.Connection, directory: Path) -> dict:
    path = directory / RESEARCH_FILE
    if not path.exists():
        return {"school_research": "file missing"}
    doc = json.loads(path.read_text())
    hidden = doc.get("hidden") or {}
    by_id = {r["id"]: r for r in conn.execute("SELECT id, kind, extra FROM places")}
    matched, unmatched, fields = 0, [], 0
    for obj in doc.get("schools", []):
        place = by_id.get(obj.get("id"))
        if place is None:
            unmatched.append(obj.get("id"))
            continue
        extra = json.loads(place["extra"] or "{}")
        research, cols = _extract(obj, place["kind"], curated_magnet="magnet" in extra)
        extra["research"] = research
        extra["research_note"] = obj.get("identity_note")
        if place["id"] in hidden:
            extra["hidden"] = hidden[place["id"]]
        sets = ", ".join(f"{k}=?" for k in cols)
        conn.execute(f"UPDATE places SET {sets + ', ' if sets else ''}extra=? WHERE id=?", [*cols.values(), json.dumps(extra), place["id"]])
        matched += 1
        fields += len(research)
    for pid, reason in hidden.items():  # hidden ids that have no research entry still need the flag
        place = by_id.get(pid)
        if place is not None and not any(o.get("id") == pid for o in doc.get("schools", [])):
            extra = json.loads(place["extra"] or "{}")
            extra["hidden"] = reason
            conn.execute("UPDATE places SET extra=? WHERE id=?", (json.dumps(extra), pid))
    src = doc.get("source", {})
    conn.execute("INSERT OR REPLACE INTO datasets (name,title,url,retrieved_at,record_count,as_of,notes) VALUES (?,?,?,?,?,?,?)",
                 ("school_research", src.get("title", "Researched school data"), src.get("url"), doc.get("as_of") or "", matched,
                  doc.get("as_of"), (doc.get("_readme") or "")[:300]))
    conn.commit()
    return {"school_research": {"schools": len(doc.get("schools", [])), "matched": matched, "fields_loaded": fields,
                                "hidden": len(hidden), "unmatched": unmatched}}
