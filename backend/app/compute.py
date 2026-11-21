"""Between a study and the HAPS: start a wave, follow it, keep what BigDFT gave.

A wave is one process of ``runner.py`` (see its docstring): it rebuilds the study
from data with the registry of steps, has BigDFT dry-run each input, sends the
runs through the MCP bridge and reads the logs. This module starts that process
in the directory of the study, reads the status it writes, and records each
result in the database under the identity the page gave its calculation.

Each study has a directory of its own, ``<workdir>/u<user>/s<study>``: the runs
of a user are never beside those of another, and the name a study was given is
no part of a path. The bridge shares ``<workdir>`` and holds the only account on
the HAPS; no code travels from the page.

The jobs are followed by this process: run ONE worker (see the README).
"""
from __future__ import annotations

import asyncio
import hashlib
import json
import logging
import os
import secrets
import shutil
import signal
import subprocess
import sys
import threading
import time
from pathlib import Path
from typing import Any

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from .config import BACKEND, Settings
from .errors import AppError
from .models import Job, RunResult, Study, User, now
from .schemas import ComputeIn

sys.path[:0] = [p for p in (str(BACKEND.parent / "tools"), str(BACKEND)) if p not in sys.path]

import haps  # noqa: E402  (backend/haps.py: the client of the bridge)

log = logging.getLogger("ondelette.compute")

PASSED = ("HOME", "USER", "LOGNAME", "LANG", "LC_ALL", "TZ", "TMPDIR")
ON_THEIR_WAY = ("checking", "sent", "running")


def alive(pid: int | None) -> bool:
    if not pid:
        return False
    try:
        os.kill(pid, 0)
    except ProcessLookupError:
        return False
    except PermissionError:
        return True
    return True


