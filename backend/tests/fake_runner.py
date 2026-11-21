"""A stand-in for runner.py, FOR THE TESTS ONLY: no BigDFT, no HAPS, invented numbers.

It reads JOB_DIR/request.json and writes JOB_DIR/status.json the way runner.py
does, so that what stands around the runner (app/compute.py, the API) can be
tested without a HAPS. A run whose name starts with "slow" waits to be stopped;
one that starts with "bad" is refused as a dry run would refuse it.
"""
import json
import os
import signal
import sys
import time
from pathlib import Path

job = Path(sys.argv[1])
request = json.loads((job / "request.json").read_text())
status = {"state": "running", "phase": "testing", "message": "",
          "runs": {n: {"state": "checking", "text": "the input is being checked"} for n in request["names"]}}
stopped = []


def write() -> None:
    tmp = job / "status.tmp"
    tmp.write_text(json.dumps(status))
    os.replace(tmp, job / "status.json")


signal.signal(signal.SIGTERM, lambda *_: stopped.append(True))
write()
Path("runs").mkdir(exist_ok=True)
for name in request["names"]:
    if name.startswith("bad"):
        status["runs"][name] = {"state": "refused", "text": "refused by the test runner"}
    elif name.startswith("slow"):
        status["runs"][name] = {"state": "running", "text": "computing (test)"}
        write()
        for _ in range(600):
            if stopped:
                break
            time.sleep(0.05)
        status["runs"][name] = {"state": "stopped", "text": "stopped"} if stopped else \
            {"state": "done", "result": {"name": name, "energy": -1.0, "wall": 30.0}}
    else:
        Path("runs", f"log-{name}.yaml").write_text("Energy (Hartree): -17.0\n")
        status["runs"][name] = {"state": "done", "result": {"name": name, "energy": -17.0 - len(name) / 1000, "wall": 0.1, "test": True}}
    write()
status.update(state="done", phase="")
write()
