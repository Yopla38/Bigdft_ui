"""Start a calculation from the geometry a relaxation ended on.

BigDFT writes the final geometry in final_NAME.yaml (same directory as the
log), with the forces on each atom. Keep the element and its position, drop
the rest, and the result is a `posinp` dictionary for the next run.

task: Chain calculations
stage: dry-run
"""
import yaml
from BigDFT.Calculators import SystemCalculator
from BigDFT.Inputfiles import Inputfile


def relaxed(name, run_dir="."):
    """The geometry BigDFT wrote at the end of the relaxation NAME, as a posinp dictionary."""
    with open("%s/final_%s.yaml" % (run_dir, name)) as f:
        final = yaml.safe_load(f)
    positions = [{element: xyz for element, xyz in atom.items() if element != "force"}
                 for atom in final["positions"]]
    return {"units": final.get("units", "angstroem"), "positions": positions}


posinp = relaxed("h2o_relax")
assert [list(atom)[0] for atom in posinp["positions"]] == ["O", "H", "H"]

inp = Inputfile()
inp.set_xc("PBE")
log = SystemCalculator(omp="1", dry_run=True, verbose=False).run(
    name="after_relax", input=inp, posinp=posinp, run_dir="runs")
assert log.memory_peak is not None, log.log.get("Additional Info")
print("O-H distance after relaxation: %.4f angstroem"
      % sum((a - b) ** 2 for a, b in zip(posinp["positions"][0]["O"], posinp["positions"][1]["H"])) ** 0.5)
