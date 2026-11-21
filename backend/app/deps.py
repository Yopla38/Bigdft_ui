"""What a route asks for before it runs: who is signed in, with which rights, and that the request is the page's own.

Three guards, in the order a request meets them:

* ``csrf_guard`` — on every address of the API. A request that changes something
  must come from an allowed origin and carry the token of its session in
  ``X-CSRF-Token``: a page of another site can make a browser send the cookie,
  it cannot read that token.
* ``current_user`` — the account behind the session cookie, or 401.
* ``require_admin`` — the same, with the ADMIN role, or 403.
"""
from __future__ import annotations

from datetime import timedelta
from typing import Annotated

from fastapi import Depends, Request, Response
from sqlalchemy import delete, select
from sqlalchemy.orm import Session

from . import security
from .config import Settings, get_settings
from .db import get_db
from .errors import AppError
from .models import AuthSession, Role, User, now

SAFE = {"GET", "HEAD", "OPTIONS"}
TOUCH_EVERY = timedelta(minutes=5)          # a session's "last seen" is written at most that often

Db = Annotated[Session, Depends(get_db)]
Config = Annotated[Settings, Depends(get_settings)]


def client_ip(request: Request) -> str:
    return (request.client.host if request.client else "")[:45]


def session_of(request: Request, db: Db, settings: Config) -> AuthSession | None:
    """The session of this request's cookie, while it lasts and its account is active."""
    if hasattr(request.state, "session"):
        found: AuthSession | None = request.state.session
        return found
    request.state.session = None
    token = request.cookies.get(settings.session_cookie)
    if not token:
        return None
    row = db.scalar(select(AuthSession).where(AuthSession.token_hash == security.digest(token)))
    if row is None:
        return None
    moment = now()
    if row.expires_at <= moment or not row.user.is_active:
        db.execute(delete(AuthSession).where(AuthSession.id == row.id))
        db.commit()
        return None
    if moment - row.last_seen_at > TOUCH_EVERY:
        row.last_seen_at, row.expires_at = moment, moment + timedelta(days=settings.session_days)
        db.commit()
    request.state.session = row
    return row


MaybeSession = Annotated[AuthSession | None, Depends(session_of)]


def csrf_guard(request: Request, session: MaybeSession, settings: Config) -> None:
    if request.method in SAFE:
        return
    origin = request.headers.get("origin")
    if origin is None or origin.lower() not in settings.allowed_origins:
        raise AppError(403, "bad_origin", "this server answers its own page only")
    if int(request.headers.get("content-length") or 0) and not (request.headers.get("content-type") or "").startswith("application/json"):
        raise AppError(415, "unsupported_media_type", "send JSON (Content-Type: application/json)")
    sent = request.headers.get("x-csrf-token", "")
    expected = session.csrf_token if session else request.cookies.get(settings.csrf_cookie, "")
    if not sent or not expected or not security.same(sent, expected):
        raise AppError(403, "bad_csrf", "this request does not carry the token of its session: reload the page")


def current_session(session: MaybeSession) -> AuthSession:
    if session is None:
        raise AppError(401, "not_authenticated", "sign in first")
    return session


CurrentSession = Annotated[AuthSession, Depends(current_session)]


def current_user(session: CurrentSession) -> User:
    return session.user


CurrentUser = Annotated[User, Depends(current_user)]


def require_admin(user: CurrentUser) -> User:
    if user.role is not Role.ADMIN:
        raise AppError(403, "forbidden", "this is for administrators")
    return user


AdminUser = Annotated[User, Depends(require_admin)]


# ── the cookies ──────────────────────────────────────────────────────────────
def set_cookie(response: Response, settings: Settings, name: str, value: str, *, days: int | None) -> None:
    response.set_cookie(name, value, max_age=days * 86400 if days else None, path="/", secure=settings.secure, httponly=True,
                        samesite=settings.cookie_samesite)


def clear_cookie(response: Response, settings: Settings, name: str) -> None:
    response.delete_cookie(name, path="/", secure=settings.secure, httponly=True, samesite=settings.cookie_samesite)


def open_session(db: Session, request: Request, response: Response, settings: Settings, user: User) -> AuthSession:
    """Sign *user* in on this browser: a new token, a new CSRF token, whatever the browser held before."""
    token, moment = security.new_token(), now()
    row = AuthSession(token_hash=security.digest(token), csrf_token=security.new_token(), user_id=user.id, created_at=moment,
                      last_seen_at=moment, expires_at=moment + timedelta(days=settings.session_days),
                      user_agent=(request.headers.get("user-agent") or "")[:200], ip=client_ip(request))
    db.add(row)
    user.last_login_at = moment
    db.flush()
    set_cookie(response, settings, settings.session_cookie, token, days=settings.session_days)
    set_cookie(response, settings, settings.csrf_cookie, row.csrf_token, days=settings.session_days)
    request.state.session = row
    return row


def close_session(db: Session, response: Response, settings: Settings, session: AuthSession | None) -> None:
    if session is not None:
        db.execute(delete(AuthSession).where(AuthSession.id == session.id))
    clear_cookie(response, settings, settings.session_cookie)
    clear_cookie(response, settings, settings.csrf_cookie)
