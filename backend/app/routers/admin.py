"""For administrators: the accounts, and what is computing on the shared HAPS account.

    GET    /api/admin/users          every account, with how many studies it holds
    POST   /api/admin/users          {email, name, password, role}: an account (the way in when registration is closed)
    PATCH  /api/admin/users/ID       {role?, is_active?, name?, new_password?}
    DELETE /api/admin/users/ID       the account and everything it created
    GET    /api/admin/jobs           the last waves sent, whoever sent them

An administrator sees accounts and jobs, never the content of somebody's study.
"""
from __future__ import annotations

from fastapi import APIRouter
from sqlalchemy import delete, func, select
from sqlalchemy.exc import IntegrityError

from .. import security
from ..deps import AdminUser, Db
from ..errors import AppError, not_found
from ..models import AuthSession, Job, Role, Study, User
from ..schemas import AdminJobOut, AdminUserCreate, AdminUserOut, AdminUserUpdate
from .account import Computing

router = APIRouter(prefix="/admin", tags=["admin"])


def shown(user: User, studies: int) -> AdminUserOut:
    return AdminUserOut.model_validate(user).model_copy(update={"study_count": studies})


def other_admin(db: Db, user: User) -> bool:
    return db.scalar(select(User.id).where(User.role == Role.ADMIN, User.is_active, User.id != user.id)) is not None


@router.get("/users", response_model=list[AdminUserOut])
def list_users(admin: AdminUser, db: Db) -> list[AdminUserOut]:
    counts = dict(db.execute(select(Study.owner_id, func.count()).group_by(Study.owner_id)).tuples().all())
    return [shown(u, counts.get(u.id, 0)) for u in db.scalars(select(User).order_by(User.created_at, User.id))]


@router.post("/users", response_model=AdminUserOut, status_code=201)
def create_user(body: AdminUserCreate, admin: AdminUser, db: Db) -> AdminUserOut:
    user = User(email=body.email, name=body.name, password_hash=security.hash_password(body.password), role=body.role)
    db.add(user)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise AppError(409, "email_taken", "an account already uses this e-mail", fields={"email": "already used"}) from None
    return shown(user, 0)


@router.patch("/users/{user_id}", response_model=AdminUserOut)
def update_user(user_id: int, body: AdminUserUpdate, admin: AdminUser, db: Db) -> AdminUserOut:
    user = db.get(User, user_id)
    if user is None:
        raise not_found("this account")
    demoted = body.role is Role.USER and user.role is Role.ADMIN
    closed = body.is_active is False and user.is_active
    if (demoted or closed) and user.role is Role.ADMIN and not other_admin(db, user):
        raise AppError(409, "last_admin", "this is the only administrator: name another one first")
    if body.role is not None:
        user.role = body.role
    if body.name is not None:
        user.name = body.name
    if body.is_active is not None:
        user.is_active = body.is_active
    if body.new_password is not None:
        user.password_hash = security.hash_password(body.new_password)
    if closed or body.new_password is not None:                      # signed out everywhere, at once
        db.execute(delete(AuthSession).where(AuthSession.user_id == user.id))
    db.commit()
    count = db.scalar(select(func.count()).select_from(Study).where(Study.owner_id == user.id)) or 0
    return shown(user, count)


@router.delete("/users/{user_id}", status_code=204)
def delete_user(user_id: int, admin: AdminUser, db: Db, compute: Computing) -> None:
    user = db.get(User, user_id)
    if user is None:
        raise not_found("this account")
    if user.id == admin.id:
        raise AppError(409, "own_account", "delete your own account from your account settings")
    compute.stop_all(db, owner_id=user.id)
    db.delete(user)
    db.commit()
    compute.forget(user_id)


@router.get("/jobs", response_model=list[AdminJobOut])
def list_jobs(admin: AdminUser, db: Db) -> list[AdminJobOut]:
    rows = db.execute(select(Job, User.email).join(User, User.id == Job.owner_id).order_by(Job.created_at.desc()).limit(100)).tuples().all()
    return [AdminJobOut(id=j.id, state=j.state, user=email, study=j.study_id, runs=len(j.runs), created_at=j.created_at, finished_at=j.finished_at)
            for j, email in rows]
