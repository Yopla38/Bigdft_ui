"""What the application keeps. Everything a user creates is tied to that user and leaves with them.

    users ─┬─ sessions          where they are signed in
           ├─ studies ─┬─ run_results     what BigDFT gave for a calculation of that study
           │           └─ jobs            the waves sent to the HAPS for it
           └─ guides            guided paths an administrator published (read by every member)

    login_attempts              failed sign-ins, to slow down guessing

The schema is created and changed by the migrations (``backend/migrations``), never by this module.
"""
from __future__ import annotations

import enum
from datetime import UTC, datetime
from typing import Any

from sqlalchemy import JSON, Boolean, DateTime, Enum, ForeignKey, Index, Integer, MetaData, String, Text, UniqueConstraint
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, relationship
from sqlalchemy.types import TypeDecorator


def now() -> datetime:
    return datetime.now(UTC)


class UTCDateTime(TypeDecorator[datetime]):
    """A moment, always aware and in UTC: SQLite hands back naive datetimes otherwise."""

    impl = DateTime(timezone=True)
    cache_ok = True

    def process_bind_param(self, value: datetime | None, dialect: Any) -> datetime | None:
        if value is not None and value.tzinfo is None:
            raise ValueError("a naive datetime: give its time zone")
        return value.astimezone(UTC) if value is not None else None

    def process_result_value(self, value: datetime | None, dialect: Any) -> datetime | None:
        return value.replace(tzinfo=UTC) if value is not None and value.tzinfo is None else value


class Base(DeclarativeBase):
    # names for every constraint, so that a migration can drop or change them on any database
    metadata = MetaData(naming_convention={
        "ix": "ix_%(column_0_label)s",
        "uq": "uq_%(table_name)s_%(column_0_name)s",
        "ck": "ck_%(table_name)s_%(constraint_name)s",
        "fk": "fk_%(table_name)s_%(column_0_name)s_%(referred_table_name)s",
        "pk": "pk_%(table_name)s",
    })


class Role(enum.StrEnum):
    USER = "USER"
    ADMIN = "ADMIN"


