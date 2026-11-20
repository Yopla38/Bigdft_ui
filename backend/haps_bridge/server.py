"""The MCP bridge through which the agent runs BigDFT on a HAPS.

    ./haps_bridge.sh [CREDENTIALS.env]       # from the pack: http://127.0.0.1:8790/mcp

The USER side of the HAPS, and part of this pack: it runs on the user's
machine, beside the agent, because it reads the inputs from and writes the
outputs to the agent's working directory (`[mcp] workdir` of ../haps.toml =
this pack's sandbox/). The HAPS itself — ebservice, ebuffer, the runtimes and
BigDFT — lives wherever ../haps.toml's [servers] say; nothing of it is needed
here. Two applications go through the bridge:

- the DRY RUN (`haps_dryrun`): the agent's PyBigDFT script, with
  `SystemCalculator(dry_run=True)`, calls the pack's stand-in `bigdft-tool`,
  which calls this tool; the dry-run HAPS runs `memguess NPROC NAME dd l`
  (BigDFT's input check and memory estimate) and the log comes back where
  PyBigDFT expects it;
- the COMPUTATION (`haps_bigdft`): the agent hands the inputs whose dry run
  was clean, and the HAPS runs `bigdft -n NAME`.

No code travels — only BigDFT's input files, checked by `inputs` on both
sides (this pack's copy here, the HAPS's own in its runtime). The HAPS credentials stay in this process: neither the agent nor
the code it writes ever holds them.

One call goes through the whole exchange, for each run name:

  <directory>/<name>.yaml ──tar.gz──► input buffer ─┐
                                                    ├─► job on the application ─► runtime
  <directory>/log-<name>.yaml … ◄─tar.gz─ output buffer ┘   (results, log tails)

Several names are several jobs, submitted together and run in parallel.

Served over streamable HTTP rather than stdio on purpose: agent-slapsci starts
a stdio server with the MCP SDK's default environment and no working directory,
once per tool call, so neither HAPS_* settings nor the location of haps.toml
would reach it. A long-running process started beside the HAPS stack reads its
settings once, keeps one authenticated client per HAPS, and the agent's config
only names a URL.
"""

from __future__ import annotations

import asyncio
import logging
import time
from dataclasses import dataclass, field
from pathlib import Path, PurePosixPath
from typing import Any

from haps_client import HapsClient, MessageException
from mcp.server.mcpserver import MCPServer

from . import archive, inputs
from .settings import TARGETS, Application, Settings, application, client_kwargs, load, owner

log = logging.getLogger("haps_bridge")

TERMINAL = {"COMPLETED", "FAILED", "CANCELLED", "STOPPED"}
POLL_S = 1.0
# Where the bridge keeps, on the job itself, what it needs to collect it later.
META_KEY = "bridge"
#: The dry-run runtime's own bound on nproc (pybigdft_haps.dryrun.MAX_NPROC).
MAX_NPROC = 4096


def check_nproc(raw: str | int | None) -> int:
    """The number of processes to estimate for: an integer in [1, MAX_NPROC]."""
    try:
        nproc = int(raw if raw not in (None, "") else 1)
    except (TypeError, ValueError) as exc:
        raise inputs.InputError(f"nproc {raw!r} is not an integer") from exc
    if not 1 <= nproc <= MAX_NPROC:
        raise inputs.InputError(f"nproc {nproc} is out of range [1, {MAX_NPROC}]")
    return nproc


class Service:
    """One published application, and the authenticated client that reaches it."""

    def __init__(self, target: str, app: Application, client: HapsClient,
                 owner: str | None = None) -> None:
        self.target = target
        self.app = app
        self.client = client
        self.owner = owner          # only an application this maintainer published
        self._mservice = None

    def mservice(self, refresh: bool = False):
        if self._mservice is None or refresh:
            found = [ms for ms in self.client.mservices.find(name=self.app.name,
                                                             mime_type=self.app.mime_type,
                                                             owner=self.owner)
                     if ms.state is not None and ms.state >= 0]
            if not found:
                runtime = "runtime --dryrun" if self.target == "dryrun" else "runtime"
                raise LookupError(
                    f"no application {self.app.name!r} ({self.app.mime_type}) is published on "
                    f"{self.client.ebservice_url}: is the HAPS serving it (its {runtime}, on "
                    "the HAPS side)? Check [application] and [maintainer] email in haps.toml")
            self._mservice = found[-1]
        return self._mservice

    def job(self, job_id: str):
        return self.mservice().get_job(job_id)


