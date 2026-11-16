"""Ask for a geometry optimisation.

optimize_geometry writes the `geopt` section. Its default method is FIRE with
50 steps and forcemax = 0, which means "stop on the fluctuation of the forces":
give forcemax (Ha/bohr) explicitly. SQNM is the usual choice for molecules.

task: Write an input file
stage: dry-run
"""
from BigDFT.Calculators import SystemCalculator
from BigDFT.Inputfiles import Inputfile

water = {"units": "angstroem", "positions": [
    {"O": [0.0, 0.0, 0.0]}, {"H": [0.757, 0.5859, 0.0]}, {"H": [-0.757, 0.5859, 0.0]}]}

inp = Inputfile()
inp.set_xc("PBE")
inp.optimize_geometry(method="SQNM", nsteps=100, forcemax=1.0e-3)
assert inp["geopt"]["method"] == "SQNM" and inp["geopt"]["ncount_cluster_x"] == 100

log = SystemCalculator(omp="1", dry_run=True, verbose=False).run(
    name="relax", input=inp, posinp=water, run_dir="runs")
assert log.memory_peak is not None, log.log.get("Additional Info")
print(inp["geopt"])
