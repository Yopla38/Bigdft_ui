"""Read a geometry optimisation: take the LAST step, not the attributes of the log.

The log of a relaxation holds one document per force evaluation: len(log) is
their number (0 for a single point) and log[i] is step i. The attributes of the
log itself (log.energy, log.forcemax) are those of the step of LOWEST ENERGY
(log.reference_log), which is not necessarily the last one nor the one whose
geometry BigDFT wrote in final_NAME.yaml.

task: Read a result
stage: analysis
"""
from BigDFT.Logfiles import Logfile

log = Logfile("log-h2o_relax.yaml")
steps = [log[i] for i in range(len(log))]
last = steps[-1]

print("force evaluations      :", len(steps))
print("energy of the last step: %.8f Ha, largest force %.2e Ha/bohr" % (last.energy, last.forcemax))
print("log.energy             : %.8f Ha, which is step %d" % (log.energy, log.reference_log))
print("energy gained          : %.2f mHa" % ((steps[0].energy - last.energy) * 1000))

assert len(log) > 1
assert log.energy == min(s.energy for s in steps)          # the lowest, not the last
assert last.forcemax <= 1.0e-3                              # the criterion asked in the input


def final_energy(path):
    """Energy of a run, single point or relaxation alike."""
    log = Logfile(path)
    return (log if len(log) == 0 else log[len(log) - 1]).energy


assert final_energy("log-h2o_relax.yaml") == last.energy
assert final_energy("log-h2o.yaml") == Logfile("log-h2o.yaml").energy