@dataclass
class Collected:
    """A finished job, its outputs written back."""
    name: str
    job_id: str
    status: str
    results: dict[str, str] = field(default_factory=dict)
    runtime: dict = field(default_factory=dict)
    run_desc: str = ""
    target: Path | None = None
    logs_dir: Path | None = None
    produced: list[str] = field(default_factory=list)


class Bridge:
    """Everything one tool call needs: settings, the two services, the workdir."""

    def __init__(self, settings: Settings) -> None:
        self.settings = settings
        self.mcp = settings["mcp"]
        self.workdir = Path(self.mcp["workdir"]).resolve()
        self.services = {
            target: Service(target, application(settings, target),
                            HapsClient(**client_kwargs(settings, target)),
                            owner(settings, target))
            for target in TARGETS
        }

    def service(self, target: str) -> Service:
        return self.services[target]

    def find(self, job_id: str) -> tuple[Service, Any]:
        """The service a job belongs to, and the job."""
        last: Exception | None = None
        for service in self.services.values():
            try:
                return service, service.job(job_id)
            except (MessageException, LookupError) as exc:
                last = exc
        raise LookupError(f"no job {job_id} on this HAPS ({last})")

    # ── paths ──────────────────────────────────────────────────────────────
    def directory(self, relative: str) -> Path:
        """A directory of the working directory, given relative to it."""
        pure = PurePosixPath(relative or ".")
        if pure.is_absolute() or ".." in pure.parts:
            raise ValueError(f"{relative!r}: give a directory relative to your working directory")
        path = (self.workdir / pure).resolve()
        if not path.is_relative_to(self.workdir):
            raise ValueError(f"{relative!r} leaves your working directory")
        if not path.is_dir():
            raise FileNotFoundError(f"{relative!r} is not a directory of your working directory")
        return path

    def shown(self, path: Path) -> str:
        return path.relative_to(self.workdir).as_posix() or "."

    # ── one job ────────────────────────────────────────────────────────────
    def output_reserve_mb(self, target: str) -> int:
        """Room reserved for a job's outputs: a dry run returns a log of a few hundred kB."""
        if target == "dryrun" and self.mcp.get("dryrun_output_reserve_mb"):
            return int(self.mcp["dryrun_output_reserve_mb"])
        return int(self.mcp["output_reserve_mb"])

    def submit(self, service: Service, name: str, directory: Path, arguments: list[str]) -> str:
        """Send NAME.yaml and its side files; *arguments* follow the name, in XGTD order."""
        # A dry run parses the input and reads no wavefunction: they stay behind.
        selected = inputs.select(directory, name, wavefunctions=service.target == "compute")
        inputs.check(list(selected), name)          # what the runtime will check
        data = archive.pack(selected)
        lifespan = int(self.mcp["buffer_lifespan_s"])
        tags = ["pack::pybigdft", "via::mcp", f"target::{service.target}"]
        ebin = service.client.buffers.create(reserved_size=max(len(data), 1), lifespan=lifespan,
                                             tags=tags)
        ebin.fill(data)
        ebout = service.client.buffers.create(
            reserved_size=self.output_reserve_mb(service.target) * 1024 * 1024,
            lifespan=lifespan, tags=tags)
        body = {"arguments": [name, *arguments], "ebin": [ebin.uuid], "ebout": [ebout.uuid],
                "tags": tags}
        try:
            job = service.mservice().submit_job(body)
        except MessageException as exc:
            if exc.status_code != 404:
                raise
            job = service.mservice(refresh=True).submit_job(body)    # republished meanwhile
        job.set_metadata({"user": {META_KEY: {"name": name,
                                              "directory": self.shown(directory),
                                              "sent": sorted(selected)}}}, update=True)
        return job.uuid

    def wait(self, service: Service, job_ids: list[str], seconds: float) -> dict[str, str]:
        """Status of each job, waiting until all are terminal or *seconds* have passed."""
        deadline = time.monotonic() + seconds
        jobs = {jid: service.job(jid) for jid in job_ids}
        while True:
            status = {jid: job.get_run_status().value for jid, job in jobs.items()}
            if all(s in TERMINAL for s in status.values()) or time.monotonic() >= deadline:
                return status
            time.sleep(POLL_S)

    def collect(self, service: Service, job_id: str) -> Collected:
        """Read a finished job and write its outputs back beside its inputs."""
        job = service.job(job_id).refresh()
        user = (job.metadata.get("user_data") or {}).get("user") or {}
        meta = user.get(META_KEY) or {}
        name = meta.get("name") or (job.arguments[0] if job.arguments else "?")
        status = job.run_status.value if job.run_status else "?"
        done = Collected(name=name, job_id=job_id, status=status, run_desc=job.run_desc or "")
        if status != "COMPLETED":
            return done
        done.target = self.directory(meta.get("directory", "."))
        done.results = dict(zip(service.mservice().result_names, job.results, strict=False))
        done.runtime = (job.metadata.get("user_data") or {}).get("runtime") or {}
        done.logs_dir = self.workdir / ".runs" / f"{time.strftime('%Y%m%d-%H%M%S')}-haps-{job_id[:8]}"
        target, logs_dir = done.target, done.logs_dir

        def route(member: PurePosixPath):
            head_, rest = member.parts[0], PurePosixPath(*member.parts[1:])
            if head_ == "files" and rest.parts:
                return target, rest
            if head_ == "logs" and rest.parts:
                return logs_dir, rest
            return None

        written = []
        if job.ebout:
            data = service.client.buffers.get(job.ebout[0]).fetch()
            written = archive.unpack(data, target, route=route)
        done.produced = sorted(self.shown(p) for p in written if not p.is_relative_to(logs_dir))
        return done

    # ── what the agent reads ───────────────────────────────────────────────
    def _unrun(self, done: Collected) -> str:
        return (f"[HAPS {done.status}] {done.name}  (job {done.job_id}): the HAPS did not run "
                f"it — {done.run_desc or 'no detail'}")

    def _files(self, done: Collected) -> str:
        produced = done.produced
        return (f"  files written back: {len(produced)}"
                + (f" ({', '.join(produced[:8])}{', …' if len(produced) > 8 else ''})"
                   if produced else ""))

    def report_compute(self, done: Collected) -> str:
        if done.status != "COMPLETED":
            return self._unrun(done)
        code = done.results.get("exit_code", "?")
        verdict = ("OK" if code == "0" else "TIMEOUT" if code == "timeout"
                   else f"FAILED (exit {code})")
        lines = [f"[{verdict}] bigdft -n {done.name}  (job {done.job_id}), "
                 f"{done.runtime.get('elapsed_s', '?')}s on the HAPS",
                 f"  log: {self.shown(done.target)}/log-{done.name}.yaml   "
                 f"stdout/stderr: {self.shown(done.logs_dir)}/",
                 self._files(done)]
        if verdict != "OK":
            tail = (done.results.get("stderr_tail") or done.results.get("stdout_tail") or "").strip()
            if tail:
                lines += ["  --- end of stderr ---", tail[-1500:]]
        return "\n".join(lines)

    def report_dryrun(self, done: Collected) -> str:
        if done.status != "COMPLETED":
            return self._unrun(done)
        valid = done.results.get("valid") == "true"
        peak = done.results.get("memory_peak_mb") or "?"
        head = (f"memguess {done.name}  (job {done.job_id}), "
                f"{done.runtime.get('elapsed_s', '?')}s on the dry-run HAPS")
        lines = [f"[VALID] {head} — estimated memory peak {peak} MB" if valid
                 else f"[INVALID] {head} — BigDFT refused the input",
                 f"  log: {self.shown(done.target)}/log-{done.name}.yaml",
                 self._files(done)]
        if not valid:
            error = (done.results.get("error") or "").strip()
            stderr = (done.results.get("stderr_tail") or "").strip()
            if error:
                lines += ["  --- BigDFT's error ---", error]
            if stderr and stderr not in error:
                lines += ["  --- end of stderr ---", stderr[-800:]]
        return "\n".join(lines)

    def report(self, service: Service, done: Collected) -> str:
        return self.report_dryrun(done) if service.target == "dryrun" else self.report_compute(done)


