"""The addresses of Asymille, under the host's API. A project of someone else does not exist here (404).

    GET    …/asymille/catalogue              the fit functions, the operations, the journals, the methods: what the page draws its lists from
    GET    …/asymille/projects               the projects of whoever is signed in, the most recently changed first
    POST   …/asymille/projects               {document} → a new project
    GET    …/asymille/projects/ID            the project
    PUT    …/asymille/projects/ID            {document, revision}: 409 when it was changed elsewhere since that revision
    DELETE …/asymille/projects/ID
    POST   …/asymille/projects/ID/duplicate  a copy
    POST   …/asymille/model/parse            {text} → a model read from its one-line notation
    POST   …/asymille/model/write            {model} → {text}
    POST   …/asymille/model/guess            {x, y, model, limits} → the model, with starting values read from the data
    POST   …/asymille/model/evaluate         {model, x} → the model and its components at their starting values
    POST   …/asymille/fit                    {x, y, sigma, model, limits, options} → the result of a fit
    POST   …/asymille/fit/global             {datasets, model, shared, limits, options} → several datasets, shared parameters
    POST   …/asymille/analyse                {operation, args, x, y, x2, y2} → new columns, numbers, a sentence
    POST   …/asymille/figure                 {figure, format, dpi} → the figure as a file (PDF, EPS, SVG, PNG, TIFF), in base64

Nothing the page sends is executed: a model is a list of names of the registry
and numbers, an expression is walked by ``asymille.expressions``, an operation
is called by its name. The calculations run in the request, a few at a time.
"""
from __future__ import annotations

import base64
import re
import threading
from collections.abc import Callable
from typing import Any

from fastapi import APIRouter, Depends
from sqlalchemy import func, select, update
from sqlalchemy.orm import Session

from .. import __version__, analysis, figures, fitting, functions, journals, models
from ..expressions import FUNCTIONS
from .host import Host
from .schemas import (
    AnalyseIn,
    EvaluateIn,
    FigureIn,
    FitIn,
    GlobalFitIn,
    GuessIn,
    ModelIn,
    ModelText,
    ProjectCreate,
    ProjectDocument,
    ProjectOut,
    ProjectSummary,
    ProjectUpdate,
)
from .tables import define, now

REFUSALS = (fitting.FitError, models.ModelError, analysis.AnalysisError, figures.FigureError)


