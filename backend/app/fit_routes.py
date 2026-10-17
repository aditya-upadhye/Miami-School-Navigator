"""Child fit note for the school page. Signed-in families only (the note is about their children), and the children come with the request:
nothing about them is stored."""
from __future__ import annotations

from fastapi import APIRouter, Depends

from .auth import User, current_user
from .routes import get_nav
from .schemas import ChildFitRequest, ChildFitResponse
from .services import child_fit as child_fit_svc
from .services.context import Navigator

router = APIRouter(prefix="/api", tags=["schools"])


@router.post("/schools/{school_id}/child-fit", response_model=ChildFitResponse)
def child_fit(school_id: str, body: ChildFitRequest, _user: User = Depends(current_user), nav: Navigator = Depends(get_nav)):
    return child_fit_svc.explain(nav, school_id, body)
