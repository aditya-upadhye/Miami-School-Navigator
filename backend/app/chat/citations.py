"""Registry that turns every Field's provenance into a short citation id the model can reference as [c1]."""
from __future__ import annotations

from ..schemas import Field


class CitationBook:
    def __init__(self) -> None:
        self._ids: dict[tuple, str] = {}
        self.entries: dict[str, dict] = {}

    def cite(self, source: str, url: str | None, as_of: str | None, status: str | None) -> str:
        key = (source, url, as_of, status)
        if key not in self._ids:
            cid = f"c{len(self._ids) + 1}"
            self._ids[key] = cid
            self.entries[cid] = {"source": source, "url": url, "as_of": as_of, "status": status}
        return self._ids[key]

    def field(self, f: Field | None) -> dict | None:
        """Compact form of a Field for the model: value + status + citation id (+ why/next step when missing)."""
        if f is None:
            return None
        out: dict = {"v": f.value, "status": f.status, "cite": self.cite(f.source, f.url, f.as_of, f.status)}
        if f.status == "not_available":
            out["why"], out["next"] = f.why, f.suggested_action
        elif f.method and "Check:" in f.method:
            out["check"] = f.method.split("Check:", 1)[1].strip()  # a doubt about this value that must be passed on to the family
        return out
