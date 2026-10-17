"""Write self-contained Grok prompts for the schools near a point, each school listed with only the fields still missing.

    python scripts/make_grok_batches.py            # writes ../grok_research/batch_*.md and SCHOOLS.md

Reads the built database (data/navigator.db), so run `python -m app.ingest.build` first; re-running after a merge shrinks every list.
"""
from __future__ import annotations

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

from app.services.context import load_navigator  # noqa: E402
from app.services.schools import get_place, search, summarize  # noqa: E402

OUT = ROOT.parent / "grok_research"
LAT, LON, RADIUS = 25.79866, -80.19998, 3.0  # 2250 NW 2nd Ave, 33127: the demo address
BATCH = {"public_charter_elementary": 18, "private_elementary": 24, "other": 22}

INSTRUCTIONS = (Path(__file__).with_name("grok_instructions.md")).read_text()


def needs(s, p) -> list[str]:
    kind, n = s.kind, []
    gap = lambda f: f.status == "not_available"  # noqa: E731
    weak = lambda f: f.status in ("not_available", "derived")  # a name-keyword guess is not a verified program list  # noqa: E731
    if gap(s.website):
        n.append("website")
    n += ["school_hours", "aftercare", "ese"]
    if weak(s.specialties):
        n.append("specialties")
    if kind == "public" and gap(s.is_magnet):
        n += ["is_magnet", "magnet_themes"]
    if kind == "private":
        n += ["tuition", "scholarships", "application_method"]
        if gap(s.enrollment):
            n.append("enrollment")
    if kind in ("public", "charter") and gap(s.enrollment):
        n.append("enrollment")
    return n


def main() -> None:
    nav = load_navigator()
    res = search(nav, lat=LAT, lon=LON, radius_mi=RADIUS, kinds=["public", "charter", "private"], limit=100, sort="distance")
    seen = {s.id: s for s in res.results}
    for kinds in (["public"], ["charter"], ["private"]):  # the search caps a page at 100: collect each kind separately
        for s in search(nav, lat=LAT, lon=LON, radius_mi=RADIUS, kinds=kinds, limit=100, sort="distance").results:
            seen[s.id] = s
    rows = []
    for s in sorted(seen.values(), key=lambda s: s.distance_mi.value if s.distance_mi else 99):
        p = get_place(nav, s.id)
        s = summarize(nav, p, origin=(LAT, LON))
        elementary = "elementary" in s.stages.value if isinstance(s.stages.value, list) else False
        group = "private_elementary" if s.kind == "private" and elementary else "public_charter_elementary" if s.kind != "private" and elementary else "other"
        rows.append((group, s, p, needs(s, p)))
    OUT.mkdir(exist_ok=True)
    for old in OUT.glob("batch_*.md"):
        old.unlink()
    index, n = ["# Schools within 3 miles of 2250 NW 2nd Ave (public, charter, private)\n"], 0
    for group, label in (("public_charter_elementary", "Public and charter, serving elementary grades"),
                         ("private_elementary", "Private, serving elementary grades"), ("other", "Everything else (other grade levels)")):
        g = [r for r in rows if r[0] == group]
        index.append(f"\n## {label} ({len(g)})\n")
        size = BATCH[group]
        for i in range(0, len(g), size):
            n += 1
            chunk = g[i:i + size]
            name = f"batch_{n:02d}_{group}.md"
            table = ["| # | id | name | type | grades (county) | address | mi | M-DCPS/state number | already have | NEEDS |", "|---|---|---|---|---|---|---|---|---|---|"]
            for j, (_, s, p, nd) in enumerate(chunk, 1):
                have = [k for k in ("state_grade", "enrollment", "website", "phone", "specialties", "is_magnet") if getattr(s, k).status != "not_available" and not (k == "specialties" and k in nd)]
                table.append(f"| {j} | {s.id} | {s.name} | {s.kind} | {s.grades.value} | {s.address}, {s.zip} | {s.distance_mi.value} | {p['source_id']} | {', '.join(have) or '-'} | {', '.join(nd)} |")
            (OUT / name).write_text(INSTRUCTIONS.replace("{{N}}", str(len(chunk))) + "\n\n## SCHOOLS FOR THIS BATCH\n\n" + "\n".join(table) + "\n")
            index.append(f"**{name}** ({len(chunk)}): " + "; ".join(f"{s.name}" for _, s, _, _ in chunk) + "\n")
    (OUT / "SCHOOLS.md").write_text("\n".join(index))
    print(f"{len(rows)} schools in {n} batches -> {OUT}")


if __name__ == "__main__":
    main()
