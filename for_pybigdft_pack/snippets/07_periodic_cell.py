"""Give a periodic cell to a structure: bulk, surface or isolated.

The boundary conditions come from the cell, not from an input variable. In a
`posinp` dictionary the key `cell` holds the three lengths; a free direction
is written `inf` (a surface is periodic along x and z, free along y). No
`cell` key at all means an isolated system.

task: Build a structure
stage: dry-run
"""
from BigDFT.Calculators import SystemCalculator
from BigDFT.Inputfiles import Inputfile
from BigDFT.UnitCells import UnitCell

silicon = {
    "units": "angstroem",
    "cell": [5.43, 5.43, 5.43],                     # periodic in the three directions
    "positions": [{"Si": [0.0, 0.0, 0.0]}, {"Si": [1.3575, 1.3575, 1.3575]}],
}
print(UnitCell([5.43, 5.43, 5.43], units="angstroem").get_boundary_condition().split()[0])
print(UnitCell([5.43, float("inf"), 5.43], units="angstroem").get_boundary_condition().split()[0])

inp = Inputfile()
inp.set_xc("PBE")
assert not hasattr(inp, "set_kpt_mesh")                 # PyBigDFT 0.9 has no action for the k-points
inp["kpt"] = {"method": "mpgrid", "ngkpt": [2, 2, 2]}   # so write the keys

log = SystemCalculator(omp="1", dry_run=True, verbose=False).run(
    name="si", input=inp, posinp=silicon, run_dir="runs")
assert log.memory_peak is not None, log.log.get("Additional Info")
print("k-point mesh read by BigDFT:", log.kpt_mesh)
