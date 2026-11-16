"""After a restart from wavefunctions, check that BigDFT really read them.

If the wavefunction files are not where BigDFT looks (data-NAME/), it does not
stop: it warns "Missing wavefunction files, switch to normal input guess" and
starts from scratch. The run succeeds, with the same energy and more iterations.
Only the warning tells.

task: Chain calculations
stage: analysis
"""
from BigDFT.Logfiles import Logfile, find_iterations


def restart_used(path):
    log = Logfile(path)
    warnings = [str(w) for w in (log.log.get("WARNINGS") or [])]
    return not any("Missing wavefunction files" in w for w in warnings)


def iterations(path):
    return int(sum(len(row) for row in find_iterations(Logfile(path).log)))


assert restart_used("log-pbe0_restart.yaml")
assert not restart_used("log-pbe0_cold.yaml")
print("pbe0_restart: wavefunctions read,", iterations("log-pbe0_restart.yaml"), "iterations")
print("pbe0_cold   : files missing, started from scratch,", iterations("log-pbe0_cold.yaml"), "iterations")
assert iterations("log-pbe0_restart.yaml") < iterations("log-pbe0_cold.yaml")
