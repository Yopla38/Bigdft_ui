"""Restart a calculation from the wavefunctions of an earlier one.

Three steps. The earlier run must have written its orbitals
(write_orbitals_on_disk): they are in data-EARLIER/, one file per orbital. The
new run reads them from ITS OWN data directory, data-NEW/: copy the
wavefunction-* files there. And its input says read_orbitals_from_disk(), which
writes dft.inputpsiid = 2. Another functional or another grid spacing is fine.

task: Chain calculations
stage: dry-run
"""
import glob
import os
import shutil

from BigDFT.Calculators import SystemCalculator
from BigDFT.Inputfiles import Inputfile


def take_wavefunctions(earlier, new, run_dir="."):
    """Copy the orbitals of the run EARLIER where the run NEW will read them. Returns how many."""
    found = sorted(glob.glob(os.path.join(run_dir, "data-" + earlier, "wavefunction-*")))
    target = os.path.join(run_dir, "data-" + new)
    if found and not os.path.isdir(target):
        os.makedirs(target)
    for path in found:
        shutil.copy2(path, target)
    return len(found)


copied = take_wavefunctions("h2o", "h2o_pbe0")       # h2o is a finished PBE run that wrote its orbitals
assert copied >= 4, "the earlier run did not write its orbitals"

inp = Inputfile()
inp.set_xc("PBE0")
for element in ("H", "O"):
    inp["psppar." + element] = {"Pseudopotential XC": 11}
inp.read_orbitals_from_disk()
assert inp["dft"]["inputpsiid"] == 2

log = SystemCalculator(omp="1", dry_run=True, verbose=False).run(
    name="h2o_pbe0", input=inp, posinp="h2o.xyz")
assert log.memory_peak is not None, log.log.get("Additional Info")
print("copied", copied, "files to data-h2o_pbe0/ ; input ready: h2o_pbe0.yaml")
print("send h2o_pbe0.yaml AND data-h2o_pbe0/ to where it is computed")
