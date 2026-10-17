"""Download every county layer to data/snapshots/*.json.gz (run once, then commit or ship the snapshots)."""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app.config import get_settings  # noqa: E402
from app.ingest.arcgis import fetch_features, write_snapshot  # noqa: E402
from app.ingest.datasets import ARCGIS_DATASETS  # noqa: E402

if __name__ == "__main__":
    s = get_settings()
    for ds in ARCGIS_DATASETS.values():
        feats = fetch_features(ds)
        meta = write_snapshot(s.snapshot_dir / f"{ds.key}.json.gz", ds, feats)
        print(f"{ds.key}: {meta['record_count']} features")
