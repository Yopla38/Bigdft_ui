"""One wave of a study, for real: prepare here, compute on the HAPS, read the logs.

    python runner.py JOB_DIR        # started by serve.py, in the directory of the study

JOB_DIR/request.json holds what the page sent: the study as DATA (the calls of
the registry of steps, never code), and the names of the runs it wants now.
JOB_DIR/status.json is rewritten as the wave advances; serve.py hands it to the
page.

The study is rebuilt with the registry of steps (for_pybigdft_pack/study), so a
run is prepared, named and dry-run exactly as the script of the page would. The
dry run goes to the dry-run HAPS through PyBigDFT and the stand-in
`bigdft-tool`; the calculation through `haps_bigdft`. Both pass by the MCP
bridge, which shares this working directory.

The directory of a study is kept from one wave to the next: a run computed
stays computed. What makes that safe is `forget_stale`: a result is kept only
while the input, the geometry and the wavefunctions it was computed from are
the ones the study asks for now.
"""
from __future__ import annotations

import asyncio
import glob
import hashlib
import inspect
import json
import os
import re
import shutil
import signal
import sys
import threading
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path[:0] = [str(ROOT / "for_pybigdft_pack" / "study"), str(ROOT / "tools"), str(Path(__file__).resolve().parent)]

import haps  # noqa: E402

RUN_DIR = "runs"
SIGNATURES = ".signatures.json"
NAME = re.compile(r"^[A-Za-z0-9][A-Za-z0-9_-]{0,29}$")
MISSED = "Missing wavefunction files"
PATCH = "docs/patches/haps-wavefunctions.patch"


class Status:
    """JOB_DIR/status.json: the state of each run asked for, rewritten whole at each change."""

    def __init__(self, path: Path, names: list[str]) -> None:
        self.path, self.lock = path, threading.Lock()
        self.data = {"state": "running", "phase": "reading the study", "message": "",
                     "runs": {n: {"state": "checking", "text": "the input is being checked"} for n in names}}
        self.write()

    def write(self) -> None:
        tmp = self.path.with_suffix(".tmp")
        tmp.write_text(json.dumps(self.data))
        os.replace(tmp, self.path)

    def run(self, name: str, **fields) -> None:
        with self.lock:                                        # dry runs here, results from the loop that follows the HAPS
            self.data["runs"][name] = fields
            self.write()

    def phase(self, text: str) -> None:
        with self.lock:
            self.data["phase"] = text
            self.write()

    def end(self, state: str = "done", message: str = "") -> None:
        with self.lock:
            self.data.update(state=state, message=message, phase="")
            self.write()


# ── the study, from data ─────────────────────────────────────────────────────
def build(plan: dict):
    """The Study the plan describes: each step a call of the registry, by name.

    A value {"$step": NAME} is the handle of an earlier step, {"$tuple": [...]}
    a tuple. Nothing else is interpreted: the plan is data.
    """
    import StudyActions
    from Studies import Study

    steps = {n for n, f in inspect.getmembers(StudyActions, inspect.isfunction)
             if not n.startswith("_") and f.__module__ == StudyActions.__name__}
    study = Study(plan["structure"], name=str(plan["name"]), run_dir=RUN_DIR)
    handles: dict = {}

    def value(x):
        if isinstance(x, dict) and set(x) == {"$step"}:
            return handles[x["$step"]]
        if isinstance(x, dict) and set(x) == {"$tuple"}:
            return tuple(value(v) for v in x["$tuple"])
        if isinstance(x, dict):
            return {str(k): value(v) for k, v in x.items()}
        if isinstance(x, list):
            return [value(v) for v in x]
        return x

    for call in plan["steps"]:
        if call["fn"] not in steps:
            raise ValueError(f"{call['fn']!r} is not a step of the registry")
        handles[call["name"]] = getattr(study, call["fn"])(
            call["name"], *[value(a) for a in call.get("args", [])],
            **{str(k): value(v) for k, v in (call.get("kwargs") or {}).items()})
    return study


# ── what is on disk, and whether it still answers the study ──────────────────
def signatures(study) -> dict[str, str]:
    """For each run, a digest of what it is computed from: its input, and the runs it starts from.

    Writing its wavefunctions does not make a run another run (the engine and
    the page say the same), so `output.orbitals` is left out.
    """
    out: dict[str, str] = {}
    for run in study.runs():
        if run["alias"]:
            continue
        asked = json.loads(json.dumps(dict(run["input"]), default=str))
        asked.get("output", {}).pop("orbitals", None)
        if asked.get("output") == {}:
            del asked["output"]
        start = out.get(run["geometry_from"]) if run["geometry_from"] else study.structure_of(study.steps[run["step"]])
        body = [asked, start, out.get(run["wavefunctions_from"]), bool(run["undecided"])]
        out[run["name"]] = hashlib.sha256(json.dumps(body, sort_keys=True, default=str).encode()).hexdigest()
    return out


