"""Compare two finished runs: an energy difference, converted, with missing runs handled.

Read each log once into a dictionary NAME -> energy, skipping what is not
finished, then apply the formula. Total energies are in hartree:
1 Ha = 27.2114 eV = 2625.50 kJ/mol = 627.51 kcal/mol.

task: Read a result
stage: analysis
"""
import os

from BigDFT.DoS import AU_eV
from BigDFT.Logfiles import Logfile

HA_KJ_MOL = 2625.4996394799


def energy(name, run_dir="."):
    """Final energy of a run, or None if it is not there or did not finish."""
    path = os.path.join(run_dir, "log-%s.yaml" % name)
    if not os.path.isfile(path):
        return None
    try:
        log = Logfile(path)
        return getattr(log if len(log) == 0 else log[len(log) - 1], "energy", None)
    except Exception:
        return None


E = {name: energy(name) for name in ("h2o", "h2o_relax", "not_computed", "refused")}
assert E["not_computed"] is None and E["refused"] is None        # absent, and refused by BigDFT
done = {name: e for name, e in E.items() if e is not None}

gain = done["h2o"] - done["h2o_relax"]
print("relaxation energy: %.5f Ha = %.4f eV = %.2f kJ/mol" % (gain, gain * AU_eV, gain * HA_KJ_MOL))
assert 0 < gain < 0.01