# ── the MCP surface ─────────────────────────────────────────────────────────

settings = load()
bridge: Bridge | None = None
server = MCPServer("bigdft-haps")


def _bridge() -> Bridge:
    global bridge
    if bridge is None:
        bridge = Bridge(settings)
    return bridge


def _error(exc: Exception) -> str:
    if isinstance(exc, MessageException):
        return f"[HAPS ERROR] the HAPS service answered: {exc}"
    return f"[ERROR] {exc}"


async def _wait_and_collect(b: Bridge, service: Service, job_ids: list[str],
                            wait_s: float) -> str:
    status = await asyncio.to_thread(b.wait, service, job_ids, wait_s)
    parts, pending = [], []
    for jid in job_ids:
        if status[jid] in TERMINAL:
            done = await asyncio.to_thread(b.collect, service, jid)
            parts.append(b.report(service, done))
        else:
            pending.append(jid)
    if pending:
        parts.append(f"[RUNNING] still running after {wait_s:g}s: "
                     + ", ".join(pending) + " — call haps_result with each id.")
    return "\n".join(parts)


@server.tool()
async def haps_bigdft(names: list[str], directory: str = ".", timeout: int = 600) -> str:
    """Run BigDFT on the HAPS: `bigdft -n NAME` for each prepared NAME.yaml.

    Only for inputs you have PREPARED and DRY-RUN: with PyBigDFT,
    `SystemCalculator(dry_run=True).run(name=NAME, run_dir=DIR, ...)` writes
    DIR/NAME.yaml (geometry included) and checks it on the dry-run HAPS without
    computing. Send each run once its dry run is clean. The HAPS runs BigDFT
    1.9.1 and nothing else: no script, no command line — NAME.yaml (with
    posinp.*, *.xyz, psppar.* if present in DIR) is all that is sent, plus the
    wavefunctions in DIR/data-NAME/ if the run restarts from an earlier one:
    copy data-OTHER/wavefunction-* there and set `inputpsiid: 2`
    (`inp.read_orbitals_from_disk()`). If they are missing BigDFT only warns
    and starts from scratch: look for that warning in the log.

    Several names run as parallel jobs. Each comes back as [OK],
    [FAILED (exit n)] or [TIMEOUT], with the files it wrote copied back into
    DIR — log-NAME.yaml first; read it with parse_bigdft_log. [HAPS …] means
    the service did not run the job: not an error in your input. Runs still
    going when the wait ends are listed with their job id: call haps_result.

    Args:
        names: The run names, as passed to `bigdft -n` (NAME.yaml must exist).
        directory: The directory holding the NAME.yaml files, relative to your
            working directory — PyBigDFT's run_dir, e.g. "HCl/.tmp".
        timeout: Seconds before each run is stopped on the HAPS.
    """
    b = _bridge()
    try:
        service = b.service("compute")
        target = b.directory(directory)
        job_ids = []
        for name in names:
            job_ids.append(await asyncio.to_thread(b.submit, service, name, target,
                                                   [str(int(timeout))]))
        return await _wait_and_collect(b, service, job_ids, float(b.mcp["wait_s"]))
    except (inputs.InputError, ValueError, FileNotFoundError) as exc:
        return f"[ERROR] {exc}"
    except Exception as exc:                                   # the agent reads text
        log.exception("haps_bigdft")
        return _error(exc)


