"""Asymille (curve fitting, analysis, figures for publication) plugged into this server.

    /asymille/             its page (asymille/index.html, wrapped as the workshops are)
    /api/asymille/…        its API: the projects of whoever is signed in, fits, operations, figures

Asymille is developed in its own repository; ``backend/asymille/`` and the page
are copies, unchanged (``update_from_asymille.sh``). It knows nothing of this
server: it asks for a ``Host``, which is what this module is. Through it,
Asymille gets the accounts, the sessions and the database of the application:

* who is signed in is ``deps.current_user``, so an address of Asymille answers
  401 to nobody and passes ``csrf_guard`` like every address of the API;
* its one table (``asymille_projects``) is defined on ``models.Base``, carries
  ``owner_id`` with ``ondelete="CASCADE"`` to ``users.id``, and is created by
  the migrations of this directory. Asymille looks a project up with its owner
  in the query itself: somebody else's answers 404;
* its refusals are raised as ``AppError``, so they leave in the one error shape.

An administrator sees accounts, not the content of a project: nothing here
adds a route for them.
"""
from __future__ import annotations

from typing import Any

from asymille.web import Host, Limits, build
from asymille.web.tables import define

from .config import get_settings
from .db import get_db
from .deps import CurrentUser
from .errors import AppError
from .models import Base, UTCDateTime


def _owner(user: CurrentUser) -> int:
    return user.id


def _refused(status: int, code: str, message: str) -> AppError:
    return AppError(status, code, message)


def _largest() -> int:
    """What this server reads of one request: a project is saved whole, so that is how large one can be. The page warns before it is reached."""
    return get_settings().max_body_bytes


host: Any = Host(base=Base, users="users.id", moment=UTCDateTime, db=get_db, user_id=_owner, error=_refused, limits=Limits(), document_bytes=_largest)
Project: Any = define(host)             # the table, on the application's own base: migrations/env.py imports this module for it
router: Any = build(host)
