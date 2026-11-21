"""The application: the two pages, their scripts, and the API under /api.

    /                  workshop 2 (workshop/index.html, wrapped as tools/preview.py does)
    /first/            the first workshop (prototype/index.html)
    /asymille/         Asymille: fits, analysis, figures (asymille/index.html, a copy: see app/asymille.py)
    /js, /shared       their scripts
    /api/…             routers/: accounts, studies, computing, guided paths, administration
    /api/health        for whatever watches the service

Every answer carries the headers that keep a page of another site from framing
this one, guessing a type or keeping a referrer; the pages carry a content
security policy that names the three hosts their libraries come from.
"""
from __future__ import annotations

import asyncio
import logging
import re
import secrets
import sys
from collections.abc import AsyncIterator, Awaitable, Callable, MutableMapping
from contextlib import asynccontextmanager, suppress
from typing import Any

from fastapi import APIRouter, Depends, FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import HTMLResponse, JSONResponse, RedirectResponse
from fastapi.staticfiles import StaticFiles
from sqlalchemy import delete, text
from starlette.middleware.trustedhost import TrustedHostMiddleware

from . import asymille, errors
from .compute import Compute
from .config import BACKEND, ROOT, Settings, get_settings
from .db import get_engine, get_sessionmaker
from .deps import csrf_guard
from .models import AuthSession, now
from .routers import account, admin, auth, guides, studies

sys.path[:0] = [p for p in (str(ROOT / "tools"),) if p not in sys.path]

import preview  # noqa: E402  (tools/preview.py: the document a page is wrapped in)

log = logging.getLogger("ondelette")

Scope = MutableMapping[str, Any]
Message = MutableMapping[str, Any]
Receive = Callable[[], Awaitable[Message]]
Send = Callable[[Message], Awaitable[None]]
ASGIApp = Callable[[Scope, Receive, Send], Awaitable[None]]

LIBRARIES = "https://cdnjs.cloudflare.com https://cdn.jsdelivr.net"      # three.js and MathJax, as the pages name them
INLINE_SCRIPT = re.compile(r"<script>")


def page_policy(nonce: str) -> str:
    return "; ".join([
        "default-src 'self'", f"script-src 'self' 'nonce-{nonce}' {LIBRARIES}",
        "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",      # the pages set styles on elements as they draw
        "font-src 'self' https://fonts.gstatic.com data:", "img-src 'self' data: blob:", "connect-src 'self'",
        "object-src 'none'", "base-uri 'self'", "form-action 'self'", "frame-ancestors 'none'"])


class Guard:
    """Around every request: an id for the logs, a limit on what is read, and the headers of every answer."""

    def __init__(self, app: ASGIApp, settings: Settings) -> None:
        self.app, self.settings = app, settings

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return
        settings, path = self.settings, str(scope.get("path", ""))
        request_id = secrets.token_hex(6)
        scope.setdefault("state", {})["request_id"] = request_id
        limit, read = settings.max_body_bytes, 0
        headers = dict(scope.get("headers") or [])

        async def answer(message: Message) -> None:
            if message["type"] == "http.response.start":
                out: list[tuple[bytes, bytes]] = list(message.get("headers") or [])
                given = {k.lower() for k, _ in out}

                def default(name: str, value: str) -> None:
                    if name.encode() not in given:
                        out.append((name.encode(), value.encode()))

                default("x-content-type-options", "nosniff")
                default("x-frame-options", "DENY")
                default("referrer-policy", "same-origin")
                default("cross-origin-opener-policy", "same-origin")
                default("permissions-policy", "camera=(), microphone=(), geolocation=()")
                default("x-request-id", request_id)
                if settings.secure:
                    default("strict-transport-security", "max-age=31536000; includeSubDomains")
                if path.startswith("/api/"):
                    default("cache-control", "no-store")
                    if not path.startswith("/api/docs"):
                        default("content-security-policy", "default-src 'none'; frame-ancestors 'none'")
                else:
                    # the page is its scripts, loaded one by one: a browser that kept some of them would run two versions
                    default("cache-control", "no-cache" if settings.env == "production" else "no-store")
                message["headers"] = out
            await send(message)

        async def refuse() -> None:
            body = JSONResponse(errors.body("too_large", f"what was sent is larger than {limit // 1024} kB"), status_code=413)
            await body(scope, receive, answer)

        if int(headers.get(b"content-length", b"0") or 0) > limit:
            await refuse()
            return

        async def limited() -> Message:
            nonlocal read
            message = await receive()
            if message["type"] == "http.request":
                read += len(message.get("body", b""))
                if read > limit:
                    raise errors.AppError(413, "too_large", f"what was sent is larger than {limit // 1024} kB")
            return message

        await self.app(scope, limited, answer)


