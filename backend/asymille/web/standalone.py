"""The smallest host: Asymille for one person on their own machine, without accounts.

    uv run python serve.py                 # http://localhost:8780

Everything is kept under one local user, in a SQLite file. There is no sign-in:
do not expose this server to a network. To serve several people, plug
``asymille.web`` into a server that has accounts (Ondelette's ``backend/``:
see "Plugged into Ondelette" in the README).

It speaks to the page as that server does: the same error shape, the same two
addresses the page asks at start (``auth/me``, ``auth/csrf``), and the same rule
for a request that changes something: it must come from this server's own page
(its ``Origin``), be JSON, and carry the token the page was given. A page of
another site open in the same browser can do none of the three.
"""
from __future__ import annotations

import hmac
import secrets
from collections.abc import Iterator
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

from fastapi import APIRouter, Depends, FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import HTMLResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from sqlalchemy import DateTime, Integer, String, create_engine, event
from sqlalchemy.orm import DeclarativeBase, Mapped, Session, mapped_column, sessionmaker
from sqlalchemy.pool import StaticPool
from sqlalchemy.types import TypeDecorator
from starlette.exceptions import HTTPException as StarletteHTTPException

from . import Host, Limits, build

ROOT = Path(__file__).resolve().parent.parent.parent
PAGE = ROOT / "page"
HEAD = ('<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">'
        "<style>body{margin:0;font:14px system-ui}img{max-width:100%}[hidden]{display:none!important}</style></head><body>")
POLICY = ("default-src 'self'; script-src 'self' 'nonce-{nonce}' https://cdn.jsdelivr.net; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; "
          "font-src 'self' https://fonts.gstatic.com data:; img-src 'self' data: blob:; connect-src 'self'; object-src 'none'; base-uri 'self'; frame-ancestors 'none'")


class Refused(Exception):
    def __init__(self, status: int, code: str, message: str) -> None:
        super().__init__(message)
        self.status, self.code, self.message = status, code, message


class UTCDateTime(TypeDecorator[datetime]):
    """A moment, always aware and in UTC: SQLite hands back naive datetimes otherwise."""

    impl = DateTime(timezone=True)
    cache_ok = True

    def process_bind_param(self, value: datetime | None, dialect: Any) -> datetime | None:
        return value.astimezone(UTC) if value is not None else None

    def process_result_value(self, value: datetime | None, dialect: Any) -> datetime | None:
        return value.replace(tzinfo=UTC) if value is not None and value.tzinfo is None else value


def page_html(directory: Path, nonce: str) -> str:
    """index.html is written as page content, without doctype or <html>: wrapped here, its inline scripts given the nonce of the policy."""
    return HEAD + (directory / "index.html").read_text().replace("<script>", f'<script nonce="{nonce}">') + "</body></html>"


def create_app(database: str | Path = ROOT / "data" / "asymille.db", port: int = 8780, limits: Limits | None = None) -> FastAPI:
    class Base(DeclarativeBase):
        pass

    class User(Base):
        __tablename__ = "users"
        id: Mapped[int] = mapped_column(Integer, primary_key=True)
        name: Mapped[str] = mapped_column(String(80))

    if str(database) != ":memory:":
        Path(database).parent.mkdir(parents=True, exist_ok=True)
    memory = str(database) == ":memory:"            # a database in memory lives in one connection: every request shares it
    engine = create_engine("sqlite://" if memory else f"sqlite:///{database}", connect_args={"check_same_thread": False}, **({"poolclass": StaticPool} if memory else {}))

    @event.listens_for(engine, "connect")
    def _pragmas(connection: Any, _record: Any) -> None:
        connection.execute("PRAGMA foreign_keys=ON")

    make = sessionmaker(bind=engine, expire_on_commit=False)
    token = secrets.token_urlsafe(32)
    origins = {f"http://localhost:{port}", f"http://127.0.0.1:{port}", "http://testserver"}

    def db() -> Iterator[Session]:
        session = make()
        try:
            yield session
        finally:
            session.close()

    def guard(request: Request) -> None:
        if request.method in ("GET", "HEAD", "OPTIONS"):
            return
        if (request.headers.get("origin") or "").lower() not in origins:
            raise Refused(403, "bad_origin", "this server answers its own page only")
        if int(request.headers.get("content-length") or 0) and not (request.headers.get("content-type") or "").startswith("application/json"):
            raise Refused(415, "unsupported_media_type", "send JSON (Content-Type: application/json)")
        if not hmac.compare_digest(request.headers.get("x-csrf-token", "").encode(), token.encode()):
            raise Refused(403, "bad_csrf", "this request does not carry the token of this server: reload the page")

    host = Host(base=Base, users="users.id", moment=UTCDateTime, db=db, user_id=lambda: 1, error=Refused, limits=limits or Limits())
    router = build(host)
    Base.metadata.create_all(engine)
    with make() as session:
        if session.get(User, 1) is None:
            session.add(User(id=1, name="Local"))
            session.commit()

    app = FastAPI(title="Asymille", docs_url="/api/docs", redoc_url=None, openapi_url="/api/openapi.json")
    api = APIRouter(prefix="/api", dependencies=[Depends(guard)])
    me = {"id": 1, "name": "Local", "email": "", "role": "USER"}

    @api.get("/auth/me")
    def auth_me() -> dict[str, Any]:
        return {"user": me, "csrf": token, "standalone": True}

    @api.get("/auth/csrf")
    def auth_csrf() -> dict[str, Any]:
        return {"csrf": token, "registration": "closed"}

    api.include_router(router)
    app.include_router(api)

    def answer(status: int, code: str, message: str, **more: Any) -> JSONResponse:
        return JSONResponse({"error": {"code": code, "message": message, **more}}, status_code=status)

    @app.exception_handler(Refused)
    async def _refused(request: Request, exc: Refused) -> JSONResponse:
        return answer(exc.status, exc.code, exc.message)

    @app.exception_handler(RequestValidationError)
    async def _validation(request: Request, exc: RequestValidationError) -> JSONResponse:
        fields = {".".join(str(p) for p in e.get("loc", ()) if p != "body") or "body": str(e.get("msg", "not valid")) for e in exc.errors()}
        where, why = next(iter(fields.items()))
        return answer(422, "validation_error", f"what was sent is not valid: {where}: {why}", fields=fields)

    @app.exception_handler(StarletteHTTPException)
    async def _http(request: Request, exc: StarletteHTTPException) -> JSONResponse:
        return answer(exc.status_code, "not_found" if exc.status_code == 404 else "error", str(exc.detail).lower())

    @app.get("/", include_in_schema=False)
    @app.get("/index.html", include_in_schema=False)
    def page() -> HTMLResponse:
        nonce = secrets.token_urlsafe(16)
        return HTMLResponse(page_html(PAGE, nonce), headers={"Content-Security-Policy": POLICY.format(nonce=nonce), "Cache-Control": "no-store",
                                                             "X-Content-Type-Options": "nosniff", "X-Frame-Options": "DENY", "Referrer-Policy": "same-origin"})

    app.mount("/js", StaticFiles(directory=PAGE / "js"), name="scripts")
    app.mount("/shared", StaticFiles(directory=PAGE / "shared"), name="shared")
    app.mount("/examples", StaticFiles(directory=ROOT / "examples"), name="examples")
    return app
