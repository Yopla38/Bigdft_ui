"""A stand-in for runner.py that REPLAYS RECORDED RUNS instead of computing: no BigDFT, no HAPS.

    ONDELETTE_RUNNER=tests/replay_runner.py uv run python serve.py --port … --bridge … --workdir …

For each run asked for, it reads the log of the run of that name in
examples/water-ionisation/runs (a real BigDFT 1.9.1 study, run as the page
writes it) with the reader runner.py itself uses (tools/build_library.read_run),
and answers as runner.py would. What it gives is therefore a real result, but
not one computed now: it exists to check everything AROUND the calculation
(the page, live.js, the API, what the server keeps) where no HAPS is at hand,
with `node tools/check_live.js`. It is never the runner of a server people use.
"""
import json
import os
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent.parent
sys.path[:0] = [str(ROOT / "tools")]
RECORDED = ROOT / "examples" / "water-ionisation" / "runs"

from build_library import read_run  # noqa: E402
from build_logviews import attributes, latest_build  # noqa: E402

job = Path(sys.argv[1])
request = json.loads((job / "request.json").read_text())
status = {"state": "running", "phase": "replaying recorded runs", "message": "",
          "runs": {n: {"state": "checking", "text": "the input is being checked"} for n in request["names"]}}


def write() -> None:
    tmp = job / "status.tmp"
    tmp.write_text(json.dumps(status))
    os.replace(tmp, job / "status.json")


write()
registry = attributes(latest_build())
for name in request["names"]:
    try:
        found = read_run(RECORDED, name, registry)
    except Exception as exc:  # noqa: BLE001
        found, problem = None, f"{type(exc).__name__}: {exc}"
    else:
        problem = "no recorded run of that name"
    if found is None or not isinstance(found.get("energy"), (int, float)):
        status["runs"][name] = {"state": "failed", "text": f"replay: {problem}"}
    else:
        found["name"] = name
        status["runs"][name] = {"state": "done", "result": found}
    write()
status.update(state="done", phase="")
write()
