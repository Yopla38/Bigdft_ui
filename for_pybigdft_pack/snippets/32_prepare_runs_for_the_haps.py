"""Prepare several runs for the HAPS: one NAME.yaml each, dry-run, names it accepts.

The HAPS runs `bigdft -n NAME` on NAME.yaml and nothing else. So: write every
input with a dry run in one directory, keep the names that passed, and hand
them to haps_bigdft(names=[...], directory="runs"). A run name may only hold
letters, digits, '_' and '-' (no dot, no colon). Keep it to 30 characters: the
HAPS accepts 64, but the dry run of BigDFT truncates the name of the log at 30
and PyBigDFT then finds no log and returns None.

task: Send runs to the HAPS
stage: dry-run
"""
import re

from BigDFT.Calculators import SystemCalculator
from BigDFT.Inputfiles import Inputfile

NAME = re.compile(r"^[A-Za-z0-9][A-Za-z0-9_-]{0,29}$")
code = SystemCalculator(omp="1", dry_run=True, verbose=False)
ready, refused = [], {}

for hgrid in (0.50, 0.45, 0.40):
    name = "water_h%03d" % round(hgrid * 100)        # water_h050: not "h=0.5", not "h:0.5"
    assert NAME.match(name), name
    inp = Inputfile()
    inp.set_xc("PBE")
    inp.set_hgrid(hgrid)
    log = code.run(name=name, input=inp, posinp="h2o.xyz", run_dir="runs")
    problems = log.log.get("Additional Info") or log.log.get("List of error found while parsing input variables")
    if problems:
        refused[name] = problems                     # refused, or accepted with an input error: do not send
    else:
        ready.append(name)

assert ready == ["water_h050", "water_h045", "water_h040"] and not refused

too_long = "water_grid_convergence_study_h0" + "5"            # 32 characters
assert code.run(name=too_long, input=Inputfile(), posinp="h2o.xyz", run_dir="runs") is None
print("a name of %d characters: the dry run returns None, its log was written under a truncated name" % len(too_long))
print("ready for the HAPS:", ready)
print('next: haps_bigdft(names=%r, directory="runs")' % ready)
