"""Describe a molecule as a dictionary of positions and pass it to a calculation.

The simplest structure PyBigDFT accepts: a dictionary with `units` and a list of
one-key dictionaries, element -> [x, y, z]. It goes as `posinp=` to the
calculator, which writes it inside NAME.yaml under the key `posinp`.

task: Build a structure
stage: prepare
"""
from BigDFT.Calculators import SystemCalculator
from BigDFT.Inputfiles import Inputfile

water = {
    "units": "angstroem",          # or "bohr" (also spelled "atomic")
    "positions": [
        {"O": [0.0, 0.0, 0.0]},
        {"H": [0.757, 0.5859, 0.0]},
        {"H": [-0.757, 0.5859, 0.0]},
    ],
}

code = SystemCalculator(omp="1", dry_run=True, verbose=False)   # dry run: no SCF
log = code.run(name="water", input=Inputfile(), posinp=water, run_dir="runs")

assert log.nat == 3
print("atoms:", log.nat, "| orbitals:", log.number_of_orbitals)
