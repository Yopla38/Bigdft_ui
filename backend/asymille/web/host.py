"""What Asymille asks of the server it is plugged into."""
from __future__ import annotations

from collections.abc import Callable
from dataclasses import dataclass, field
from typing import Any


@dataclass(frozen=True)
class Limits:
    max_projects: int = 200             # projects one account may hold
    max_formats: int = 60               # formats of a figure one account may keep
    fit_timeout: float = 30.0           # seconds a fit may take before it is stopped
    busy_wait: float = 20.0             # seconds a calculation waits for a free place before the server says it is busy
    workers: int = 4                    # calculations made at the same time, all accounts together


@dataclass(frozen=True)
class Host:
    base: Any                                   # the declarative base of the host: the table of projects joins its metadata, and its migrations
    users: str                                  # the column an owner is: "users.id"
    moment: Any                                 # the column type of the host for a moment in time
    db: Callable[..., Any]                      # a FastAPI dependency: the database session of the request
    user_id: Callable[..., int]                 # a FastAPI dependency: the id of whoever is signed in, or the host's own refusal
    error: Callable[..., Exception]             # error(status, code, message) → what the host raises to answer an error in its own shape
    limits: Limits = field(default_factory=Limits)
    document_bytes: Callable[[], int | None] = lambda: None     # the largest request the host reads, when it has a limit: the page warns before a project reaches it
