"""Signing up, in and out, and who is signed in.

    GET  /api/auth/csrf        the token a page sends back with what changes something, before anyone is signed in
    POST /api/auth/register    {email, name, password} → the account, signed in
    POST /api/auth/login       {email, password}
    POST /api/auth/logout
    GET  /api/auth/me          the account of this session, or 401
"""
from __future__ import annotations

from datetime import timedelta

from fastapi import APIRouter, Request, Response
from sqlalchemy import delete, func, select
from sqlalchemy.exc import IntegrityError

from .. import security
from ..deps import Config, CurrentSession, Db, MaybeSession, clear_cookie, client_ip, close_session, open_session, set_cookie
from ..errors import AppError
from ..models import LoginAttempt, User, now
from ..schemas import CsrfOut, LoginIn, RegisterIn, SessionOut, UserOut

router = APIRouter(prefix="/auth", tags=["auth"])


@router.get("/csrf", response_model=CsrfOut)
def csrf(request: Request, response: Response, session: MaybeSession, settings: Config) -> CsrfOut:
    if session is not None:
        return CsrfOut(csrf=session.csrf_token, registration=settings.registration)
    token = request.cookies.get(settings.csrf_cookie) or security.new_token()
    if request.cookies.get(settings.session_cookie):                # a session that ended: its cookie is of no use any more
        clear_cookie(response, settings, settings.session_cookie)
        token = security.new_token()
    set_cookie(response, settings, settings.csrf_cookie, token, days=None)
    return CsrfOut(csrf=token, registration=settings.registration)


@router.post("/register", response_model=SessionOut, status_code=201)
def register(body: RegisterIn, request: Request, response: Response, db: Db, settings: Config, session: MaybeSession) -> SessionOut:
    if settings.registration != "open":
        raise AppError(403, "registration_closed", "accounts are created by an administrator here: ask for one")
    if body.password.lower() == body.email:
        raise AppError(422, "validation_error", "choose a password that is not your e-mail", fields={"password": "it is your e-mail"})
    user = User(email=body.email, name=body.name, password_hash=security.hash_password(body.password))
    db.add(user)
    try:
        db.flush()
    except IntegrityError:
        db.rollback()
        raise AppError(409, "email_taken", "an account already uses this e-mail: sign in instead",
                       fields={"email": "already used"}) from None
    close_session(db, response, settings, session)
    opened = open_session(db, request, response, settings, user)
    db.commit()
    return SessionOut(user=UserOut.model_validate(user), csrf=opened.csrf_token)


@router.post("/login", response_model=SessionOut)
def login(body: LoginIn, request: Request, response: Response, db: Db, settings: Config, session: MaybeSession) -> SessionOut:
    ip, moment = client_ip(request), now()
    since = moment - timedelta(minutes=settings.login_window_minutes)
    db.execute(delete(LoginAttempt).where(LoginAttempt.at < since))
    failed = db.scalar(select(func.count()).select_from(LoginAttempt)
                       .where(LoginAttempt.email == body.email, LoginAttempt.ip == ip, LoginAttempt.at >= since)) or 0
    if failed >= settings.login_max_attempts:
        db.commit()
        raise AppError(429, "too_many_attempts", f"too many attempts: wait {settings.login_window_minutes} minutes and try again",
                       headers={"Retry-After": str(settings.login_window_minutes * 60)})
    user = db.scalar(select(User).where(User.email == body.email))
    # one answer for an unknown e-mail, a wrong password and a closed account: none says which accounts exist
    if not security.verify_password(body.password, user.password_hash if user else None) or user is None or not user.is_active:
        db.add(LoginAttempt(email=body.email[:254], ip=ip, at=moment))
        db.commit()
        raise AppError(401, "invalid_credentials", "the e-mail or the password is not right")
    if security.needs_rehash(user.password_hash):
        user.password_hash = security.hash_password(body.password)
    db.execute(delete(LoginAttempt).where(LoginAttempt.email == body.email, LoginAttempt.ip == ip))
    close_session(db, response, settings, session)                  # never keep the session the browser came with
    opened = open_session(db, request, response, settings, user)
    db.commit()
    return SessionOut(user=UserOut.model_validate(user), csrf=opened.csrf_token)


@router.post("/logout", status_code=204)
def logout(response: Response, db: Db, settings: Config, session: MaybeSession) -> None:
    close_session(db, response, settings, session)
    db.commit()


@router.get("/me", response_model=SessionOut)
def me(session: CurrentSession) -> SessionOut:
    return SessionOut(user=UserOut.model_validate(session.user), csrf=session.csrf_token)