class User(Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    email: Mapped[str] = mapped_column(String(254), unique=True)              # stored lower-case
    name: Mapped[str] = mapped_column(String(80))
    password_hash: Mapped[str] = mapped_column(String(255))
    role: Mapped[Role] = mapped_column(Enum(Role, name="role", native_enum=False, length=8), default=Role.USER)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(UTCDateTime, default=now)
    updated_at: Mapped[datetime] = mapped_column(UTCDateTime, default=now, onupdate=now)
    last_login_at: Mapped[datetime | None] = mapped_column(UTCDateTime, nullable=True)

    sessions: Mapped[list[AuthSession]] = relationship(back_populates="user", cascade="all, delete-orphan", passive_deletes=True)
    studies: Mapped[list[Study]] = relationship(back_populates="owner", cascade="all, delete-orphan", passive_deletes=True)


class AuthSession(Base):
    """A browser signed in. The cookie holds a random token; only its digest is kept here."""

    __tablename__ = "sessions"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    token_hash: Mapped[str] = mapped_column(String(64), unique=True)
    csrf_token: Mapped[str] = mapped_column(String(64))
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    created_at: Mapped[datetime] = mapped_column(UTCDateTime, default=now)
    last_seen_at: Mapped[datetime] = mapped_column(UTCDateTime, default=now)
    expires_at: Mapped[datetime] = mapped_column(UTCDateTime, index=True)
    user_agent: Mapped[str] = mapped_column(String(200), default="")
    ip: Mapped[str] = mapped_column(String(45), default="")

    user: Mapped[User] = relationship(back_populates="sessions")


class Study(Base):
    """A study of workshop 2, as the page writes it: its steps, its structure, what was decided."""

    __tablename__ = "studies"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    owner_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    name: Mapped[str] = mapped_column(String(60))
    system: Mapped[str] = mapped_column(String(40), default="")               # the identity of its structure, for the list
    step_count: Mapped[int] = mapped_column(Integer, default=0)
    document: Mapped[dict[str, Any]] = mapped_column(JSON)
    revision: Mapped[int] = mapped_column(Integer, default=1)                 # one more at each save: two tabs do not overwrite each other
    created_at: Mapped[datetime] = mapped_column(UTCDateTime, default=now)
    updated_at: Mapped[datetime] = mapped_column(UTCDateTime, default=now)

    owner: Mapped[User] = relationship(back_populates="studies")
    results: Mapped[list[RunResult]] = relationship(back_populates="study", cascade="all, delete-orphan", passive_deletes=True)
    jobs: Mapped[list[Job]] = relationship(back_populates="study", cascade="all, delete-orphan", passive_deletes=True)

    __table_args__ = (Index("ix_studies_owner_updated", "owner_id", "updated_at"),)


class RunResult(Base):
    """What BigDFT gave for one calculation of a study, under the identity the page gives that calculation."""

    __tablename__ = "run_results"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    study_id: Mapped[int] = mapped_column(ForeignKey("studies.id", ondelete="CASCADE"), index=True)
    owner_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    key_hash: Mapped[str] = mapped_column(String(64))                         # sha256 of `key`, which is too long to index
    key: Mapped[str] = mapped_column(Text)
    name: Mapped[str] = mapped_column(String(30))                             # the run, as BigDFT was given it
    result: Mapped[dict[str, Any]] = mapped_column(JSON)
    created_at: Mapped[datetime] = mapped_column(UTCDateTime, default=now)

    study: Mapped[Study] = relationship(back_populates="results")

    __table_args__ = (UniqueConstraint("study_id", "key_hash"),)


class Job(Base):
    """One wave of a study on its way to the HAPS, or back from it."""

    __tablename__ = "jobs"

    id: Mapped[str] = mapped_column(String(16), primary_key=True)
    owner_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    study_id: Mapped[int] = mapped_column(ForeignKey("studies.id", ondelete="CASCADE"), index=True)
    state: Mapped[str] = mapped_column(String(12), default="running", index=True)    # running | done | error | stopped
    runs: Mapped[dict[str, Any]] = mapped_column(JSON)                        # the name of each run asked for → the identity of its calculation
    pid: Mapped[int | None] = mapped_column(Integer, nullable=True)
    message: Mapped[str] = mapped_column(Text, default="")
    created_at: Mapped[datetime] = mapped_column(UTCDateTime, default=now)
    finished_at: Mapped[datetime | None] = mapped_column(UTCDateTime, nullable=True)

    study: Mapped[Study] = relationship(back_populates="jobs")
    owner: Mapped[User] = relationship()


class Guide(Base):
    """A guided path published by an administrator: a Jupyter notebook, its outputs removed."""

    __tablename__ = "guides"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    owner_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    title: Mapped[str] = mapped_column(String(120))
    level: Mapped[str] = mapped_column(String(20))
    minutes: Mapped[int] = mapped_column(Integer)
    summary: Mapped[str] = mapped_column(String(600), default="")
    origin: Mapped[str] = mapped_column(String(120), default="")
    notebook: Mapped[dict[str, Any]] = mapped_column(JSON)
    created_at: Mapped[datetime] = mapped_column(UTCDateTime, default=now)

    owner: Mapped[User] = relationship()


class LoginAttempt(Base):
    """A sign-in that failed. Counted per address and e-mail; forgotten after the window."""

    __tablename__ = "login_attempts"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    email: Mapped[str] = mapped_column(String(254))
    ip: Mapped[str] = mapped_column(String(45))
    at: Mapped[datetime] = mapped_column(UTCDateTime, default=now, index=True)

    __table_args__ = (Index("ix_login_attempts_email_ip", "email", "ip"),)
