"""An administrator, a demonstration account and its studies: what a new database starts with.

    uv run python -m app.seed

Run it after the migrations. It can be run again: an account that exists is left
as it is (its password too), a demonstration study already there is not added twice.

The accounts come from the settings (backend/.env):

    ONDELETTE_ADMIN_EMAIL, ONDELETTE_ADMIN_PASSWORD, ONDELETTE_ADMIN_NAME
    ONDELETTE_DEMO_EMAIL,  ONDELETTE_DEMO_PASSWORD        (an empty ONDELETTE_DEMO_EMAIL: no demonstration account)

A password left empty is generated and printed once, here: it is kept nowhere
else. The demonstration studies are `seed_data/studies.json`, written by the
model of the page (`node tools/build_seed.js`): the example of the workshop,
computed on the recorded BigDFT runs, and an atomisation energy to compute.
"""
from __future__ import annotations

import json
import secrets
import sys
from pathlib import Path

from sqlalchemy import select
from sqlalchemy.orm import Session

from . import security
from .config import get_settings
from .db import get_sessionmaker
from .main import check_schema
from .models import Role, Study, User
from .routers.studies import columns
from .schemas import RegisterIn, StudyDocument

DATA = Path(__file__).resolve().parent / "seed_data" / "studies.json"


def account(db: Session, email: str, name: str, password: str, role: Role) -> tuple[User, str | None]:
    """The account of that e-mail, created if it is not there. The second value is its password when it was just made."""
    email = email.strip().lower()
    user = db.scalar(select(User).where(User.email == email))
    if user is not None:
        return user, None
    password = password or secrets.token_urlsafe(12)
    RegisterIn(email=email, name=name, password=password)                 # the same rules as for anyone signing up
    user = User(email=email, name=name, password_hash=security.hash_password(password), role=role)
    db.add(user)
    db.flush()
    return user, password


def studies(db: Session, owner: User) -> int:
    held = set(db.scalars(select(Study.name).where(Study.owner_id == owner.id)))
    added = 0
    for raw in json.loads(DATA.read_text()):
        document = StudyDocument.model_validate(raw)                      # what the page wrote must be what the server accepts
        if document.name not in held:
            db.add(Study(owner_id=owner.id, **columns(document)))
            added += 1
    return added


def main() -> int:
    settings = get_settings()
    try:
        check_schema(settings)
    except Exception as exc:
        print(exc, file=sys.stderr)
        return 2
    with get_sessionmaker()() as db:
        admin, admin_password = account(db, settings.admin_email, settings.admin_name, settings.admin_password, Role.ADMIN)
        print(f"administrator   {admin.email}   " + (f"password: {admin_password}" if admin_password else "already there, left as it is"))
        if admin.role is not Role.ADMIN:
            print("                (this account exists and is not an administrator: change its role from another administrator's page)")
        if settings.demo_email.strip():
            demo, demo_password = account(db, settings.demo_email, "Demonstration", settings.demo_password, Role.USER)
            added = studies(db, demo)
            print(f"demonstration   {demo.email}   " + (f"password: {demo_password}" if demo_password else "already there, left as it is")
                  + f"   {added} stud{'y' if added == 1 else 'ies'} added")
        db.commit()
    if admin_password or (settings.demo_email.strip() and demo_password):
        print("\nThe passwords above are shown this once. Change them from the account settings of the page.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
