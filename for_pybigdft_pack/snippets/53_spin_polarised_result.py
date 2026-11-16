"""Read a spin-polarised result: magnetisation and what was asked.

log.magnetization is the total magnetisation BigDFT found; log.total_magn_moment
and log.spin_polarization repeat the input (dft.mpol, dft.nspin). Compare them
when the spin state matters: a run can converge on another state than expected.

task: Read a result
stage: analysis
"""
from BigDFT.Logfiles import Logfile

log = Logfile("log-oh.yaml")
print("asked : nspin =", log.spin_polarization, ", mpol =", log.total_magn_moment)
print("found : magnetisation =", log.magnetization)
print("energy: %.6f Ha" % log.energy)

assert log.spin_polarization == 2 and abs(log.magnetization - log.total_magn_moment) < 1.0e-6
assert not hasattr(Logfile("log-h2o.yaml"), "magnetization")     # absent without spin polarisation
