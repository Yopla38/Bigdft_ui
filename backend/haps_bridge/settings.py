"""The bridge's settings: ../haps.toml, overridden by HAPS_* variables.

The USER side of the HAPS only: where the services are, the account that
submits, which published applications to use, and the agent's working
directory. Nothing here publishes or runs a job — that is the HAPS's own
settings file, on the machine that serves it.

An environment variable HAPS_<SECTION>_<KEY> overrides one value and keeps its
type (the file says `port = 8790`, the variable says "8791", the code gets
8791). HAPS_CONFIG names another file. The names are the HAPS's own, so one
credentials file (`set -a; source …env; set +a`) serves both.
"""

from __future__ import annotations

import json
import os
import re
import tomllib
from collections.abc import Mapping
from dataclasses import dataclass
from pathlib import Path

PACK_DIR = Path(__file__).resolve().parents[1]
DEFAULT_FILE = PACK_DIR / "haps.toml"
CONFIG_ENV = "HAPS_CONFIG"

#: Values that name a path: resolved against the directory of the settings file.
PATH_KEYS = {("mcp", "workdir")}

#: The two applications the agent uses: the computation, and the dry run.
TARGETS = ("compute", "dryrun")

#: [application] instance: what makes a deployment's mime types its own.
INSTANCE = re.compile(r"[a-z0-9][a-z0-9-]{0,31}")


class SettingsError(RuntimeError):
    pass


@dataclass(frozen=True)
class Application:
    """What identifies a published application on ebservice."""
    name: str
    mime_type: str


def _coerce(raw: str, like: object, name: str) -> object:
    """Give an environment string the type the file declares for that key."""
    try:
        if isinstance(like, bool):
            if raw.lower() in ("1", "true", "yes", "on"):
                return True
            if raw.lower() in ("0", "false", "no", "off"):
                return False
            raise ValueError(raw)
        if isinstance(like, int):
            return int(raw)
        if isinstance(like, float):
            return float(raw)
        if isinstance(like, list):
            value = json.loads(raw) if raw.strip().startswith("[") else \
                [part.strip() for part in raw.split(",") if part.strip()]
            return list(value)
    except ValueError as exc:
        raise SettingsError(f"{name}={raw!r}: expected a {type(like).__name__}") from exc
    return raw


class Settings:
    def __init__(self, data: dict, source: Path) -> None:
        self.data = data
        self.source = source

    def __getitem__(self, section: str) -> dict:
        try:
            return self.data[section]
        except KeyError as exc:
            raise SettingsError(f"no [{section}] section in {self.source}") from exc


def load(path: str | Path | None = None, environ: Mapping[str, str] | None = None) -> Settings:
    env: Mapping[str, str] = os.environ if environ is None else environ
    source = Path(path or env.get(CONFIG_ENV) or DEFAULT_FILE).resolve()
    try:
        data = tomllib.loads(source.read_text(encoding="utf-8"))
    except FileNotFoundError as exc:
        raise SettingsError(f"settings file not found: {source}") from exc

    for section, values in data.items():
        if not isinstance(values, dict):
            continue
        for key, value in values.items():
            name = f"HAPS_{section}_{key}".upper()
            if name in env:
                values[key] = _coerce(env[name], value, name)

    for section, key in PATH_KEYS:
        value = data.get(section, {}).get(key)
        if value:
            data[section][key] = str((source.parent / os.path.expanduser(value)).resolve())
    return Settings(data, source)


def _check(target: str) -> None:
    if target not in TARGETS:
        raise SettingsError(f"unknown target {target!r}: one of {', '.join(TARGETS)}")


def servers(settings: Settings, target: str = "compute") -> dict:
    """The service URLs of *target*: [servers], or [dryrun]'s own when it names them."""
    _check(target)
    base = dict(settings["servers"])
    if target == "dryrun":
        own = settings["dryrun"]
        for key in ("ebservice_url", "ebuffer_url"):
            if own.get(key):
                base[key] = own[key]
    return base


def user(settings: Settings, target: str = "compute") -> dict:
    """The account that submits to *target*: [user], or [dryrun]'s user_* when set."""
    _check(target)
    base = dict(settings["user"])
    if target == "dryrun":
        own = settings["dryrun"]
        for key in ("username", "password"):
            if own.get(f"user_{key}"):
                base[key] = own[f"user_{key}"]
    return base


def client_kwargs(settings: Settings, target: str = "compute") -> dict:
    """The keyword arguments of a haps_client HapsClient for *target*."""
    where, acct = servers(settings, target), user(settings, target)
    return {
        "ebservice_url": where["ebservice_url"],
        "ebuffer_url": where["ebuffer_url"],
        "username": acct["username"],
        "password": acct["password"],
        "insecure_skip_tls_verify": bool(where.get("insecure_skip_tls_verify", False)),
    }


def application(settings: Settings, target: str = "compute") -> Application:
    """The application *target* names, with the publisher's instance.

    ebservice binds a mime type to ONE runtime for the whole server: on a
    shared server the publisher sets an instance, and its mime types become
    `<mime_type>-<instance>`. The HAPS's runtime derives them the same way
    from its XGTD files; the name and base mime type here must be those files'.
    """
    _check(target)
    section = settings["application"]
    name, mime_type = section.get(f"{target}_name"), section.get(f"{target}_mime_type")
    if not name or not mime_type:
        raise SettingsError(f"[application] {target}_name and {target}_mime_type are needed "
                            f"in {settings.source}")
    instance = section.get("instance") or ""
    if not instance:
        return Application(name, mime_type)
    if not INSTANCE.fullmatch(instance):
        raise SettingsError(f"[application] instance={instance!r}: lower-case letters, digits "
                            "and '-', 1-32 characters, starting with a letter or a digit")
    return Application(name, f"{mime_type}-{instance}")


def owner(settings: Settings, target: str = "compute") -> str | None:
    """Whose applications to use: the publisher's email, or None (anyone's).

    Searches on ebservice return every user's objects; the bridge submits only
    to an application this maintainer published.
    """
    _check(target)
    if target == "dryrun" and settings["dryrun"].get("maintainer_email"):
        return settings["dryrun"]["maintainer_email"]
    return settings["maintainer"].get("email") or None