def forget(study, name: str) -> None:
    """Remove what a run left: its log, its final geometry, its wavefunctions."""
    for pattern in (f"log-{name}.yaml", f"final_{name}.yaml", f"time-{name}.yaml", f"forces_{name}.yaml"):
        for path in glob.glob(study._path(pattern)):
            os.remove(path)
    shutil.rmtree(study._path(f"data-{name}"), ignore_errors=True)


def forget_stale(study) -> dict[str, str]:
    """Drop every result that was computed from something the study no longer asks for.

    A decision reads the series before it, so dropping a run can change the
    input of later ones: repeat until nothing more is dropped.
    """
    path = Path(study._path(SIGNATURES))
    known = json.loads(path.read_text()) if path.is_file() else {}
    for _ in range(8):
        now = signatures(study)
        stale = [n for n in now if study._log(n) is not None and known.get(n) != now[n]]
        if not stale:
            break
        for name in stale:
            forget(study, name)
            known.pop(name, None)
    return known


def has_wavefunctions(study, name: str) -> bool:
    return bool(glob.glob(study._path(os.path.join(f"data-{name}", "wavefunction*"))))


def result(study, name: str, registry: list[dict]) -> dict | None:
    """What the page shows of a finished run: the same reading as the recorded library."""
    from build_library import read_run
    try:
        out = read_run(Path(study.run_dir), name, registry)
    except Exception as exc:                                  # a log BigDFT did not finish
        print(f"could not read log-{name}.yaml: {type(exc).__name__}: {exc}", file=sys.stderr)
        return None
    if out is None or not isinstance(out.get("energy"), (int, float)):
        return None
    out["name"] = name
    return out


# ── the wave ─────────────────────────────────────────────────────────────────
class Sender:
    """The runs on their way to the HAPS, followed on a loop of their own.

    A dry run blocks (PyBigDFT waits for `bigdft-tool`), and they go one after
    the other. A run whose dry run passed should not wait for the others': it
    is sent at once, and followed here while the next input is being checked.
    """

    def __init__(self, study, request: dict, count: int, on_done, on_job) -> None:
        self.url, self.timeout = request["bridge"], int(request["timeout"])
        self.directory = Path(study.run_dir).resolve().relative_to(Path(request["workdir"]).resolve()).as_posix()
        self.patience = (self.timeout + 120) * max(1, count)        # the runtime runs a few at a time: the others queue
        self.on_done, self.on_job = on_done, on_job
        self.loop = asyncio.new_event_loop()
        self.tasks: set = set()
        self.futures: list = []
        self.stopped = False
        threading.Thread(target=self.loop.run_forever, daemon=True).start()

    async def _one(self, name: str) -> None:
        task = asyncio.current_task()
        self.tasks.add(task)
        try:
            out = await haps.compute(self.url, name, self.directory, self.timeout, patience=self.patience,
                                     on_job=lambda job: self.on_job(name, job))
        finally:
            self.tasks.discard(task)
        self.on_done(name, out)

    def send(self, name: str) -> None:
        self.futures.append(asyncio.run_coroutine_threadsafe(self._one(name), self.loop))

    def wait(self) -> None:
        for future in self.futures:
            try:
                future.result()
            except Exception:
                import traceback
                traceback.print_exc()
        self.futures = []

    def stop(self) -> None:
        """Stop following: each run asks the HAPS to stop its job, and says so."""
        self.stopped = True
        self.loop.call_soon_threadsafe(lambda: [t.cancel() for t in list(self.tasks)])


