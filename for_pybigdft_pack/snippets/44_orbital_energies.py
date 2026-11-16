"""Read the orbital energies: highest occupied level, and both spins of a polarised system.

log.evals is a list with one BandArray per k-point. A BandArray is a numpy
array of shape (number of spins, number of orbitals), in hartree. With spin
polarisation the two rows may hold different numbers of orbitals: the shorter
one is padded with nan. A log only holds occupied orbitals unless virtual
states were asked for (extract_virtual_states).

task: Read a result
stage: analysis
"""
import numpy as np
from BigDFT.DoS import AU_eV
from BigDFT.Logfiles import Logfile

closed = Logfile("log-h2o.yaml").evals[0]            # first (only) k-point
assert closed.shape == (1, 4)
print("water, occupied levels (eV):", np.round(closed[0] * AU_eV, 3).tolist())
print("water, highest occupied    : %.3f eV" % (closed[0].max() * AU_eV))

radical = Logfile("log-oh.yaml").evals[0]            # OH: 4 up, 3 down
up, down = radical[0], radical[1][~np.isnan(radical[1])]
assert radical.shape == (2, 4) and len(up) == 4 and len(down) == 3
print("OH, highest occupied up    : %.3f eV" % (up.max() * AU_eV))
print("OH, highest occupied down  : %.3f eV" % (down.max() * AU_eV))
