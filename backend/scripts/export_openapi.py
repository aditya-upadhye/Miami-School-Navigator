"""Write the API contract to backend/openapi.json (share it with the frontend; regenerate when the API changes)."""
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

from app.main import app  # noqa: E402

if __name__ == "__main__":
    (ROOT / "openapi.json").write_text(json.dumps(app.openapi(), indent=2) + "\n")
    print("wrote openapi.json:", len(app.openapi()["paths"]), "paths")