@server.tool()
async def haps_dryrun(names: list[str], directory: str = ".", nproc: int = 1,
                      timeout: int = 60) -> str:
    """Dry-run BigDFT inputs on the dry-run HAPS: check them and estimate their memory.

    You rarely call this yourself: PyBigDFT's `SystemCalculator(dry_run=True)`
    does, through the pack's `bigdft-tool`, and returns the Logfile as usual.

    For each NAME.yaml of DIRECTORY, the dry-run HAPS runs BigDFT's input
    parser and memory estimate (`memguess NPROC NAME dd l`, no SCF) and the
    files it writes come back into DIRECTORY: log-NAME.yaml (the input completed
    by every default, the system, the grid, the memory estimate),
    NAME_minimal.yaml and, when BigDFT refused the input, debug/. Each run
    answers [VALID] with the memory peak, or [INVALID] with BigDFT's error.

    Args:
        names: The run names (NAME.yaml must exist in DIRECTORY).
        directory: The directory holding the NAME.yaml files, relative to your
            working directory — PyBigDFT's run_dir.
        nproc: The number of MPI processes to estimate the memory for.
        timeout: Seconds before each dry run is stopped.
    """
    b = _bridge()
    try:
        service = b.service("dryrun")
        target = b.directory(directory)
        nproc_ = check_nproc(nproc)
        job_ids = []
        for name in names:
            job_ids.append(await asyncio.to_thread(b.submit, service, name, target,
                                                   [str(nproc_), str(int(timeout))]))
        return await _wait_and_collect(b, service, job_ids, float(b.mcp["dryrun_wait_s"]))
    except (inputs.InputError, ValueError, FileNotFoundError, LookupError) as exc:
        return f"[ERROR] {exc}"
    except Exception as exc:
        log.exception("haps_dryrun")
        return _error(exc)


