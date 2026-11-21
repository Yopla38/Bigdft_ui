"""A server on a database of its own, made by the migrations, with a stand-in for the runner and for the bridge."""
from __future__ import annotations

import json
import sys
import time
from collections.abc import Iterator
from pathlib import Path
from typing import Any

import pytest
from fastapi.testclient import TestClient

BACKEND = Path(__file__).resolve().parent.parent
sys.path[:0] = [str(BACKEND)]

ORIGIN = "http://testserver"
PASSWORD = "correct horse battery"
SEED = json.loads((BACKEND / "app" / "seed_data" / "studies.json").read_text())


class Browser:
    """What a browser does for the page: keep the cookies, send the Origin, send back the CSRF token."""

    def __init__(self, app: Any) -> None:
        self.http = TestClient(app, base_url=ORIGIN)
        self.csrf = ""
        self.user: dict[str, Any] = {}

    def call(self, method: str, path: str, body: Any = None, **headers: str) -> Any:
        sent = {"Origin": ORIGIN, "X-CSRF-Token": self.csrf, **headers} if method != "GET" else dict(headers)
        return self.http.request(method, "/api" + path, json=body, headers=sent)

    def get(self, path: str) -> Any:
        return self.call("GET", path)

    def post(self, path: str, body: Any = None, **headers: str) -> Any:
        return self.call("POST", path, body, **headers)

    def put(self, path: str, body: Any = None) -> Any:
        return self.call("PUT", path, body)

    def patch(self, path: str, body: Any = None) -> Any:
        return self.call("PATCH", path, body)

    def delete(self, path: str, body: Any = None) -> Any:
        return self.call("DELETE", path, body)

    def token(self) -> str:
        self.csrf = self.get("/auth/csrf").json()["csrf"]
        return self.csrf

    def register(self, email: str, name: str = "Someone", password: str = PASSWORD) -> Any:
        self.token()
        answer = self.post("/auth/register", {"email": email, "name": name, "password": password})
        if answer.status_code == 201:
            self.csrf, self.user = answer.json()["csrf"], answer.json()["user"]
        return answer

    def login(self, email: str, password: str = PASSWORD) -> Any:
        self.token()
        answer = self.post("/auth/login", {"email": email, "password": password})
        if answer.status_code == 200:
            self.csrf, self.user = answer.json()["csrf"], answer.json()["user"]
        return answer

    def wait(self, job: str, seconds: float = 10) -> dict[str, Any]:
        until = time.monotonic() + seconds
        while True:
            status: dict[str, Any] = self.get(f"/jobs/{job}").json()
            if status["state"] != "running" or time.monotonic() > until:
                return status
            time.sleep(0.05)


@pytest.fixture()
def server(tmp_path: Path, monkeypatch: pytest.MonkeyPatch, request: pytest.FixtureRequest) -> Iterator[Any]:
    from alembic import command
    from alembic.config import Config as AlembicConfig

    from app import compute, config, db

    monkeypatch.setitem(config.Settings.model_config, "env_file", None)         # a developer's backend/.env is not the tests' business
    for name in [n for n in __import__("os").environ if n.startswith("ONDELETTE_")]:
        monkeypatch.delenv(name)
    for name, value in {"ENV": "test", "DATABASE_URL": f"sqlite:///{tmp_path / 'test.db'}", "WORKDIR": str(tmp_path / "work"),
                        "RUNNER": str(BACKEND / "tests" / "fake_runner.py"), "LOGIN_MAX_ATTEMPTS": "4", "MAX_JOBS_PER_USER": "2",
                        "ADMIN_EMAIL": "root@example.org", "ADMIN_PASSWORD": "administrator-pw", "DEMO_EMAIL": "demo@example.org",
                        "DEMO_PASSWORD": "demonstration-pw", **getattr(request, "param", {})}.items():       # a test may ask for other settings
        monkeypatch.setenv("ONDELETTE_" + name, value)
    for cached in (config.get_settings, db.get_engine, db.get_sessionmaker):
        cached.cache_clear()

    migrations = AlembicConfig(str(BACKEND / "alembic.ini"))
    migrations.attributes["configure_logging"] = False
    command.upgrade(migrations, "head")                                          # the schema of the tests is the migrations'

    bridge = {"ok": True, "text": "test bridge", "wavefunctions": True, "workdir": None, "targets": {}}

    async def info(url: str) -> dict[str, Any]:
        return dict(bridge)

    monkeypatch.setattr(compute.haps, "info", info)

    from app.main import create_app

    app = create_app()
    app.state.bridge = bridge                                                    # a test changes it to play a HAPS that is down
    with TestClient(app, base_url=ORIGIN):
        yield app
    db.get_engine().dispose()
    for cached in (config.get_settings, db.get_engine, db.get_sessionmaker):
        cached.cache_clear()


@pytest.fixture()
def browser(server: Any) -> Browser:
    return Browser(server)


@pytest.fixture()
def alice(server: Any) -> Browser:
    b = Browser(server)
    assert b.register("alice@example.org", "Alice").status_code == 201
    return b


@pytest.fixture()
def bob(server: Any) -> Browser:
    b = Browser(server)
    assert b.register("bob@example.org", "Bob").status_code == 201
    return b


@pytest.fixture()
def admin(server: Any) -> Browser:
    from app import seed

    assert seed.main() == 0
    b = Browser(server)
    assert b.login("root@example.org", "administrator-pw").status_code == 200
    return b
