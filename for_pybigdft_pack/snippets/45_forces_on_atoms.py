"""Read the forces on the atoms.

log.forces is a list, one dictionary per atom in the order of the input:
{element: [fx, fy, fz]} in Ha/bohr. log.forcemax is the largest component norm.

task: Read a result
stage: analysis
"""
import numpy as np
from BigDFT.Logfiles import Logfile

log = Logfile("log-h2o.yaml")
norms = []
for atom in log.forces:
    element, force = list(atom.items())[0]
    norms.append(float(np.linalg.norm(force)))
    print("%-2s  %s  |F| = %.5f Ha/bohr" % (element, np.round(force, 5).tolist(), norms[-1]))

assert len(log.forces) == log.nat
assert abs(max(norms) - log.forcemax) < 1.0e-4
print("largest force:", round(log.forcemax, 5), "Ha/bohr")
