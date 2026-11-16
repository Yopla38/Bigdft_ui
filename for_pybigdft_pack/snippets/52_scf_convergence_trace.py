"""Plot how the SCF converged: the wavefunction residue at each iteration.

find_iterations(log.log) returns an array with one row per SCF cycle; each row
holds the residue (gnrm) at every iteration of that cycle.

task: Read a result
stage: analysis
"""
import matplotlib

matplotlib.use("Agg")
import matplotlib.pyplot as plt
from BigDFT.Logfiles import Logfile, find_iterations

log = Logfile("log-h2o.yaml")
residues = [float(x) for row in find_iterations(log.log) for x in row]

fig, ax = plt.subplots()
ax.semilogy(range(1, len(residues) + 1), residues, marker="o")
ax.axhline(log.gnrm_cv, linestyle="--")                   # the criterion asked
ax.set_xlabel("iteration")
ax.set_ylabel("wavefunction residue")
fig.savefig("scf.png", dpi=150)

assert residues[0] > residues[-1] and residues[-1] <= log.gnrm_cv
print(len(residues), "iterations, from %.1e to %.1e (criterion %.0e)" % (residues[0], residues[-1], log.gnrm_cv))
