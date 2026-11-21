"""Settings: read from the environment (``ONDELETTE_*``) and from ``backend/.env``.

``.env.example`` lists every variable with what it does. Nothing secret has a
default here: the administrator's password is asked for, or generated and shown
once, by ``python -m app.seed``.
"""
from __future__ import annotations

from functools import lru_cache
from pathlib import Path
from typing import Annotated, Any, Literal
from urllib.parse import urlsplit

import yaml
from pydantic import Field, field_validator, model_validator
from pydantic_settings import BaseSettings, NoDecode, SettingsConfigDict

BACKEND = Path(__file__).resolve().parent.parent
ROOT = BACKEND.parent


def haps_target() -> dict[str, Any]:
    """The HAPS the workshop computes on: the default one of config/haps.yaml."""
    config = yaml.safe_load((ROOT / "config" / "haps.yaml").read_text())
    target: dict[str, Any] = config["haps"][config["default"]]
    return target


def origin_of(url: str) -> str:
    """scheme://host[:port] of an address, as a browser writes an Origin."""
    parts = urlsplit(url.strip())
    if parts.scheme not in ("http", "https") or not parts.netloc:
        raise ValueError(f"{url!r} is not an http(s) address")
    return f"{parts.scheme}://{parts.netloc}".lower()


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_prefix="ONDELETTE_", env_file=BACKEND / ".env", extra="ignore")

    env: Literal["development", "production", "test"] = "development"
    host: str = "127.0.0.1"
    port: int = Field(8766, ge=1, le=65535)

    # --- database ------------------------------------------------------------------
    database_url: str = f"sqlite:///{BACKEND / 'data' / 'ondelette.db'}"

    # --- where the application is reached from ---------------------------------------
    public_url: str = ""                                    # https://ondelette.example.org: its own origin, behind a proxy
    cors_origins: Annotated[list[str], NoDecode] = []       # other origins allowed to call the API with the session cookie
    forwarded_allow_ips: str = "127.0.0.1"                  # the proxies whose X-Forwarded-* headers are believed
    extra_hosts: Annotated[list[str], NoDecode] = []        # other Host headers answered (a health check by address)

    # --- sessions and accounts -------------------------------------------------------
    cookie_secure: bool | None = None                       # None: yes in production, no elsewhere
    cookie_samesite: Literal["lax", "strict", "none"] = "lax"
    session_days: int = Field(14, ge=1, le=365)             # a session ends after that long without a request
    registration: Literal["open", "closed"] = "open"        # closed: only an administrator creates accounts
    password_min_length: int = Field(10, ge=8, le=128)
    login_max_attempts: int = Field(8, ge=1)                # failed sign-ins for one address and one e-mail…
    login_window_minutes: int = Field(15, ge=1)             # …in that many minutes, before the next ones are refused

    # --- computing -------------------------------------------------------------------
    bridge: str = ""                                        # the MCP bridge; empty: mcp_url of the default HAPS in config/haps.yaml
    workdir: Path = BACKEND / "work"                        # where the studies are written: the bridge's working directory
    timeout: int = Field(0, ge=0)                           # seconds a run may take on the HAPS; 0: what config/haps.yaml says
    max_jobs_per_user: int = Field(2, ge=1)                 # waves one user may have on their way at the same time
    runner: Path = BACKEND / "runner.py"                    # what computes a wave (the tests put a stand-in here)

    # --- limits ----------------------------------------------------------------------
    max_body_bytes: int = Field(4 * 1024 * 1024, ge=1024)
    max_studies_per_user: int = Field(200, ge=1)

    # --- python -m app.seed ----------------------------------------------------------
    admin_email: str = "admin@example.org"
    admin_password: str = ""                                # empty: one is generated and printed once
    admin_name: str = "Administrator"
    demo_email: str = "demo@example.org"
    demo_password: str = ""                                 # empty: one is generated and printed once

    @field_validator("cors_origins", mode="before")
    @classmethod
    def _split(cls, value: Any) -> Any:
        if isinstance(value, str):
            return [origin_of(v) for v in value.replace(";", ",").split(",") if v.strip()]
        return value

    @field_validator("extra_hosts", mode="before")
    @classmethod
    def _hosts(cls, value: Any) -> Any:
        return [v.strip().lower() for v in value.replace(";", ",").split(",") if v.strip()] if isinstance(value, str) else value

    @field_validator("public_url")
    @classmethod
    def _origin(cls, value: str) -> str:
        return origin_of(value) if value.strip() else ""

    @model_validator(mode="after")
    def _complete(self) -> Settings:
        target = haps_target()
        if not self.bridge:
            self.bridge = str(target["mcp_url"])
        if not self.timeout:
            self.timeout = int(target["limits"]["max_timeout_s"])
        self.workdir = self.workdir.expanduser().resolve()
        if self.cookie_secure is None:
            self.cookie_secure = self.env == "production"
        if self.cookie_samesite == "none" and not self.cookie_secure:
            raise ValueError("ONDELETTE_COOKIE_SAMESITE=none needs ONDELETTE_COOKIE_SECURE=true: a browser refuses the cookie otherwise")
        if self.env == "production":
            if not self.public_url:
                raise ValueError("ONDELETTE_PUBLIC_URL is needed in production: the address the application is reached at")
            if not self.cookie_secure:
                raise ValueError("ONDELETTE_COOKIE_SECURE=false is refused in production: the session cookie would travel in clear")
        return self

    # --- derived -------------------------------------------------------------------------
    @property
    def secure(self) -> bool:
        return bool(self.cookie_secure)

    @property
    def own_origins(self) -> set[str]:
        """The origins the page of this server is opened from."""
        if self.public_url:
            return {self.public_url}
        if self.env == "test":
            return {"http://testserver"}
        return {f"http://localhost:{self.port}", f"http://127.0.0.1:{self.port}"}

    @property
    def allowed_origins(self) -> set[str]:
        """The origins a request that changes something may come from."""
        return self.own_origins | set(self.cors_origins)

    @property
    def allowed_hosts(self) -> list[str]:
        """The Host headers answered: a page of another site that resolves to this server is not one."""
        return sorted({urlsplit(o).hostname or "" for o in self.own_origins} | set(self.extra_hosts))

    @property
    def session_cookie(self) -> str:
        # __Host-: the browser only accepts it over HTTPS, for this host alone, and never from a sub-domain
        return "__Host-ond_session" if self.secure else "ond_session"

    @property
    def csrf_cookie(self) -> str:
        return "__Host-ond_csrf" if self.secure else "ond_csrf"

    @property
    def is_sqlite(self) -> bool:
        return self.database_url.startswith("sqlite")


@lru_cache
def get_settings() -> Settings:
    return Settings()
