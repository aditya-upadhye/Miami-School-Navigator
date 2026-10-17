"""Preschool-to-12th-grade pathway for each child.

Every stage lists the best-scoring schools inside the family's travel distance, using the same match score as the school search
(zoning, distance, state grade, the family's priorities, seat demand). Nothing is estimated or inferred.
"""
from __future__ import annotations

from ..domain import STAGES, grade_label_for_age, stage_for_age
from ..i18n import current_lang, t
from ..schemas import (ChildPathway, Field, PathwayOption, PathwayRequest, PathwayResponse, PathwayStage)
from .context import Navigator
from .dates import key_dates
from .plan import _entering
from .schools import search
from .zones import zoned_for

DATE_KINDS = {"pre_k": {"early_learning"}, "elementary": {"public"}, "middle": {"public"}, "high": {"public"}}


STAGE_KINDS = {"pre_k": ["early_learning", "public", "charter"], "elementary": ["public", "charter"], "middle": ["public", "charter"], "high": ["public", "charter"]}
TOP_N = 3


def _best(nav: Navigator, req: PathwayRequest, stage: str) -> list[PathwayOption]:
    """The best-scoring schools for `stage` inside the family's travel distance. Same ranking as /schools: nothing is guessed."""
    kinds = ["early_learning"] if stage == "infant_toddler" else STAGE_KINDS[stage]
    if req.free_only:
        kinds = [k for k in kinds if k not in ("private", "early_learning")]
    if not kinds:
        return []
    res = search(nav, lat=req.lat, lon=req.lon, radius_mi=req.radius_mi, kinds=kinds, stages=[stage], free_only=req.free_only,
                 priorities=req.priorities, values=req.values, sort="match", limit=TOP_N)
    return [PathwayOption(place_id=s.id, name=s.name, kind=s.kind, match_score=s.match_score, reasons=s.reasons, score_breakdown=s.score_breakdown,
                          label=s.distance_mi.model_copy(update={"method": t("m.path.ranked")}))
            for s in res.results]


def pathway(nav: Navigator, req: PathwayRequest) -> PathwayResponse:
    zones = zoned_for(nav, req.lat, req.lon)
    best = {st: _best(nav, req, st) for st in STAGES}  # one search per stage, shared by every child

    children = []
    for i, c in enumerate(req.children):
        cur = stage_for_age(c.age)
        cur_idx = STAGES.index(cur) if cur else len(STAGES)
        stages: list[PathwayStage] = []
        for idx, st in enumerate(STAGES):
            status = "past" if idx < cur_idx else "current" if idx == cur_idx else "future"
            options = best[st] if status != "past" else []
            note = None
            kd = key_dates(nav, DATE_KINDS.get(st)) if status != "past" and st in DATE_KINDS else []
            stages.append(PathwayStage(stage=st, label=t(f"path.stage.{st}"), ages=t(f"path.ages.{st}") if st != "elementary" else "K-5", status=status, options=options,
                                       estimate_note=note, key_dates=kd))
        children.append(ChildPathway(child_index=i, age=c.age, name=c.name, current_stage=cur, grade_label=_entering(c.age, current_lang()) if grade_label_for_age(c.age) else None, stages=stages))
    notes = []
    if req.free_only:
        notes.append(t("path.note.free_only"))
    return PathwayResponse(children=children, zones=zones, notes=notes)
