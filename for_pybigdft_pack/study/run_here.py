#!/usr/bin/env python3
"""Run a study where `bigdft` itself can run, wave after wave. A stand-in for the HAPS.

    python3 run_here.py study.py

The script must define `study`. Each wave: prepare, then `bigdft -n NAME` for
every name that is ready, until nothing is ready any more; then analyse. With
the pack, the middle step is haps_bigdft(names=[...], directory="runs").
"""
from __future__ import print_function

import os
import runpy
import subprocess
import sys
import time


def main(script):
    study = runpy.run_path(script)["study"]
    for wave in range(1, 20):
        state = study.prepare(verbose=False)
        print("wave %d: ready %s | waiting %s | refused %s" % (wave, state["ready"], state["waiting"], dict(state["refused"])))
        sys.stdout.flush()
        if state["refused"] or not state["ready"]:
            break
        for name in state["ready"]:
            start = time.time()
            with open(os.path.join(study.run_dir, "stdout-%s.txt" % name), "w") as out:
                code = subprocess.call(["bigdft", "-n", name], cwd=study.run_dir, stdout=out, stderr=subprocess.STDOUT)
            print("  [%s] bigdft -n %s, %.0fs" % ("OK" if code == 0 else "FAILED (exit %d)" % code, name, time.time() - start))
            sys.stdout.flush()
    study.analyse()
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1]))
