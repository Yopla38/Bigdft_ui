"""Alembic's environment: the database of the application's settings, the tables of app/models.py."""
from __future__ import annotations

from logging.config import fileConfig

from alembic import context

from app.config import get_settings
from app.db import make_engine
from app.models import Base, UTCDateTime

config = context.config
if config.config_file_name is not None and config.attributes.get("configure_logging", True):
    fileConfig(config.config_file_name, disable_existing_loggers=False)

target_metadata = Base.metadata


def render_item(kind: str, item: object, autogen_context: object) -> str | bool:
    """A migration names SQLAlchemy's own types, never a class of the application: it must run as written, for ever."""
    if kind == "type" and isinstance(item, UTCDateTime):
        return "sa.DateTime(timezone=True)"
    return False

URL = config.attributes.get("url") or get_settings().database_url


def run_migrations_offline() -> None:
    """Write the SQL instead of running it: `alembic upgrade head --sql`."""
    context.configure(url=URL, target_metadata=target_metadata, literal_binds=True, render_as_batch=URL.startswith("sqlite"),
                      dialect_opts={"paramstyle": "named"}, render_item=render_item)
    with context.begin_transaction():
        context.run_migrations()


def run_migrations_online() -> None:
    engine = make_engine(URL)
    with engine.connect() as connection:
        # SQLite cannot alter a table in place: a change is written as "make another, copy, rename" (batch)
        context.configure(connection=connection, target_metadata=target_metadata, render_as_batch=URL.startswith("sqlite"),
                          compare_type=True, render_item=render_item)
        with context.begin_transaction():
            context.run_migrations()
    engine.dispose()


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