def check_schema(settings: Settings) -> None:
    """Refuse to start on a database the migrations have not brought up to date."""
    from alembic.config import Config as AlembicConfig
    from alembic.runtime.migration import MigrationContext
    from alembic.script import ScriptDirectory

    head = ScriptDirectory.from_config(AlembicConfig(str(BACKEND / "alembic.ini"))).get_current_head()
    with get_engine().connect() as connection:
        current = MigrationContext.configure(connection).get_current_revision()
    if current != head:
        raise RuntimeError(f"the database is at revision {current or 'none'}, the application needs {head}: "
                           "run `uv run alembic upgrade head` in backend/")


async def follow(app: FastAPI) -> None:
    """The waves in progress are followed even when no page asks; ended sessions are removed."""
    compute: Compute = app.state.compute
    make = get_sessionmaker()

    def once(clean: bool) -> None:
        with make() as db:
            compute.sweep(db)
            if clean:
                db.execute(delete(AuthSession).where(AuthSession.expires_at <= now()))
                db.commit()

    turn = 0
    while True:
        try:
            await asyncio.to_thread(once, turn % 900 == 0)
        except Exception:
            log.exception("could not follow the waves")
        turn += 1
        await asyncio.sleep(2)


def create_app(settings: Settings | None = None) -> FastAPI:
    settings = settings or get_settings()

    @asynccontextmanager
    async def lifespan(app: FastAPI) -> AsyncIterator[None]:
        check_schema(settings)
        app.state.compute = Compute(settings)
        task = asyncio.create_task(follow(app))
        try:
            yield
        finally:
            task.cancel()
            with suppress(asyncio.CancelledError):
                await task

    docs = settings.env != "production"
    app = FastAPI(title="Ondelette", version="1.0.0", lifespan=lifespan, docs_url="/api/docs" if docs else None, redoc_url=None,
                  openapi_url="/api/openapi.json" if docs else None)
    errors.install(app)

    # ── the API ──────────────────────────────────────────────────────────────
    api = APIRouter(prefix="/api", dependencies=[Depends(csrf_guard)])
    for module in (auth, account, studies, guides, admin, asymille):
        api.include_router(module.router)

    @api.get("/health", tags=["service"])
    def health() -> dict[str, str]:
        with get_engine().connect() as connection:
            connection.execute(text("SELECT 1"))
        return {"status": "ok"}

    app.include_router(api)

    @app.api_route("/api/{rest:path}", methods=["GET", "POST", "PUT", "PATCH", "DELETE"], include_in_schema=False)
    def no_such_address(rest: str) -> None:
        raise errors.AppError(404, "not_found", "no such address")

    # ── the pages ────────────────────────────────────────────────────────────
    def page(directory: str) -> HTMLResponse:
        nonce = secrets.token_urlsafe(16)
        html = INLINE_SCRIPT.sub(f'<script nonce="{nonce}">', preview.page(ROOT / directory).decode())
        return HTMLResponse(html, headers={"Content-Security-Policy": page_policy(nonce)})

    @app.get("/", include_in_schema=False)
    @app.get("/index.html", include_in_schema=False)
    def workshop() -> HTMLResponse:
        return page("workshop")

    @app.get("/first/", include_in_schema=False)
    def first_workshop() -> HTMLResponse:
        return page("prototype")

    @app.get("/first", include_in_schema=False)
    def first_workshop_slash(request: Request) -> RedirectResponse:
        return RedirectResponse("/first/", status_code=308)

    @app.get("/asymille/", include_in_schema=False)
    def asymille_page() -> HTMLResponse:
        return page("asymille")

    @app.get("/asymille", include_in_schema=False)
    def asymille_slash(request: Request) -> RedirectResponse:
        return RedirectResponse("/asymille/", status_code=308)

    app.mount("/asymille/js", StaticFiles(directory=ROOT / "asymille" / "js"), name="asymille-scripts")
    app.mount("/asymille/shared", StaticFiles(directory=ROOT / "prototype" / "js"), name="asymille-shared")      # this server's own api.js and account.js
    app.mount("/asymille/examples", StaticFiles(directory=ROOT / "asymille" / "examples"), name="asymille-examples")
    app.mount("/js", StaticFiles(directory=ROOT / "workshop" / "js"), name="workshop-scripts")
    app.mount("/shared", StaticFiles(directory=ROOT / "prototype" / "js"), name="shared-scripts")
    app.mount("/first/js", StaticFiles(directory=ROOT / "prototype" / "js"), name="first-scripts")

    # ── around every request (the last added is the first met) ───────────────
    if settings.cors_origins:
        app.add_middleware(CORSMiddleware, allow_origins=settings.cors_origins, allow_credentials=True,
                           allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE"], allow_headers=["Content-Type", "X-CSRF-Token"],
                           max_age=600)
    app.add_middleware(Guard, settings=settings)
    app.add_middleware(TrustedHostMiddleware, allowed_hosts=settings.allowed_hosts)
    return app
