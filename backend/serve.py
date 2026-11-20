#!/usr/bin/env python3
"""Workshop 2, computing for real: the page, and what stands between it and the HAPS.

    cd backend && uv run python serve.py            # http://localhost:8766
    uv run python serve.py --port 8770 --bridge http://127.0.0.1:8791/mcp

A web page cannot start BigDFT, and must not hold the credentials of a HAPS.
This server is the part of the application that runs on the user's machine:

    page ──► serve.py ──► runner.py ──► MCP bridge ──► dry-run HAPS / HAPS
              (this)      one wave      (bridge.sh)     memguess / bigdft -n NAME

It serves `workshop/` as `tools/preview.py` does, and four addresses:

    GET  /api/info              is the bridge there, what does it serve, do wavefunctions travel
    POST /api/compute           {plan, names, script} → {job}: one wave, started
    GET  /api/jobs/ID           how that wave stands, and its results when a run ends
    POST /api/jobs/ID/cancel    stop it
    POST /api/structure         {name} → a molecule's 3D structure, fetched from PubChem, as the text of an .xyz

The page sends the study as data: the calls of the registry of steps. The
script it also sends is kept beside the runs for whoever reads the directory;
it is never executed.

Reached from this machine only (127.0.0.1), and only by its own page: a request
from another origin, or without a JSON body, is refused.
"""
from __future__ import annotations

import argparse
import asyncio
import http.server
import json
import os
import re
import secrets
import signal
import subprocess
import sys
import threading
import time
from pathlib import Path

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent
sys.path[:0] = [str(ROOT / "tools"), str(HERE)]

import yaml  # noqa: E402

import haps  # noqa: E402
import preview  # noqa: E402

SLUG = re.compile(r"^[a-z0-9][a-z0-9_]{0,39}$")
RUN = re.compile(r"^[A-Za-z0-9][A-Za-z0-9_-]{0,29}$")
JOB = re.compile(r"^[0-9a-f]{16}$")
MOLECULE = re.compile(r"^[A-Za-z0-9][A-Za-z0-9 ,.()'+\[\]-]{0,79}$")      # a name or a CID: nothing that changes the address asked
MAX_BODY = 4 * 1024 * 1024
PASSED = ("HOME", "USER", "LOGNAME", "LANG", "LC_ALL", "TZ", "TMPDIR")


def target() -> dict:
    """The HAPS the workshop computes on: the default one of config/haps.yaml."""
    config = yaml.safe_load((ROOT / "config" / "haps.yaml").read_text())
    return config["haps"][config["default"]]


