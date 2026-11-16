"""Compute in implicit solvent (soft-sphere cavity).

set_implicit_solvent() switches the cavity on with the parameters of water. It
takes no solvent name in PyBigDFT 0.9: another solvent is set by writing the
keys of psolver.environment (epsilon, and the cavity parameters).

task: Write an input file
stage: dry-run
"""
from BigDFT.Calculators import SystemCalculator
from BigDFT.Inputfiles import Inputfile

inp = Inputfile()
inp.set_xc("PBE")
inp.set_implicit_solvent()
try:
    Inputfile().set_implicit_solvent(solvent="ethanol")
    raise AssertionError("this version accepts a solvent name: revise this snippet")
except TypeError as error:
    print("no solvent name:", error)
assert inp["psolver"]["environment"]["cavity"] == "soft-sphere"

inp["psolver"]["environment"]["epsilon"] = 24.852          # ethanol instead of water (78.36)

log = SystemCalculator(omp="1", dry_run=True, verbose=False).run(
    name="solvated", input=inp, posinp="h2o.xyz", run_dir="runs")
assert log.memory_peak is not None, log.log.get("Additional Info")
print("cavity:", log.log["psolver"]["environment"]["cavity"],
      "| epsilon:", log.log["psolver"]["environment"]["epsilon"])
