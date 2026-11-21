"""Guided paths added to the ones the workshop ships with: read by every member, published by administrators.

    GET    /api/guides        every published path
    POST   /api/guides        (ADMIN) {title, level, minutes, summary, origin, notebook}
    DELETE /api/guides/ID     (ADMIN)
"""
from __future__ import annotations

from fastapi import APIRouter
from sqlalchemy import select

from ..deps import AdminUser, CurrentUser, Db
from ..errors import not_found
from ..models import Guide
from ..schemas import GuideIn, GuideOut

router = APIRouter(prefix="/guides", tags=["guides"])


@router.get("", response_model=list[GuideOut])
def list_guides(user: CurrentUser, db: Db) -> list[Guide]:
    return list(db.scalars(select(Guide).order_by(Guide.created_at, Guide.id)))


@router.post("", response_model=GuideOut, status_code=201)
def publish_guide(body: GuideIn, admin: AdminUser, db: Db) -> Guide:
    guide = Guide(owner_id=admin.id, **body.model_dump(mode="json"))
    db.add(guide)
    db.commit()
    return guide


@router.delete("/{guide_id}", status_code=204)
def remove_guide(guide_id: int, admin: AdminUser, db: Db) -> None:
    guide = db.get(Guide, guide_id)
    if guide is None:
        raise not_found("this guided path")
    db.delete(guide)
    db.commit()
