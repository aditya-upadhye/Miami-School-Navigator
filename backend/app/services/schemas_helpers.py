from __future__ import annotations

from ..schemas import Field


def numeric(f: Field) -> float | None:
    v = f.value
    return float(v) if isinstance(v, (int, float)) and not isinstance(v, bool) else None