class Backend:
    def __init__(self, bridge: str, workdir: Path, timeout: int) -> None:
        self.bridge, self.workdir, self.timeout = bridge, workdir.resolve(), timeout
        self.workdir.mkdir(parents=True, exist_ok=True)
        self.jobs: dict[str, dict] = {}
        self.lock = threading.Lock()
        self._info: tuple[float, dict] = (0.0, {})

    def info(self, fresh: bool = False) -> dict:
        """What the bridge says, asked at most every few seconds."""
        with self.lock:
            at, known = self._info
        if fresh or time.monotonic() - at > 5:
            known = asyncio.run(haps.info(self.bridge))
            with self.lock:
                self._info = (time.monotonic(), known)
        return known

    def environment(self) -> dict[str, str]:
        """What the runner sees: PyBigDFT's Python, BigDFT's stand-ins first, where the bridge is. Nothing else."""
        env = {k: os.environ[k] for k in PASSED if os.environ.get(k)}
        env.update({
            "PATH": os.pathsep.join([str(HERE / "bigdft_bin"), str(Path(sys.executable).parent), "/usr/local/bin", "/usr/bin", "/bin"]),
            "BIGDFT_ROOT": str(HERE / "bigdft_bin"),
            "PYBIGDFT_PYTHON": sys.executable,
            "PYBIGDFT_WORKDIR": str(self.workdir),
            "PYBIGDFT_HAPS_MCP_URL": self.bridge,
            "OMP_NUM_THREADS": "1",
            "PYTHONUNBUFFERED": "1",
            "MPLBACKEND": "Agg",
        })
        return env

    def compute(self, body: dict) -> tuple[int, dict]:
        plan, names = body.get("plan"), body.get("names")
        if not isinstance(plan, dict) or not SLUG.match(str(plan.get("name", ""))) or not isinstance(plan.get("steps"), list) \
                or not isinstance(plan.get("structure"), dict):
            return 400, {"error": "not a study: a plan with a name, a structure and steps is expected"}
        if not isinstance(names, list) or not names or not all(isinstance(n, str) and RUN.match(n) for n in names):
            return 400, {"error": "names: the runs to compute, as the page names them"}
        bridge = self.info(fresh=True)
        if not bridge["ok"]:
            return 503, {"error": "the HAPS is not ready", "detail": bridge["text"]}
        if bridge["workdir"] and Path(bridge["workdir"]).resolve() != self.workdir:
            return 503, {"error": "the bridge does not see the studies", "detail": f"it works in {bridge['workdir']}, "
                         f"this server writes in {self.workdir}: start both on the same directory (backend/bridge.sh does)"}
        study = self.workdir / plan["name"]
        with self.lock:
            busy = next((j for j in self.jobs.values() if j["study"] == study and j["process"].poll() is None), None)
            if busy:
                return 409, {"error": "this study is already computing", "job": busy["id"]}
            job = secrets.token_hex(8)
            folder = study / ".jobs" / job
            folder.mkdir(parents=True)
            if isinstance(body.get("script"), str):
                (study / "study.py").write_text(body["script"])       # for the reader of the directory; never run
            (folder / "request.json").write_text(json.dumps({
                "plan": plan, "names": names, "bridge": self.bridge, "workdir": str(self.workdir),
                "timeout": self.timeout, "haps": {"wavefunctions": bridge["wavefunctions"]}}))
            log = (folder / "runner.log").open("w")
            process = subprocess.Popen([sys.executable, str(HERE / "runner.py"), str(folder)], cwd=study, env=self.environment(),
                                       stdin=subprocess.DEVNULL, stdout=log, stderr=subprocess.STDOUT, start_new_session=True)
            self.jobs[job] = {"id": job, "study": study, "folder": folder, "process": process}
        return 200, {"job": job, "directory": str(study / "runs")}

    def status(self, job: str) -> tuple[int, dict]:
        known = self.jobs.get(job)
        if not known:
            return 404, {"error": "no such job"}
        code = known["process"].poll()
        try:
            status = json.loads((known["folder"] / "status.json").read_text())
        except (OSError, ValueError):
            status = {"state": "running", "phase": "starting", "message": "", "runs": {}}
        if code is not None and status["state"] == "running":       # the runner ended without saying how
            tail = (known["folder"] / "runner.log").read_text(errors="replace").strip()[-800:]
            stopped = code == -signal.SIGTERM
            status.update(state="done" if stopped else "error", phase="",
                          message="stopped" if stopped else f"the runner stopped (exit {code}): {tail}")
            for run in status["runs"].values():
                if run["state"] in ("checking", "sent", "running"):
                    run.update(state="stopped" if stopped else "failed", text="stopped" if stopped else "not computed: the runner stopped")
        return 200, status

    def structure(self, body: dict) -> tuple[int, dict]:
        """A molecule by its name: the pack's own tool asks PubChem and writes BigDFT's .xyz; its text goes to the page."""
        name = " ".join(str(body.get("name") or "").split())
        if not MOLECULE.match(name):
            return 400, {"error": "give the name of a molecule or its PubChem CID (letters, digits, spaces, - , . ( ) ')"}
        from xyz_downloader import download_xyz_for_bigdft
        said = json.loads(download_xyz_for_bigdft(name, ".structures", _root=self.workdir))
        if "error" in said:
            return (404 if "not found" in said["error"] else 502), {"error": said["error"]}
        return 200, {"name": name, "xyz": Path(said["file"]).read_text(), "atoms": said["atoms"], "formula": said["formula"],
                     "source": f"PubChem 3D record of “{name}”"}

    def cancel(self, job: str) -> tuple[int, dict]:
        known = self.jobs.get(job)
        if not known:
            return 404, {"error": "no such job"}
        if known["process"].poll() is None:
            known["process"].send_signal(signal.SIGTERM)             # the runner asks the HAPS to stop its jobs
        return 200, {"job": job}


