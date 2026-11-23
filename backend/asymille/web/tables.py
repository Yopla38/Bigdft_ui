"""What Asymille keeps: the projects of each user, and the formats they gave their figures.

    users ─┬─ asymille_projects      a project: its sheets, its graphs, its fits, as the page writes them
           └─ asymille_formats       a format of a figure a person kept under a name: its size, its type, its lines, its ticks

The table is defined on the declarative base of the host, so that it lives in
the same database, with a true foreign key to the owner, and is created by the
host's migrations.
"""
from __future__ import annotations

from datetime import UTC, datetime
from typing import Any

from sqlalchemy import JSON, ForeignKey, Index, Integer, String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from .host import Host

_DEFINED: dict[int, Any] = {}
_FORMATS: dict[int, Any] = {}


def now() -> datetime:
    return datetime.now(UTC)


def define(host: Host) -> Any:
    """The class of a project on the host's base. Defined once per base."""
    key = id(host.base.metadata)
    if key in _DEFINED:
        return _DEFINED[key]

    class Project(host.base):  # type: ignore[misc, name-defined]
        """A project of Asymille, as the page writes it. Everything in it belongs to `owner_id` and leaves with them."""

        __tablename__ = "asymille_projects"

        id: Mapped[int] = mapped_column(Integer, primary_key=True)
        owner_id: Mapped[int] = mapped_column(ForeignKey(host.users, ondelete="CASCADE"), index=True)
        name: Mapped[str] = mapped_column(String(80))
        sheet_count: Mapped[int] = mapped_column(Integer, default=0)             # what the list shows of the document
        graph_count: Mapped[int] = mapped_column(Integer, default=0)
        fit_count: Mapped[int] = mapped_column(Integer, default=0)
        document: Mapped[dict[str, Any]] = mapped_column(JSON)
        revision: Mapped[int] = mapped_column(Integer, default=1)                # one more at each save: two tabs do not overwrite each other
        created_at: Mapped[datetime] = mapped_column(host.moment, default=now)
        updated_at: Mapped[datetime] = mapped_column(host.moment, default=now)

        __table_args__ = (Index("ix_asymille_projects_owner_updated", "owner_id", "updated_at"),)

    _DEFINED[key] = Project
    return Project


def formats(host: Host) -> Any:
    """The class of a format on the host's base. Defined once per base."""
    key = id(host.base.metadata)
    if key in _FORMATS:
        return _FORMATS[key]

    class Format(host.base):  # type: ignore[misc, name-defined]
        """How a person wants their figures to look, kept under a name of theirs. It belongs to `owner_id` and leaves with them."""

        __tablename__ = "asymille_formats"

        id: Mapped[int] = mapped_column(Integer, primary_key=True)
        owner_id: Mapped[int] = mapped_column(ForeignKey(host.users, ondelete="CASCADE"), index=True)
        name: Mapped[str] = mapped_column(String(60))
        format: Mapped[dict[str, Any]] = mapped_column(JSON)                     # what the page takes from a figure and gives to another: page/js/inspect.js
        updated_at: Mapped[datetime] = mapped_column(host.moment, default=now)

        __table_args__ = (UniqueConstraint("owner_id", "name", name="uq_asymille_formats_owner_name"),)

    _FORMATS[key] = Format
    return Format