def build(host: Host) -> APIRouter:
    """The router of Asymille for this host. Include it in the host's API router, behind its guards."""
    Project = define(host)
    router = APIRouter(prefix="/asymille", tags=["asymille"])
    places = threading.BoundedSemaphore(host.limits.workers)
    Db = Depends(host.db)
    Owner = Depends(host.user_id)

    def computed(work: Callable[[], dict[str, Any]]) -> dict[str, Any]:
        """Run a calculation when a place is free, and turn its refusal into the host's error."""
        if not places.acquire(timeout=host.limits.busy_wait):
            raise host.error(503, "busy", "the server is computing for others: try again in a moment")
        try:
            return work()
        except REFUSALS as exc:
            raise host.error(422, "refused", str(exc)) from None
        finally:
            places.release()

    # ── what the page draws its lists from ───────────────────────────────────
    @router.get("/catalogue")
    def catalogue(owner: int = Owner) -> dict[str, Any]:
        return {"version": __version__, "functions": functions.described(), "families": functions.FAMILIES,
                "operations": analysis.described(), "operation_families": analysis.FAMILIES, "journals": journals.described(),
                "methods": fitting.METHODS, "weights": fitting.WEIGHTS, "losses": list(fitting.LOSSES), "expression_functions": sorted(FUNCTIONS),
                "fonts": figures.fonts(), "formats": figures.FORMATS, "limits": {"points": fitting.MAX_POINTS, "components": models.MAX_COMPONENTS, "projects": host.limits.max_projects}}

    # ── projects ─────────────────────────────────────────────────────────────
    def owned(db: Session, owner: int, project_id: int) -> Any:
        project = db.scalar(select(Project).where(Project.id == project_id, Project.owner_id == owner))
        if project is None:
            raise host.error(404, "not_found", "this project does not exist, or is not yours")
        return project

    def columns(document: ProjectDocument) -> dict[str, Any]:
        """What a row holds of its document: the document, and what the list shows of it."""
        # exclude_none would lose the empty cells of a column: the document is kept as it was sent
        return {"document": document.model_dump(mode="json"), "name": document.name, "sheet_count": len(document.sheets),
                "graph_count": len(document.graphs), "fit_count": len(document.fits), "updated_at": now()}

    def room(db: Session, owner: int) -> None:
        count = db.scalar(select(func.count()).select_from(Project).where(Project.owner_id == owner)) or 0
        if count >= host.limits.max_projects:
            raise host.error(409, "too_many_projects", f"an account holds {host.limits.max_projects} projects at most: delete one first")

    @router.get("/projects", response_model=list[ProjectSummary])
    def list_projects(owner: int = Owner, db: Session = Db) -> list[Any]:
        return list(db.scalars(select(Project).where(Project.owner_id == owner).order_by(Project.updated_at.desc(), Project.id.desc())))

    @router.post("/projects", response_model=ProjectOut, status_code=201)
    def create_project(body: ProjectCreate, owner: int = Owner, db: Session = Db) -> Any:
        room(db, owner)
        project = Project(owner_id=owner, **columns(body.document))
        db.add(project)
        db.commit()
        return project

    @router.get("/projects/{project_id}", response_model=ProjectOut)
    def read_project(project_id: int, owner: int = Owner, db: Session = Db) -> Any:
        return owned(db, owner, project_id)

    @router.put("/projects/{project_id}", response_model=ProjectSummary)
    def update_project(project_id: int, body: ProjectUpdate, owner: int = Owner, db: Session = Db) -> Any:
        project = owned(db, owner, project_id)
        # the revision is checked by the database, in the statement that writes: two saves at once cannot both pass
        changed = db.execute(update(Project).where(Project.id == project.id, Project.owner_id == owner, Project.revision == body.revision)
                             .values(revision=body.revision + 1, **columns(body.document)).execution_options(synchronize_session=False))
        if getattr(changed, "rowcount", 0) != 1:
            db.rollback()
            raise host.error(409, "stale_revision", "this project was changed elsewhere since you opened it")
        db.commit()
        db.refresh(project)
        return project

    @router.delete("/projects/{project_id}", status_code=204)
    def delete_project(project_id: int, owner: int = Owner, db: Session = Db) -> None:
        db.delete(owned(db, owner, project_id))
        db.commit()

    @router.post("/projects/{project_id}/duplicate", response_model=ProjectOut, status_code=201)
    def duplicate_project(project_id: int, owner: int = Owner, db: Session = Db) -> Any:
        source = owned(db, owner, project_id)
        room(db, owner)
        document = ProjectDocument.model_validate(source.document)
        document.name = (document.name[:72] + " (copy)")[:80]
        copy = Project(owner_id=owner, **columns(document))
        db.add(copy)
        db.commit()
        return copy

    # ── models ───────────────────────────────────────────────────────────────
    @router.post("/model/parse")
    def parse_model(body: ModelText, owner: int = Owner) -> dict[str, Any]:
        return computed(lambda: {"model": models.normalised(models.parse(body.text))})

    @router.post("/model/write")
    def write_model(body: ModelIn, owner: int = Owner) -> dict[str, Any]:
        return computed(lambda: {"text": models.write(body.model), "model": models.normalised(body.model), "equations": models.Model(body.model).tex()})

    @router.post("/model/guess")
    def guess_model(body: GuessIn, owner: int = Owner) -> dict[str, Any]:
        return computed(lambda: {"model": fitting.guess(_array(body.x), _array(body.y), body.model, body.limits)})

    @router.post("/model/evaluate")
    def evaluate_model(body: EvaluateIn, owner: int = Owner) -> dict[str, Any]:
        return computed(lambda: fitting.evaluate(body.model, body.x))

    # ── computing ────────────────────────────────────────────────────────────
    @router.post("/fit")
    def fit(body: FitIn, owner: int = Owner) -> dict[str, Any]:
        options = {**body.options.model_dump(), "timeout": host.limits.fit_timeout}
        return computed(lambda: fitting.fit(_array(body.x), _array(body.y), body.model, sigma=_array(body.sigma), limits=body.limits, **options))

    @router.post("/fit/global")
    def fit_global(body: GlobalFitIn, owner: int = Owner) -> dict[str, Any]:
        options = {**body.options.model_dump(), "timeout": host.limits.fit_timeout}
        sets = [{"x": _array(d.x), "y": _array(d.y), "sigma": _array(d.sigma)} for d in body.datasets]
        return computed(lambda: fitting.fit_global(sets, body.model, body.shared, limits=body.limits, **options))

    @router.post("/analyse")
    def analyse(body: AnalyseIn, owner: int = Owner) -> dict[str, Any]:
        return computed(lambda: analysis.run(body.operation, _array(body.x), _array(body.y), dict(body.args), _array(body.x2), _array(body.y2)))

    @router.post("/figure")
    def figure(body: FigureIn, owner: int = Owner) -> dict[str, Any]:
        stem = re.sub(r"[^A-Za-z0-9._-]+", "_", body.name).strip("._") or "figure"

        def draw() -> dict[str, Any]:
            made = figures.render(body.figure, body.format, body.dpi)
            return {"name": f"{stem}.{figures.FORMATS[body.format]['extension']}", "mime": figures.FORMATS[body.format]["mime"], "data": base64.b64encode(made.data).decode(),
                    "width_mm": made.width, "height_mm": made.height, "font": made.font, "notes": made.notes}

        return computed(draw)

    return router


def _array(values: list[float | None] | None) -> list[float] | None:
    """An empty cell is not a number: it travels as null and is computed with as NaN."""
    return None if values is None else [float("nan") if v is None else v for v in values]
