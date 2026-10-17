#!/usr/bin/env python3
"""Fetch notable alumni of Miami-Dade schools from Wikidata and match to navigator.db.

Source: Wikidata SPARQL (P69 educated at, P106 occupation, P569 birth date) for
schools located (P131*) in Miami-Dade County (Q468557). Only people who already
have public Wikidata items are included. NOT a representative outcome statistic.

Usage: python backend/scripts/fetch_notable_alumni.py [--refresh]
Output: backend/data/outcomes/notable_alumni.json.gz (+ notable_alumni_cache/)
"""
import argparse, gzip, hashlib, json, math, re, sqlite3, time
from pathlib import Path
import urllib.parse, urllib.request

ROOT = Path(__file__).resolve().parents[1]
OUT_DIR = ROOT / "data" / "outcomes"
CACHE = OUT_DIR / "notable_alumni_cache"
DB = ROOT / "data" / "navigator.db"
UA = "MiamiSchoolNavigator/0.1 (kaviya@neuralseek.com; notable-alumni research, low volume)"
SPARQL = "https://query.wikidata.org/sparql"
DELAY = 2.0

QUERY = """
SELECT ?school ?coord ?person WHERE {
  ?school wdt:P131* wd:Q468557 .
  ?person wdt:P69 ?school .
  OPTIONAL { ?school wdt:P625 ?coord }
}
"""
API = "https://www.wikidata.org/w/api.php"

# Ordered keyword rules on lowercase English occupation labels (first match wins per label;
# a person gets the first group in GROUP_ORDER that any of their occupations hits).
RULES = {
    "physician": ["physician", "surgeon", "psychiatrist", "cardiologist", "pediatrician", "dentist", "nurse", "veterinarian", "medical"],
    "scientist": ["scientist", "physicist", "chemist", "biologist", "mathematician", "astronomer", "astronaut", "neuroscientist", "economist", "researcher", "geologist", "psychologist", "academic", "professor", "university teacher"],
    "engineer": ["engineer", "inventor", "computer programmer", "software developer", "architect"],
    "athlete": ["player", "athlete", "footballer", "boxer", "sprinter", "swimmer", "runner", "golfer", "wrestler", "coach", "racing driver", "jockey", "olympic", "diver", "gymnast", "tennis", "baseball", "basketball", "sport", "mixed martial", "judoka", "fencer", "rower", "cyclist", "umpire", "referee"],
    "politician": ["politician", "lawyer", "judge", "diplomat", "jurist", "civil servant", "mayor", "prosecutor", "activist", "military officer", "legislator", "statesperson", "attorney", "official"],
    "artist": ["actor", "actress", "singer", "musician", "rapper", "composer", "songwriter", "painter", "artist", "writer", "novelist", "poet", "journalist", "film", "director", "producer", "dancer", "comedian", "model", "photographer", "presenter", "disc jockey", "screenwriter", "playwright", "author", "cartoonist", "designer", "television", "voice", "influencer", "youtuber", "drummer", "guitarist", "pianist", "vocalist", "columnist", "blogger", "critic", "podcaster"],
    "business": ["businessperson", "entrepreneur", "executive", "banker", "investor", "business", "chief executive", "real estate", "financier", "manager", "restaurateur", "philanthropist"],
}
GROUP_ORDER = ["physician", "scientist", "engineer", "athlete", "politician", "artist", "business"]


def occupation_group(labels):
    low = [l.lower() for l in labels]
    for g in GROUP_ORDER:
        for l in low:
            if any(k in l for k in RULES[g]):
                return g
    return "other"


def http_json(url, data=None):
    try:
        req = urllib.request.Request(url, data=data.encode() if data else None,
                                     headers={"User-Agent": UA, "Accept": "application/json"})
        with urllib.request.urlopen(req, timeout=180) as r:
            return json.loads(r.read())
    except urllib.error.URLError:  # e.g. missing Python CA bundle on macOS; use system curl
        import subprocess
        cmd = ["curl", "-sS", "-m", "180", "-A", UA, "-H", "Accept: application/json"]
        cmd += ["--data", data, url] if data else [url]
        return json.loads(subprocess.run(cmd, capture_output=True, check=True).stdout)


def cached(name, fn, refresh):
    CACHE.mkdir(parents=True, exist_ok=True)
    f = CACHE / name
    if f.exists() and not refresh:
        return json.loads(f.read_text())
    time.sleep(DELAY)
    d = fn()
    f.write_text(json.dumps(d))
    return d


def wbget(ids, props, refresh):
    """Batched wbgetentities (50/call), cached per batch."""
    out = {}
    ids = sorted(set(ids))
    for i in range(0, len(ids), 50):
        chunk = ids[i:i + 50]
        key = "wbget_%s_%s.json" % (props.replace("|", "-"), hashlib.sha1("|".join(chunk).encode()).hexdigest()[:10])
        url = API + "?" + urllib.parse.urlencode({"action": "wbgetentities", "ids": "|".join(chunk), "props": props,
                                                  "languages": "en", "format": "json"})
        d = cached(key, lambda: http_json(url), refresh)
        out.update(d.get("entities", {}))
    return out


def label(e):
    return (e.get("labels", {}).get("en") or {}).get("value")


def fetch_all(refresh):
    sp = cached("sparql_school_alumni.json", lambda: http_json(SPARQL, urllib.parse.urlencode(
        {"query": QUERY, "format": "json"})), refresh)
    rows = sp["results"]["bindings"]
    persons = wbget([r["person"]["value"].rsplit("/", 1)[-1] for r in rows], "labels|claims", refresh)
    schools = wbget([r["school"]["value"].rsplit("/", 1)[-1] for r in rows], "labels", refresh)
    occ_ids = set()
    for e in persons.values():
        for c in e.get("claims", {}).get("P106", []):
            v = c.get("mainsnak", {}).get("datavalue", {}).get("value")
            if isinstance(v, dict):
                occ_ids.add(v["id"])
    occs = wbget(occ_ids, "labels", refresh)
    return rows, persons, schools, occs


