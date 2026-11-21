"""Asymille behind an API, for a server that brings the accounts.

Asymille keeps projects (sheets of data, graphs, fits) for whoever is signed
in, and computes for them. Who is signed in, how, and where the database is
are the host's business. The host says so with a ``Host``:

    from asymille.web import Host, build
    router = build(Host(base=Base, users="users.id", moment=UTCDateTime, db=get_db, user_id=..., error=...))
    api.include_router(router)          # under the host's /api, behind its own guards

``build`` defines one table on the host's own declarative base
(``asymille_projects``, each row tied to its owner and leaving with them): the
host's migrations create it. ``asymille.web.standalone`` is the smallest host:
one person on their own machine, without accounts.
"""
from .api import build
from .host import Host, Limits

__all__ = ["Host", "Limits", "build"]