class Compute:
    def __init__(self, settings: Settings) -> None:
        self.settings = settings
        self.bridge, self.workdir, self.timeout = settings.bridge, settings.workdir, settings.timeout
        self.workdir.mkdir(parents=True, exist_ok=True)
        self.processes: dict[str, subprocess.Popen[bytes]] = {}
        self.saved: dict[str, set[str]] = {}                 # job → the runs whose result is already in the database
        self.lock = threading.RLock()
        self._info: tuple[float, dict[str, Any]] = (0.0, {})

    # ── the bridge ───────────────────────────────────────────────────────────
    def info(self, fresh: bool = False) -> dict[str, Any]:
        """What the bridge says, asked at most every few seconds."""
        with self.lock:
            at, known = self._info
        if fresh or not known or time.monotonic() - at > 5:
            known = asyncio.run(haps.info(self.bridge))
            with self.lock:
                self._info = (time.monotonic(), known)
        return known

    def environment(self) -> dict[str, str]:
        """What the runner sees: PyBigDFT's Python, BigDFT's stand-ins first, where the bridge is. Nothing else:
        no setting of the application, and above all not the address of its database."""
        env = {k: os.environ[k] for k in PASSED if os.environ.get(k)}
        env.update({
            "PATH": os.pathsep.join([str(BACKEND / "bigdft_bin"), str(Path(sys.executable).parent), "/usr/local/bin", "/usr/bin", "/bin"]),
            "BIGDFT_ROOT": str(BACKEND / "bigdft_bin"),
            "PYBIGDFT_PYTHON": sys.executable,
            "PYBIGDFT_WORKDIR": str(self.workdir),
            "PYBIGDFT_HAPS_MCP_URL": self.bridge,
            "OMP_NUM_THREADS": "1",
            "PYTHONUNBUFFERED": "1",
            "MPLBACKEND": "Agg",
        })
        return env

    # ── where a study is written ─────────────────────────────────────────────
    def user_directory(self, owner_id: int) -> Path:
        return self.workdir / f"u{int(owner_id)}"

    def directory(self, owner_id: int, study_id: int) -> Path:
        return self.user_directory(owner_id) / f"s{int(study_id)}"

    def folder(self, job: Job) -> Path:
        return self.directory(job.owner_id, job.study_id) / ".jobs" / job.id

    def forget(self, owner_id: int, study_id: int | None = None) -> None:
        """Remove what a study, or every study of a user, left on disk."""
        target = self.user_directory(owner_id) if study_id is None else self.directory(owner_id, study_id)
        if target.is_dir() and self.workdir in target.resolve().parents:
            shutil.rmtree(target, ignore_errors=True)

    # ── a wave ───────────────────────────────────────────────────────────────
    def running(self, db: Session, study_id: int) -> Job | None:
        """The wave of a study still on its way, if any."""
        for job in db.scalars(select(Job).where(Job.study_id == study_id, Job.state == "running")):
            self.read(db, job)
            if job.state == "running":
                return job
        return None

    def start(self, db: Session, user: User, study: Study, body: ComputeIn, *, admin: bool) -> Job:
        bridge = self.info(fresh=True)
        if not bridge["ok"]:
            raise AppError(503, "haps_not_ready", "the HAPS is not ready", detail=bridge["text"] if admin else "")
        if bridge["workdir"] and Path(bridge["workdir"]).resolve() != self.workdir:
            raise AppError(503, "bridge_elsewhere", "the bridge does not see the studies",
                           detail=(f"it works in {bridge['workdir']}, this server writes in {self.workdir}: "
                                   "start both on the same directory (backend/bridge.sh does)") if admin else "")
        with self.lock:
            busy = self.running(db, study.id)
            if busy is not None:
                raise AppError(409, "already_computing", "this study is already computing", extra={"job": busy.id})
            mine = [j for j in db.scalars(select(Job).where(Job.owner_id == user.id, Job.state == "running")) if self.read(db, j)["state"] == "running"]
            if len(mine) >= self.settings.max_jobs_per_user:
                raise AppError(429, "too_many_jobs", f"{len(mine)} of your studies are computing already: wait for one to end")
            job = Job(id=secrets.token_hex(8), owner_id=user.id, study_id=study.id, state="running",
                      runs={name: body.keys.get(name, "") for name in body.names})
            where = self.directory(user.id, study.id)
            folder = where / ".jobs" / job.id
            folder.mkdir(parents=True)
            if body.script is not None:
                (where / "study.py").write_text(body.script)             # for the reader of the directory; never run
            (folder / "request.json").write_text(json.dumps({
                "plan": body.plan.model_dump(), "names": body.names, "bridge": self.bridge, "workdir": str(self.workdir),
                "timeout": self.timeout, "haps": {"wavefunctions": bridge["wavefunctions"]}}))
            with (folder / "runner.log").open("w") as output:
                process = subprocess.Popen([sys.executable, str(self.settings.runner), str(folder)], cwd=where, env=self.environment(),
                                           stdin=subprocess.DEVNULL, stdout=output, stderr=subprocess.STDOUT, start_new_session=True)
            job.pid = process.pid
            self.processes[job.id] = process
            db.add(job)
            db.commit()
        return job

    def read(self, db: Session, job: Job) -> dict[str, Any]:
        """How a wave stands, as the page reads it. Records the results that came back, and how the wave ended."""
        folder = self.folder(job)
        try:
            status: dict[str, Any] = json.loads((folder / "status.json").read_text())
        except (OSError, ValueError):
            status = {"state": "running", "phase": "starting", "message": "", "runs": {}}
        if job.state != "running" and status["state"] != "running":
            return status                                                # ended, and already recorded as such
        with self.lock:
            process = self.processes.get(job.id)
            code = process.poll() if process is not None else (None if alive(job.pid) and job.state == "running" else 1)
            if code is not None and status["state"] == "running":       # the runner ended without saying how
                stopped = code == -signal.SIGTERM
                try:
                    tail = (folder / "runner.log").read_text(errors="replace").strip()[-800:]
                except OSError:
                    tail = ""
                said = "stopped" if stopped else ("the runner stopped" + (f" (exit {code})" if process is not None else
                                                  ": the server was restarted while this wave was computing") + (f": {tail}" if tail else ""))
                status.update(state="done" if stopped else "error", phase="", message=said)
                for run in status["runs"].values():
                    if run["state"] in ON_THEIR_WAY:
                        run.update(state="stopped" if stopped else "failed", text="stopped" if stopped else "not computed: the runner stopped")
            self.record(db, job, status)
            if status["state"] != "running" and job.state == "running":
                job.state = "stopped" if status.get("message") == "stopped" else status["state"]
                job.message, job.finished_at = str(status.get("message") or "")[:4000], now()
                db.commit()
                if process is not None and process.poll() is not None:
                    self.processes.pop(job.id, None)
                self.saved.pop(job.id, None)
        return status

    def record(self, db: Session, job: Job, status: dict[str, Any]) -> None:
        """Keep each result that came back, under the identity of its calculation, for the study of this wave."""
        saved = self.saved.setdefault(job.id, set())
        fresh = [(name, run) for name, run in status["runs"].items()
                 if name not in saved and run.get("state") == "done" and isinstance(run.get("result"), dict) and job.runs.get(name)]
        for name, run in fresh:
            key = str(job.runs[name])
            digest = hashlib.sha256(key.encode()).hexdigest()
            row = db.scalar(select(RunResult).where(RunResult.study_id == job.study_id, RunResult.key_hash == digest))
            if row is None:
                db.add(RunResult(study_id=job.study_id, owner_id=job.owner_id, key_hash=digest, key=key, name=name[:30], result=run["result"]))
            else:
                row.name, row.result, row.created_at = name[:30], run["result"], now()
            saved.add(name)
        if fresh:
            db.commit()

    def cancel(self, db: Session, job: Job) -> None:
        """Ask the runner to stop: it asks the HAPS to stop its jobs, and says how each run ended."""
        process = self.processes.get(job.id)
        if process is not None and process.poll() is None:
            process.send_signal(signal.SIGTERM)
        elif process is None and job.state == "running" and alive(job.pid):
            try:
                os.kill(int(job.pid or 0), signal.SIGTERM)
            except OSError:
                pass

    def stop_all(self, db: Session, *, owner_id: int | None = None, study_id: int | None = None) -> None:
        query = select(Job).where(Job.state == "running")
        if owner_id is not None:
            query = query.where(Job.owner_id == owner_id)
        if study_id is not None:
            query = query.where(Job.study_id == study_id)
        for job in db.scalars(query):
            self.cancel(db, job)

    def sweep(self, db: Session) -> int:
        """Follow the waves nobody is looking at: a page that was closed must not lose what came back."""
        jobs = list(db.scalars(select(Job).where(Job.state == "running")))
        for job in jobs:
            try:
                self.read(db, job)
            except Exception:                                            # one study's trouble is not the others'
                db.rollback()
                log.exception("could not follow job %s", job.id)
        following = {job.id for job in jobs if job.state == "running"}
        with self.lock:                                                  # a runner that said "done" a moment before it ended
            for job_id in [j for j, p in self.processes.items() if j not in following and p.poll() is not None]:
                del self.processes[job_id]
        return len(jobs)

    def count_running(self, db: Session) -> int:
        return int(db.scalar(select(func.count()).select_from(Job).where(Job.state == "running")) or 0)

    # ── a molecule by its name ───────────────────────────────────────────────
    def structure(self, name: str) -> dict[str, Any]:
        """The pack's own tool asks PubChem and writes BigDFT's .xyz; its text goes to the page."""
        from xyz_downloader import download_xyz_for_bigdft

        name = " ".join(name.split())
        said = json.loads(download_xyz_for_bigdft(name, ".structures", _root=self.workdir))
        if "error" in said:
            missing = "not found" in said["error"]
            raise AppError(404 if missing else 502, "molecule_not_found" if missing else "pubchem_failed", said["error"])
        return {"name": name, "xyz": Path(said["file"]).read_text(), "atoms": said["atoms"], "formula": said["formula"],
                "source": f"PubChem 3D record of “{name}”"}