STOP = {"the", "of", "and", "school", "schools", "high", "senior", "sr", "jr", "junior", "middle", "elementary", "academy", "preparatory", "prep", "center", "inc", "charter", "in", "at"}


def norm(s):
    s = s.lower().replace("la salle", "lasalle").replace("&", " and ").replace("saint", "st").replace("st.", "st")
    s = re.sub(r"[^a-z0-9 ]", " ", s)
    return " ".join(w for w in s.split() if w not in STOP)


def levels(s):
    s = s.lower()
    out = set()
    if "elementary" in s:
        out.add("elementary")
    if "middle" in s:
        out.add("middle")
    if "high" in s or "senior" in s or "upper school" in s:
        out.add("high")
    return out


def hav(a, b):
    la1, lo1, la2, lo2 = map(math.radians, (a[0], a[1], b[0], b[1]))
    h = math.sin((la2 - la1) / 2) ** 2 + math.cos(la1) * math.cos(la2) * math.sin((lo2 - lo1) / 2) ** 2
    return 6371 * 2 * math.asin(math.sqrt(h))


def match_school(label, coord, places):
    """Normalized-name match with school-level compatibility (elementary/middle/high).
    With coords: nearest candidate within 1.5 km. Fuzzy pass: token-subset names within 1 km.
    Without coords: only an unambiguous name. Returns None rather than guess."""
    n = norm(label)
    if not n:
        return None
    lv = levels(label)
    ok = lambda p: (not lv) or levels(p["name"]) == lv or (lv == {"high"} and "upper" in p["name"].lower())
    cands = [p for p in places if p["n"] == n and ok(p)]
    if not coord:
        return cands[0]["id"] if len(cands) == 1 else None
    near = [p for p in cands if hav(coord, (p["lat"], p["lon"])) <= 1.5]
    if near:
        return min(near, key=lambda p: hav(coord, (p["lat"], p["lon"])))["id"]
    nt = set(n.split())
    fuzzy = [p for p in places if lv and ok(p) and p["n"] and (set(p["n"].split()) <= nt or nt <= set(p["n"].split()))
             and hav(coord, (p["lat"], p["lon"])) <= 1.0]
    return fuzzy[0]["id"] if len(fuzzy) == 1 else None


NON_K12 = re.compile(r"universit|college|hospital|medical|institute|school of|district|county public|conservatory|frost|ad school|health", re.I)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--refresh", action="store_true")
    a = ap.parse_args()
    rows, persons, school_ents, occs = fetch_all(a.refresh)
    con = sqlite3.connect(DB)
    places = [{"id": i, "name": n, "city": c, "lat": la, "lon": lo, "n": norm(n)} for i, n, c, la, lo in
              con.execute("select id,name,city,lat,lon from places where kind in ('public','charter','private')")]
    recs, schools, matched, seen = [], {}, {}, set()
    for b in rows:
        g = lambda k: b.get(k, {}).get("value")
        sq = g("school").rsplit("/", 1)[-1]
        pq = g("person").rsplit("/", 1)[-1]
        if (sq, pq) in seen:
            continue
        seen.add((sq, pq))
        coord = None
        m = re.match(r"Point\(([-\d.]+) ([-\d.]+)\)", g("coord") or "")
        if m:
            coord = (float(m.group(2)), float(m.group(1)))
        if sq not in matched:
            schools[sq] = label(school_ents.get(sq, {})) or sq
            matched[sq] = match_school(schools[sq], coord, places)
        if NON_K12.search(schools[sq]) and not matched[sq]:
            continue  # colleges/hospitals/districts: out of scope
        pe = persons.get(pq, {})
        cl = pe.get("claims", {})
        if not any((c["mainsnak"].get("datavalue", {}).get("value") or {}).get("id") == "Q5"
                   for c in cl.get("P31", [])):
            continue  # humans only
        name = label(pe)
        if not name:
            continue
        birth = None
        for c in cl.get("P569", []):
            t = (c["mainsnak"].get("datavalue", {}).get("value") or {}).get("time")
            if t:
                birth = t
                break
        by = re.match(r"^\+(\d{4})", birth) if birth else None
        decade = (int(by.group(1)) // 10 * 10) if by else None
        olabs = []
        for c in cl.get("P106", []):
            v = c["mainsnak"].get("datavalue", {}).get("value")
            if isinstance(v, dict) and label(occs.get(v["id"], {})):
                olabs.append(label(occs[v["id"]]))
        recs.append({"place_id": matched[sq], "school_name": schools[sq], "wikidata_qid": sq,
                     "person_qid": pq, "person_name": name,
                     "occupation_group": occupation_group(olabs), "occupations": olabs,
                     "birth_decade": decade, "source_url": "https://www.wikidata.org/wiki/" + pq})
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    with gzip.open(OUT_DIR / "notable_alumni.json.gz", "wt", encoding="utf-8") as f:
        json.dump({"note": "Notable people with public Wikidata items only; not a representative outcome statistic.",
                   "source": "Wikidata P69/P106/P569, CC0", "records": recs}, f, ensure_ascii=False)
    ns = len(schools); nm = sum(1 for v in matched.values() if v)
    print(f"schools with alumni: {ns}, matched to DB: {nm}; records: {len(recs)}, matched records: {sum(1 for r in recs if r['place_id'])}")


if __name__ == "__main__":
    main()
