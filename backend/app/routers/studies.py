"""The studies of whoever is signed in, and computing them. A study of someone else does not exist here (404).

    GET    /api/studies                  their list, the most recently changed first
    POST   /api/studies                  {document} → a new study
    GET    /api/studies/ID               the study, with what BigDFT gave for it so far
    PUT    /api/studies/ID               {document, revision}: 409 when it was changed elsewhere since that revision
    DELETE /api/studies/ID               the study, its results and its runs on disk
    POST   /api/studies/ID/duplicate     a copy, with nothing computed
    POST   /api/studies/ID/compute       {plan, names, keys, script} → {job}: one wave, started
    GET    /api/jobs/ID                  how that wave stands, and its results when a run ends
    POST   /api/jobs/ID/cancel           stop it
    POST   /api/structure                {name} → a molecule's 3D structure, fetched from PubChem, as the text of an .xyz
    GET    /api/info                     is the bridge there, is the HAPS ready, do wavefunctions travel
"""
from __future__ import annotations

from typing import Any

from fastapi import APIRouter
from sqlalchemy import func, select, update

from ..deps import Config, CurrentUser, Db
from ..errors import AppError, not_found
from ..models import Job, Role, RunResult, Study, User, now
from ..schemas import ComputeIn, ComputeOut, MoleculeIn, StudyCreate, StudyDocument, StudyOut, StudySummary, StudyUpdate
from .account import Computing

router = APIRouter(tags=["studies"])


def owned(db: Db, user: User, study_id: int) -> Study:
    study = db.scalar(select(Study).where(Study.id == study_id, Study.owner_id == user.id))
    if study is None:
        raise not_found("this study")
    return study


def columns(document: StudyDocument) -> dict[str, Any]:
    """What a study row holds of its document: the document, and what the list shows of it."""
    return {"document": document.model_dump(mode="json"), "name": document.name, "system": document.system,
            "step_count": len(document.steps), "updated_at": now()}


def shown(db: Db, study: Study, compute: Computing) -> StudyOut:
    results = {r.key: r.result for r in db.scalars(select(RunResult).where(RunResult.study_id == study.id))}
    job = compute.running(db, study.id)
    return StudyOut(**StudySummary.model_validate(study).model_dump(), document=study.document, results=results, job=job.id if job else None)


@router.get("/studies", response_model=list[StudySummary])
def list_studies(user: CurrentUser, db: Db) -> list[Study]:
    return list(db.scalars(select(Study).where(Study.owner_id == user.id).order_by(Study.updated_at.desc(), Study.id.desc())))


@router.post("/studies", response_model=StudyOut, status_code=201)
def create_study(body: StudyCreate, user: CurrentUser, db: Db, settings: Config, compute: Computing) -> StudyOut:
    count = db.scalar(select(func.count()).select_from(Study).where(Study.owner_id == user.id)) or 0
    if count >= settings.max_studies_per_user:
        raise AppError(409, "too_many_studies", f"an account holds {settings.max_studies_per_user} studies at most: delete one first")
    study = Study(owner_id=user.id, **columns(body.document))
    db.add(study)
    db.commit()
    return shown(db, study, compute)


@router.get("/studies/{study_id}", response_model=StudyOut)
def read_study(study_id: int, user: CurrentUser, db: Db, compute: Computing) -> StudyOut:
    return shown(db, owned(db, user, study_id), compute)


@router.put("/studies/{study_id}", response_model=StudySummary)
def update_study(study_id: int, body: StudyUpdate, user: CurrentUser, db: Db) -> Study:
    study = owned(db, user, study_id)
    # the revision is checked by the database, in the statement that writes: two saves at once cannot both pass
    changed = db.execute(update(Study).where(Study.id == study.id, Study.owner_id == user.id, Study.revision == body.revision)
                         .values(revision=body.revision + 1, **columns(body.document)).execution_options(synchronize_session=False))
    if getattr(changed, "rowcount", 0) != 1:
        db.rollback()
        raise AppError(409, "stale_revision", "this study was changed elsewhere since you opened it", extra={"revision": study.revision})
    db.commit()
    db.refresh(study)
    return study


@router.delete("/studies/{study_id}", status_code=204)
def delete_study(study_id: int, user: CurrentUser, db: Db, compute: Computing) -> None:
    study = owned(db, user, study_id)
    if compute.running(db, study.id) is not None:
        raise AppError(409, "already_computing", "this study is computing: stop it first")
    db.delete(study)
    db.commit()
    compute.forget(user.id, study_id)


@router.post("/studies/{study_id}/duplicate", response_model=StudyOut, status_code=201)
def duplicate_study(study_id: int, user: CurrentUser, db: Db, settings: Config, compute: Computing) -> StudyOut:
    source = owned(db, user, study_id)
    count = db.scalar(select(func.count()).select_from(Study).where(Study.owner_id == user.id)) or 0
    if count >= settings.max_studies_per_user:
        raise AppError(409, "too_many_studies", f"an account holds {settings.max_studies_per_user} studies at most: delete one first")
    document = StudyDocument.model_validate(source.document)
    document.name = (document.name[:52] + " (copy)")[:60]
    document.log = []                                                # what was sent belongs to the study it was sent for
    copy = Study(owner_id=user.id, **columns(document))
    db.add(copy)
    db.commit()
    return shown(db, copy, compute)


# ── computing ────────────────────────────────────────────────────────────────
@router.post("/studies/{study_id}/compute", response_model=ComputeOut)
def start_wave(study_id: int, body: ComputeIn, user: CurrentUser, db: Db, compute: Computing) -> ComputeOut:
    study = owned(db, user, study_id)
    job = compute.start(db, user, study, body, admin=user.role is Role.ADMIN)
    return ComputeOut(job=job.id, directory=f"u{user.id}/s{study.id}/runs")


def job_of(db: Db, user: User, job_id: str) -> Job:
    job = db.scalar(select(Job).where(Job.id == job_id, Job.owner_id == user.id))
    if job is None:
        raise not_found("this wave")
    return job


@router.get("/jobs/{job_id}")
def read_job(job_id: str, user: CurrentUser, db: Db, compute: Computing) -> dict[str, Any]:
    return compute.read(db, job_of(db, user, job_id))


@router.post("/jobs/{job_id}/cancel")
def cancel_job(job_id: str, user: CurrentUser, db: Db, compute: Computing) -> dict[str, str]:
    job = job_of(db, user, job_id)
    compute.cancel(db, job)
    return {"job": job.id}


@router.post("/structure")
def molecule(body: MoleculeIn, user: CurrentUser, compute: Computing) -> dict[str, Any]:
    return compute.structure(body.name)


@router.get("/info")
def info(user: CurrentUser, compute: Computing, settings: Config) -> dict[str, Any]:
    """Where the page computes. Addresses and paths of the server are an administrator's business."""
    bridge = compute.info()
    if user.role is Role.ADMIN:
        return {"live": True, "bridge": compute.bridge, "workdir": str(compute.workdir), "timeout": compute.timeout, "haps": bridge}
    text = "" if bridge["ok"] else "The compute service is not reachable for the moment. An administrator of this workshop can see why."
    return {"live": True, "bridge": None, "workdir": None, "timeout": compute.timeout,
            "haps": {"ok": bridge["ok"], "wavefunctions": bridge["wavefunctions"], "text": text}}
