"""Never dry-run under the name of a calculation that is already done.

A dry run writes log-NAME.yaml, like a real run. Under the same name and in the
same directory it REPLACES the log of the finished calculation, and the energy
is gone. `skip=True` does not protect: with dry_run=True the estimate runs
anyway. Test for a finished calculation yourself before preparing it again.

task: Check an input before computing
stage: dry-run
"""
import os

from BigDFT.Calculators import SystemCalculator
from BigDFT.Inputfiles import Inputfile
from BigDFT.Logfiles import Logfile


def is_computed(name, run_dir="."):
    """True if log-NAME.yaml holds a finished calculation, not a dry run or a refusal."""
    path = os.path.join(run_dir, "log-%s.yaml" % name)
    if not os.path.isfile(path):
        return False
    try:
        log = Logfile(path)
        last = log if len(log) == 0 else log[len(log) - 1]
        return getattr(last, "energy", None) is not None
    except Exception:
        return False


assert is_computed("h2o")                        # the finished run of the fixtures
print("before: energy", Logfile("log-h2o.yaml").energy)

code = SystemCalculator(omp="1", dry_run=True, skip=True, verbose=False)
code.run(name="h2o", input=Inputfile(), posinp="h2o.xyz")     # same name, same directory

assert not is_computed("h2o")                    # the result has been overwritten
print("after : log-h2o.yaml is now a dry-run log, without energy")
