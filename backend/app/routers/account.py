"""The account of whoever is signed in.

    PATCH  /api/account               {name?, email?, current_password?}: the e-mail changes only with the password
    PUT    /api/account/password      {current_password, new_password}: every other browser is signed out
    GET    /api/account/sessions      where this account is signed in
    DELETE /api/account/sessions/ID   sign one of them out
    DELETE /api/account               {password}: the account and everything it created
"""
from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends, Request, Response
from sqlalchemy import delete, select
from sqlalchemy.exc import IntegrityError

from .. import security
from ..compute import Compute
from ..deps import Config, CurrentSession, CurrentUser, Db, close_session, open_session
from ..errors import AppError, not_found
from ..models import AuthSession, Role, User
from ..schemas import DeleteAccountIn, DeviceOut, PasswordIn, ProfileIn, SessionOut, UserOut

router = APIRouter(prefix="/account", tags=["account"])


def get_compute(request: Request) -> Compute:
    compute: Compute = request.app.state.compute
    return compute


Computing = Annotated[Compute, Depends(get_compute)]


def checked(user: User, password: str | None, field: str = "current_password") -> None:
    if not password or not security.verify_password(password, user.password_hash):
        raise AppError(403, "wrong_password", "the current password is not right", fields={field: "not right"})


@router.patch("", response_model=UserOut)
def update_profile(body: ProfileIn, user: CurrentUser, db: Db) -> User:
    if body.email is not None and body.email != user.email:
        checked(user, body.current_password)
        user.email = body.email
    if body.name is not None:
        user.name = body.name
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise AppError(409, "email_taken", "an account already uses this e-mail", fields={"email": "already used"}) from None
    return user


@router.put("/password", response_model=SessionOut)
def change_password(body: PasswordIn, request: Request, response: Response, session: CurrentSession, db: Db, settings: Config) -> SessionOut:
    user = session.user
    checked(user, body.current_password)
    if body.new_password.lower() == user.email:
        raise AppError(422, "validation_error", "choose a password that is not your e-mail", fields={"new_password": "it is your e-mail"})
    user.password_hash = security.hash_password(body.new_password)
    # whoever knew the old password is signed out everywhere, and this browser gets a new session
    db.execute(delete(AuthSession).where(AuthSession.user_id == user.id))
    opened = open_session(db, request, response, settings, user)
    db.commit()
    return SessionOut(user=UserOut.model_validate(user), csrf=opened.csrf_token)


@router.get("/sessions", response_model=list[DeviceOut])
def sessions(session: CurrentSession, db: Db) -> list[DeviceOut]:
    rows = db.scalars(select(AuthSession).where(AuthSession.user_id == session.user_id).order_by(AuthSession.last_seen_at.desc()))
    return [DeviceOut.model_validate(r).model_copy(update={"current": r.id == session.id}) for r in rows]


@router.delete("/sessions/{session_id}", status_code=204)
def sign_out_elsewhere(session_id: int, response: Response, session: CurrentSession, db: Db, settings: Config) -> None:
    row = db.scalar(select(AuthSession).where(AuthSession.id == session_id, AuthSession.user_id == session.user_id))
    if row is None:
        raise not_found("this session")
    if row.id == session.id:
        close_session(db, response, settings, session)
    else:
        db.delete(row)
    db.commit()


@router.delete("", status_code=204)
def delete_account(body: DeleteAccountIn, response: Response, session: CurrentSession, db: Db, settings: Config, compute: Computing) -> None:
    user = session.user
    checked(user, body.password, "password")
    if user.role is Role.ADMIN and not db.scalar(select(User.id).where(User.role == Role.ADMIN, User.is_active, User.id != user.id)):
        raise AppError(409, "last_admin", "this is the only administrator: name another one first")
    compute.stop_all(db, owner_id=user.id)
    close_session(db, response, settings, session)
    owner = user.id
    db.delete(user)                                                  # its sessions, studies, results, jobs and guides go with it
    db.commit()
    compute.forget(owner)
