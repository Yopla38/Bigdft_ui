"""One shape for every error the API answers, and one place where they are turned into it.

    {"error": {"code": "invalid_credentials", "message": "…", "detail": "…", "fields": {"email": "…"}}}

``code`` is for the page, ``message`` for the person. ``fields`` names the inputs
a validation refused. Nothing of an unexpected exception leaves the server: it
is logged with the id of the request, and that id is what the answer gives.
"""
from __future__ import annotations

import logging
from typing import Any

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from sqlalchemy.exc import OperationalError
from starlette.exceptions import HTTPException as StarletteHTTPException

log = logging.getLogger("ondelette")

CODES = {400: "bad_request", 401: "not_authenticated", 403: "forbidden", 404: "not_found", 405: "method_not_allowed",
         409: "conflict", 413: "too_large", 415: "unsupported_media_type", 422: "validation_error", 429: "too_many_requests",
         503: "unavailable"}


class AppError(Exception):
    """An error the application chose: it knows its status, its code and what to say."""

    def __init__(self, status: int, code: str, message: str, *, detail: str = "", fields: dict[str, str] | None = None,
                 headers: dict[str, str] | None = None, extra: dict[str, Any] | None = None) -> None:
        super().__init__(message)
        self.status, self.code, self.message, self.detail = status, code, message, detail
        self.fields, self.headers, self.extra = fields or {}, headers or {}, extra or {}


def not_found(what: str = "this") -> AppError:
    return AppError(404, "not_found", f"{what} does not exist, or is not yours")


def body(code: str, message: str, *, detail: str = "", fields: dict[str, str] | None = None, **extra: Any) -> dict[str, Any]:
    error: dict[str, Any] = {"code": code, "message": message}
    if detail:
        error["detail"] = detail
    if fields:
        error["fields"] = fields
    error.update(extra)
    return {"error": error}


def said(problem: dict[str, Any]) -> str:
    """What a validation error says, without Pydantic's prefixes."""
    text = str(problem.get("msg", "not valid"))
    for prefix in ("Value error, ", "Assertion failed, "):
        if text.startswith(prefix):
            text = text[len(prefix):]
    return text[:1].lower() + text[1:]


def install(app: FastAPI) -> None:
    @app.exception_handler(AppError)
    async def _app_error(request: Request, exc: AppError) -> JSONResponse:
        return JSONResponse(body(exc.code, exc.message, detail=exc.detail, fields=exc.fields, **exc.extra),
                            status_code=exc.status, headers=exc.headers)

    @app.exception_handler(RequestValidationError)
    async def _validation(request: Request, exc: RequestValidationError) -> JSONResponse:
        fields: dict[str, str] = {}
        for problem in exc.errors():
            where = [str(p) for p in problem.get("loc", ()) if p not in ("body", "query", "path")]
            fields.setdefault(".".join(where) or "body", said(problem))
        first = next(iter(fields.items()), ("body", "not valid"))
        message = "what was sent is not valid" + (f": {first[0]}: {first[1]}" if first[0] != "body" else f": {first[1]}")
        return JSONResponse(body("validation_error", message, fields=fields), status_code=422)

    @app.exception_handler(StarletteHTTPException)
    async def _http(request: Request, exc: StarletteHTTPException) -> JSONResponse:
        if not request.url.path.startswith("/api/") and exc.status_code == 404:
            return JSONResponse(body("not_found", "no such page"), status_code=404)
        message = exc.detail if isinstance(exc.detail, str) else "the request was refused"
        return JSONResponse(body(CODES.get(exc.status_code, "error"), message.lower() if message == "Not Found" else message),
                            status_code=exc.status_code, headers=getattr(exc, "headers", None))

    @app.exception_handler(OperationalError)
    async def _database(request: Request, exc: OperationalError) -> JSONResponse:
        log.error("database error on %s %s [%s]: %s", request.method, request.url.path, request_id(request), exc)
        return JSONResponse(body("unavailable", "the database did not answer: try again in a moment", request=request_id(request)),
                            status_code=503, headers={"Retry-After": "2"})

    @app.exception_handler(Exception)
    async def _unexpected(request: Request, exc: Exception) -> JSONResponse:
        log.exception("unexpected error on %s %s [%s]", request.method, request.url.path, request_id(request))
        return JSONResponse(body("server_error", "the server met an error it did not expect: it was logged",
                                 request=request_id(request)), status_code=500)


def request_id(request: Request) -> str:
    return str(getattr(request.state, "request_id", ""))