def wave(study, wanted: dict[str, str], request: dict, status: Status, registry: list[dict]) -> bool:
    """Prepare and compute the runs of *wanted* (requested name → the engine's name for that run).

    True when it was asked to stop before the end."""
    bridge = request["haps"]
    known = forget_stale(study)
    runs = {r["name"]: r for r in study.runs() if not r["alias"]}
    now = signatures(study)
    asked = {name: [n for n, c in wanted.items() if c == name] for name in set(wanted.values())}
    problems: dict[str, str] = {}                              # why a run that was not asked for could not be computed

    def say(name: str, **fields) -> None:
        if name not in asked and fields["state"] in ("failed", "refused"):
            problems[name] = fields["text"]
        for requested in asked.get(name, []):
            status.run(requested, **fields)

    def on_done(name: str, out: dict) -> None:
        if out["state"] != "done":                             # failed, or stopped by whoever asked for the wave
            say(name, state=out["state"], text=out["text"], job=out.get("job"))
            return
        found = result(study, name, registry)
        if found is None:
            say(name, state="failed", text=f"BigDFT ended without an energy: see {study.run_dir}/log-{name}.yaml", job=out.get("job"))
            return
        if runs[name]["wavefunctions_from"] and any(MISSED in w for w in found.get("warnings") or []):
            say(name, state="failed", job=out.get("job"), text="BigDFT did not find the wavefunctions and started from scratch: "
                f"the HAPS did not receive them. Is {PATCH} applied on the runtime too?")
            forget(study, name)
            return
        found["haps_seconds"] = out.get("seconds")
        say(name, state="done", result=found, job=out.get("job"))

    sender = Sender(study, request, len(asked), on_done,
                    lambda name, job: say(name, state="running", text="computing on the HAPS", job=job))
    signal.signal(signal.SIGTERM, lambda *_: sender.stop())

    # Wavefunctions travel only through a HAPS that takes them. Sent to one that does not, the run
    # would start from scratch and say so in a warning nobody reads: refuse it here instead.
    for name in [n for n in asked if runs[n]["wavefunctions_from"] and not bridge.get("wavefunctions")]:
        say(name, state="failed", text="this HAPS does not take wavefunctions: the run would start from scratch "
            f"without saying so. Apply {PATCH} to the HAPS (bridge and runtime), or start this step from nothing")
        del asked[name]

    def go(names: set[str], note: str = "") -> None:
        """Dry-run each run in turn; send it as soon as BigDFT accepts its input; wait for all of them."""
        for name in [n for n in runs if n in names]:
            if sender.stopped:
                say(name, state="stopped", text="stopped before it was sent")
                continue
            status.phase(f"BigDFT checks the input of {name} (dry run)" + note)
            state = study.prepare(verbose=False, only={name})
            if sender.stopped and name in state["ready"]:       # asked to stop while its input was being checked
                say(name, state="stopped", text="stopped before it was sent")
                continue
            if name in state["computed"]:
                found = result(study, name, registry)
                say(name, **({"state": "done", "result": found} if found else
                             {"state": "failed", "text": f"log-{name}.yaml holds no energy"}))
            elif name in state["waiting"]:
                origin = runs[name]["wavefunctions_from"]
                say(name, state="waiting", text=f"{origin} could not be computed again: {problems[origin]}" if origin in problems
                    else "waits for an earlier run or a decision")
            elif name in state["refused"]:
                problem = state["refused"][name]
                say(name, state="refused", text=re.sub(r"\s+", " ", problem if isinstance(problem, str) else json.dumps(problem, default=str))[:800])
            else:
                known[name] = now[name]
                Path(study._path(SIGNATURES)).write_text(json.dumps(known, indent=1))
                say(name, state="sent", text="sent to the HAPS")
                sender.send(name)
        status.phase("computing on the HAPS" + note)
        sender.wait()

    # A run that is read by another must have written its wavefunctions. If it was computed
    # before anything read it, it did not: compute it again, the same calculation, writing them.
    again = {runs[n]["wavefunctions_from"] for n in asked
             if runs[n]["wavefunctions_from"] and study._log(runs[n]["wavefunctions_from"]) is not None
             and not has_wavefunctions(study, runs[n]["wavefunctions_from"])}
    if again:
        for name in again:
            forget(study, name)
        go(again, f": {', '.join(sorted(again))} again, to write the wavefunctions that are read")
    if set(asked) - again:
        go(set(asked) - again)
    return sender.stopped


def main(job_dir: Path) -> int:
    request = json.loads((job_dir / "request.json").read_text())
    names = [n for n in request["names"] if NAME.match(str(n))]
    status = Status(job_dir / "status.json", names)
    try:
        from build_logviews import attributes, latest_build
        study = build(request["plan"])
        own = {r["own_name"]: r["name"] for r in study.runs()}
        for name in names:
            if name not in own:
                status.run(name, state="failed", text="the engine has no run of that name: the page and the registry disagree")
        stopped = wave(study, {n: own[n] for n in names if n in own}, request, status, attributes(latest_build()))
        for name, run in status.data["runs"].items():          # nothing may stay "being checked" once the wave has ended
            if run["state"] in ("checking", "sent", "running"):
                status.run(name, state="stopped" if stopped else "failed", text="the wave ended before this run did")
        status.end()
        return 0
    except Exception as exc:
        import traceback
        traceback.print_exc()
        status.end("error", f"{type(exc).__name__}: {exc}")
        return 1


if __name__ == "__main__":
    sys.exit(main(Path(sys.argv[1])))
