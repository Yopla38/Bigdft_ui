"""What the API accepts and what it answers. Anything not described here is refused (``extra="forbid"``).

The document of a study is the page's own writing of it (``serialize`` in
workshop/js/model.js): the server keeps it for its owner and hands it back. It
checks its shape and its size, not its physics: what is computed is the plan of
a wave, and that is rebuilt by name with the registry of steps (runner.build).
"""
from __future__ import annotations

from datetime import datetime
from typing import Annotated, Any, Literal

from pydantic import BaseModel, ConfigDict, EmailStr, Field, JsonValue, StringConstraints, field_validator

from .config import get_settings
from .models import Role

Slug = Annotated[str, StringConstraints(pattern=r"^[a-z0-9][a-z0-9_]{0,39}$")]
RunName = Annotated[str, StringConstraints(pattern=r"^[A-Za-z0-9][A-Za-z0-9_-]{0,29}$")]
StepId = Annotated[str, StringConstraints(pattern=r"^s[0-9]{1,6}$")]
Word = Annotated[str, StringConstraints(pattern=r"^[A-Za-z_][A-Za-z0-9_]{0,39}$")]
Element = Annotated[str, StringConstraints(pattern=r"^[A-Z][a-z]?$")]
Identity = Annotated[str, StringConstraints(min_length=1, max_length=20000)]
Name = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=80)]
Title = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=60)]


class Strict(BaseModel):
    model_config = ConfigDict(extra="forbid")


class Out(BaseModel):
    model_config = ConfigDict(from_attributes=True)


def checked_password(value: str) -> str:
    minimum = get_settings().password_min_length
    if len(value) < minimum:
        raise ValueError(f"a password has at least {minimum} characters")
    if len(value) > 128:
        raise ValueError("a password has at most 128 characters")
    return value


def lower(value: str) -> str:
    return value.strip().lower()


# ── accounts ─────────────────────────────────────────────────────────────────
class RegisterIn(Strict):
    email: EmailStr
    name: Name
    password: str

    _email = field_validator("email")(lower)
    _password = field_validator("password")(checked_password)


class LoginIn(Strict):
    email: Annotated[str, StringConstraints(strip_whitespace=True, min_length=3, max_length=254)]
    password: Annotated[str, StringConstraints(min_length=1, max_length=128)]

    _email = field_validator("email")(lower)


class ProfileIn(Strict):
    name: Name | None = None
    email: EmailStr | None = None
    current_password: str | None = Field(None, max_length=128)        # asked for when the e-mail changes

    @field_validator("email")
    @classmethod
    def _email(cls, value: str | None) -> str | None:
        return lower(value) if value else value


class PasswordIn(Strict):
    current_password: Annotated[str, StringConstraints(min_length=1, max_length=128)]
    new_password: str

    _password = field_validator("new_password")(checked_password)


class DeleteAccountIn(Strict):
    password: Annotated[str, StringConstraints(min_length=1, max_length=128)]


class UserOut(Out):
    id: int
    email: str
    name: str
    role: Role
    created_at: datetime


class SessionOut(BaseModel):
    """Who is signed in, and the token the page sends back with whatever changes something."""

    user: UserOut
    csrf: str


class CsrfOut(BaseModel):
    csrf: str
    registration: Literal["open", "closed"]


class DeviceOut(Out):
    id: int
    created_at: datetime
    last_seen_at: datetime
    user_agent: str
    ip: str
    current: bool = False


# ── administration ───────────────────────────────────────────────────────────
class AdminUserOut(UserOut):
    is_active: bool
    last_login_at: datetime | None
    study_count: int = 0


class AdminUserCreate(RegisterIn):
    role: Role = Role.USER


class AdminUserUpdate(Strict):
    role: Role | None = None
    is_active: bool | None = None
    name: Name | None = None
    new_password: str | None = None

    @field_validator("new_password")
    @classmethod
    def _password(cls, value: str | None) -> str | None:
        return checked_password(value) if value is not None else value


class AdminJobOut(BaseModel):
    id: str
    state: str
    user: str
    study: int                                                     # its number: what a study is called is its owner's business
    runs: int
    created_at: datetime
    finished_at: datetime | None


# ── a study, as the page writes it ───────────────────────────────────────────
class Atom(Strict):
    el: Element
    p: Annotated[list[float], Field(min_length=3, max_length=3)]
    i: int | None = Field(None, ge=0)
    src: Annotated[str, StringConstraints(max_length=8)] | None = None


class Structure(Strict):
    """A structure that is not one of the built-in systems: an atom, a file, a molecule fetched by its name."""

    id: Annotated[str, StringConstraints(pattern=r"^[A-Za-z0-9][A-Za-z0-9_-]{0,39}$")]
    name: Annotated[str, StringConstraints(max_length=300)]            # a file gives its name to its structure: up to 255 characters
    formula: Annotated[str, StringConstraints(max_length=400)]
    bc: Literal["free", "surface", "periodic"]
    cell: Annotated[list[float | None], Field(min_length=3, max_length=3)] | None = None
    blurb: Annotated[str, StringConstraints(max_length=800)] = ""
    source: Annotated[str, StringConstraints(max_length=600)] = ""
    traits: Annotated[list[Annotated[str, StringConstraints(max_length=40)]], Field(max_length=12)] = []
    atoms: Annotated[list[Atom], Field(min_length=1, max_length=5000)]
    origin: Annotated[list[float], Field(min_length=3, max_length=3)]


