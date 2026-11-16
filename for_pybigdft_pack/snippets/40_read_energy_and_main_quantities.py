"""Read the energy and the main quantities of a finished calculation.

Logfile(path) loads log-NAME.yaml. Its attributes (energy, nat, fermi_level,
dipole, forces, evals, memory_peak, ...) are created from the content of the
log: one that BigDFT did not write is simply ABSENT, so use getattr with a
default. Energies are in hartree; BigDFT.DoS.AU_eV converts to eV.

task: Read a result
stage: analysis
"""
from BigDFT.DoS import AU_eV
from BigDFT.Logfiles import Logfile

log = Logfile("log-h2o.yaml")

print("energy          : %.8f Ha = %.4f eV" % (log.energy, log.energy * AU_eV))
print("atoms, orbitals :", log.nat, log.number_of_orbitals)
print("highest occupied: %.4f Ha" % log.fermi_level)
print("dipole (AU)     :", [round(x, 4) for x in log.dipole])
print("memory peak     :", log.memory_peak, "MB")
print("pressure        :", getattr(log, "pressure", "not in this log"))   # only for periodic systems

assert abs(log.energy + 17.21) < 0.01 and log.nat == 3
assert not hasattr(log, "pressure")
