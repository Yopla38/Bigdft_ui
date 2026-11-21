"""What changes in production: the settings that are required, and how the session cookie travels."""
from __future__ import annotations

from typing import Any

import pytest
from fastapi.testclient import TestClient
from pydantic import ValidationError

PUBLIC = "https://ondelette.example.org"


def test_production_refuses_to_start_half_configured(monkeypatch: pytest.MonkeyPatch) -> None:
    from app.config import Settings

    monkeypatch.setitem(Settings.model_config, "env_file", None)
    with pytest.raises(ValidationError, match="ONDELETTE_PUBLIC_URL"):
        Settings(env="production")
    with pytest.raises(ValidationError, match="COOKIE_SECURE"):
        Settings(env="production", public_url=PUBLIC, cookie_secure=False)
    with pytest.raises(ValidationError, match="SAMESITE"):
        Settings(env="development", cookie_samesite="none")
    settings = Settings(env="production", public_url=PUBLIC + "/", cors_origins="https://app.example.org, https://other.example.org")  # type: ignore[arg-type]
    assert settings.secure and settings.session_cookie == "__Host-ond_session" and settings.public_url == PUBLIC
    assert settings.allowed_origins == {PUBLIC, "https://app.example.org", "https://other.example.org"} and settings.allowed_hosts == ["ondelette.example.org"]


@pytest.mark.parametrize("server", [{"ENV": "production", "PUBLIC_URL": PUBLIC}], indirect=True)
def test_in_production_the_cookie_is_for_https_and_this_host_only(server: Any) -> None:
    http = TestClient(server, base_url=PUBLIC)
    token = http.get("/api/auth/csrf")
    assert token.headers["strict-transport-security"].startswith("max-age=")
    body = {"email": "prod@example.org", "name": "Prod", "password": "a long enough password"}
    made = http.post("/api/auth/register", json=body, headers={"Origin": PUBLIC, "X-CSRF-Token": token.json()["csrf"]})
    assert made.status_code == 201
    cookies = [c.lower() for c in made.headers.get_list("set-cookie")]
    session = next(c for c in cookies if c.startswith("__host-ond_session="))
    assert "secure" in session and "httponly" in session and "samesite=lax" in session and "path=/" in session and "domain" not in session
    assert http.get("/api/auth/me").json()["user"]["email"] == "prod@example.org"
    # the development origin is not this server's any more, and the API is not described to the world
    local = http.post("/api/auth/logout", headers={"Origin": "http://localhost:8766", "X-CSRF-Token": made.json()["csrf"]})
    assert local.status_code == 403 and local.json()["error"]["code"] == "bad_origin"
    assert http.get("/api/docs").status_code == 404 and http.get("/api/openapi.json").status_code == 404
    assert http.get("/", headers={"Host": "localhost"}).status_code == 400
    assert http.get("/").headers["cache-control"] == "no-cache"


@pytest.mark.parametrize("server", [{"CORS_ORIGINS": "https://app.example.org"}], indirect=True)
def test_another_origin_calls_the_api_only_when_named(server: Any) -> None:
    http = TestClient(server, base_url="http://testserver")
    named = http.options("/api/studies", headers={"Origin": "https://app.example.org", "Access-Control-Request-Method": "POST",
                                                  "Access-Control-Request-Headers": "content-type,x-csrf-token"})
    assert named.headers["access-control-allow-origin"] == "https://app.example.org" and named.headers["access-control-allow-credentials"] == "true"
    other = http.options("/api/studies", headers={"Origin": "https://evil.example", "Access-Control-Request-Method": "POST"})
    assert "access-control-allow-origin" not in other.headers
    assert "access-control-allow-origin" not in http.get("/api/health", headers={"Origin": "https://evil.example"}).headers