class Action(Strict):
    name: Word
    args: dict[str, JsonValue] = {}


class Own(Strict):
    """What a calculation step changes: settings, input keys, input actions."""

    v: dict[Word, JsonValue] = {}
    expert: dict[Annotated[str, StringConstraints(max_length=120)], JsonValue] = {}
    actions: Annotated[list[Action], Field(max_length=80)] = []


class Step(Strict):
    id: StepId
    fn: Word
    kind: Word
    title: Annotated[str, StringConstraints(min_length=1, max_length=300)]         # a structure step is called as its structure is
    links: dict[Word, StepId | None] = {}                       # a role → the step it names (null: none, written as such)
    params: dict[Word, JsonValue] = {}
    own: Own = Own()
    filled: Annotated[str, StringConstraints(max_length=20000)] | None = None
    sys: Structure | None = None


class Position(Strict):
    dx: float
    dy: float


class StudyDocument(Strict):
    version: Literal[1]
    name: Title
    system: Annotated[str, StringConstraints(pattern=r"^[A-Za-z0-9][A-Za-z0-9_-]{0,39}$")]
    sys: Structure | None = None                                   # null: a built-in system, rebuilt by the page from `system`
    steps: Annotated[list[Step], Field(max_length=400)] = []
    seq: int = Field(0, ge=0, le=999999)
    computed: Annotated[list[Identity], Field(max_length=4000)] = []       # on recorded results: what was asked to be computed
    log: Annotated[list[dict[str, JsonValue]], Field(max_length=40)] = []
    layout: dict[Annotated[str, StringConstraints(pattern=r"^(system|s[0-9]{1,6})$")], Position] = {}

    @field_validator("steps")
    @classmethod
    def _unique(cls, steps: list[Step]) -> list[Step]:
        ids = [s.id for s in steps]
        if len(set(ids)) != len(ids):
            raise ValueError("two steps have the same id")
        known = set(ids)
        for step in steps:
            for role, target in step.links.items():
                if target is not None and (target not in known or target == step.id):
                    raise ValueError(f"step {step.id}: its link “{role}” names no other step of the study")
        return steps


class StudyCreate(Strict):
    document: StudyDocument


class StudyUpdate(Strict):
    document: StudyDocument
    revision: int = Field(ge=1)                                    # the revision this change was made from


class StudySummary(Out):
    id: int
    name: str
    system: str
    step_count: int
    revision: int
    created_at: datetime
    updated_at: datetime


class StudyOut(StudySummary):
    document: dict[str, Any]
    results: dict[str, Any] = {}                                   # what BigDFT gave, by the identity of each calculation
    job: str | None = None                                         # a wave of this study still on its way


# ── computing ────────────────────────────────────────────────────────────────
class Call(Strict):
    """One step of the study as a call of the registry: its name and its arguments, as data."""

    fn: Word
    name: RunName
    args: Annotated[list[JsonValue], Field(max_length=40)] = []
    kwargs: dict[Word, JsonValue] = {}


class Plan(Strict):
    name: Slug
    system: Annotated[str, StringConstraints(max_length=40)] = ""
    structure: dict[str, JsonValue]
    steps: Annotated[list[Call], Field(min_length=1, max_length=400)]


class ComputeIn(Strict):
    plan: Plan
    names: Annotated[list[RunName], Field(min_length=1, max_length=200)]
    keys: dict[RunName, Identity] = {}                             # the identity of the calculation behind each name
    script: Annotated[str, StringConstraints(max_length=400000)] | None = None

    @field_validator("names")
    @classmethod
    def _distinct(cls, names: list[str]) -> list[str]:
        if len(set(names)) != len(names):
            raise ValueError("the same run is asked for twice")
        return names


class ComputeOut(BaseModel):
    job: str
    directory: str


class MoleculeIn(Strict):
    # a name or a CID: nothing that changes the address asked
    name: Annotated[str, StringConstraints(strip_whitespace=True, pattern=r"^[A-Za-z0-9][A-Za-z0-9 ,.()'+\[\]-]{0,79}$")]


# ── guided paths ─────────────────────────────────────────────────────────────
class GuideIn(Strict):
    title: Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=120)]
    level: Literal["Discovery", "Intermediate", "Advanced"]
    minutes: int = Field(ge=1, le=600)
    summary: Annotated[str, StringConstraints(strip_whitespace=True, max_length=600)] = ""
    origin: Annotated[str, StringConstraints(strip_whitespace=True, max_length=120)] = ""
    notebook: dict[str, JsonValue]

    @field_validator("notebook")
    @classmethod
    def _notebook(cls, value: dict[str, JsonValue]) -> dict[str, JsonValue]:
        cells = value.get("cells")
        if not isinstance(cells, list) or not cells:
            raise ValueError("not a Jupyter notebook: it has no cells")
        for cell in cells:
            if not isinstance(cell, dict) or cell.get("cell_type") not in ("markdown", "code", "raw"):
                raise ValueError("not a Jupyter notebook: a cell has no known type")
            if cell.get("outputs"):
                raise ValueError("clear the outputs of the notebook first: only its text and its code are kept")
        return value


class GuideOut(Out):
    id: int
    title: str
    level: str
    minutes: int
    summary: str
    origin: str
    notebook: dict[str, Any]
    created_at: datetime