@server.tool()
async def haps_result(job_id: str) -> str:
    """Wait for a run started by haps_bigdft or haps_dryrun, then collect it as they would.

    Args:
        job_id: The id haps_bigdft or haps_dryrun listed as still running.
    """
    b = _bridge()
    try:
        service, _ = await asyncio.to_thread(b.find, job_id)
        wait_s = b.mcp["dryrun_wait_s"] if service.target == "dryrun" else b.mcp["wait_s"]
        return await _wait_and_collect(b, service, [job_id], float(wait_s))
    except Exception as exc:
        log.exception("haps_result")
        return _error(exc)


@server.tool()
async def haps_cancel(job_id: str) -> str:
    """Ask the HAPS to stop a run that is pending or running.

    Args:
        job_id: The id haps_bigdft or haps_dryrun listed as still running.
    """
    b = _bridge()
    try:
        _, job = await asyncio.to_thread(b.find, job_id)
        await asyncio.to_thread(job.cancel)
        return f"cancellation requested for job {job_id}; haps_result tells when it has stopped."
    except Exception as exc:
        log.exception("haps_cancel")
        return _error(exc)


def _describe(service: Service) -> list[str]:
    ms = service.mservice(True)
    state = ms.state.name if ms.state is not None else "?"
    runtimes = ms.runtime_uuid if isinstance(ms.runtime_uuid, list) else [ms.runtime_uuid]
    return [
        f"[{service.target}]",
        f"service      {service.client.ebservice_url}",
        f"buffers      {service.client.ebuffer_url}",
        f"application  {ms.name} ({ms.uuid}), type {ms.mime_type}, state {state}",
        f"runtime      {', '.join(r for r in runtimes if r) or 'none bound yet'}",
        f"signature    arguments {ms.argument_names}, inputs {ms.ebin_names}, "
        f"outputs {ms.ebout_names}, results {ms.result_names}",
    ]


@server.tool()
async def haps_info() -> str:
    """Where your BigDFT runs and dry runs go: the HAPS services, the applications, their state."""
    b = _bridge()
    lines = []
    for service in b.services.values():
        try:
            lines += await asyncio.to_thread(_describe, service)
        except Exception as exc:
            lines += [f"[{service.target}]", f"  {_error(exc)}"]
    lines.append(f"accepts      {inputs.ACCEPTED}")
    lines.append(f"workdir      {b.workdir}")
    return "\n".join(lines)


def main() -> None:
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
    mcp = settings["mcp"]
    log.info("HAPS: %s (compute), %s (dry run); submitting as %s",
             client_kwargs(settings, "compute")["ebservice_url"],
             client_kwargs(settings, "dryrun")["ebservice_url"],
             client_kwargs(settings, "compute")["username"])
    log.info("serving on http://%s:%s/mcp, workdir %s", mcp["host"], mcp["port"], mcp["workdir"])
    server.run("streamable-http", host=mcp["host"], port=int(mcp["port"]))


if __name__ == "__main__":
    main()