def handler(backend: Backend, port: int):
    hosts = {f"127.0.0.1:{port}", f"localhost:{port}"}

    class Handler(preview.Handler):
        root = ROOT / "workshop"

        def answer(self, code: int, body: dict) -> None:
            self.send_bytes(code, json.dumps(body).encode(), "application/json")

        def ours(self) -> bool:
            """A request this page made: to this address, and from no other origin."""
            origin = self.headers.get("Origin")
            return self.headers.get("Host") in hosts and (origin is None or origin in {"http://" + h for h in hosts})

        def do_GET(self):
            path = self.path.split("?")[0]
            if not self.ours():
                return self.answer(403, {"error": "this server answers its own page only"})
            if path == "/api/info":
                bridge = backend.info()
                return self.answer(200, {"live": True, "bridge": backend.bridge, "workdir": str(backend.workdir),
                                         "timeout": backend.timeout, "haps": bridge})
            match = re.fullmatch(r"/api/jobs/([0-9a-f]{16})", path)
            if match:
                return self.answer(*backend.status(match.group(1)))
            if path.startswith("/api/"):
                return self.answer(404, {"error": "no such address"})
            return super().do_GET()

        def do_POST(self):
            path = self.path.split("?")[0]
            if not self.ours() or self.headers.get("Origin") is None \
                    or not (self.headers.get("Content-Type") or "").startswith("application/json"):
                return self.answer(403, {"error": "this server answers its own page only"})
            length = int(self.headers.get("Content-Length") or 0)
            if length > MAX_BODY:
                return self.answer(413, {"error": "too large"})
            try:
                body = json.loads(self.rfile.read(length) or b"{}")
            except ValueError:
                return self.answer(400, {"error": "not JSON"})
            if path == "/api/compute":
                return self.answer(*backend.compute(body))
            if path == "/api/structure":
                return self.answer(*backend.structure(body))
            match = re.fullmatch(r"/api/jobs/([0-9a-f]{16})/cancel", path)
            if match:
                return self.answer(*backend.cancel(match.group(1)))
            return self.answer(404, {"error": "no such address"})

    return Handler


def main() -> int:
    where = target()
    parser = argparse.ArgumentParser(description="Workshop 2, computing on the HAPS.")
    parser.add_argument("--port", type=int, default=8766)
    parser.add_argument("--bridge", default=os.environ.get("ONDELETTE_BRIDGE") or where["mcp_url"],
                        help="the MCP bridge (default: mcp_url of the default HAPS in config/haps.yaml)")
    parser.add_argument("--workdir", default=os.environ.get("ONDELETTE_WORKDIR") or str(HERE / "work"),
                        help="where the studies are written: it must be the bridge's working directory")
    parser.add_argument("--timeout", type=int, default=int(where["limits"]["max_timeout_s"]),
                        help="seconds a run may take on the HAPS")
    args = parser.parse_args()
    backend = Backend(args.bridge, Path(args.workdir), args.timeout)
    known = backend.info()
    print(f"http://localhost:{args.port}")
    print(f"bridge   {args.bridge}: " + ("ready" + ("" if known["wavefunctions"] else ", wavefunctions do not travel")
                                             if known["ok"] else "NOT READY"))
    if not known["ok"]:
        print("  " + known["text"].replace("\n", "\n  "))
    elif Path(known["workdir"] or backend.workdir).resolve() != backend.workdir:
        print(f"  WARNING: the bridge works in {known['workdir']}, not in the directory below: nothing can be computed")
    print(f"studies  {backend.workdir}")
    http.server.ThreadingHTTPServer(("127.0.0.1", args.port), handler(backend, args.port)).serve_forever()
    return 0


if __name__ == "__main__":
    try:
        sys.exit(main())
    except KeyboardInterrupt:
        sys.exit(130)
