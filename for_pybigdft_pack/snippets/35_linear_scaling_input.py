"""Switch to the linear-scaling algorithm, for systems of hundreds of atoms and more.

set_linear_scaling() writes dft.inputpsiid = "linear". A dry run of such an
input is accepted but prints NO memory estimate: log.memory_peak is absent. So
"no memory estimate" does not mean "refused"; look for "Additional Info".

task: Write an input file
stage: dry-run
"""
from BigDFT.Calculators import SystemCalculator
from BigDFT.Inputfiles import Inputfile

inp = Inputfile()
inp.set_xc("PBE")
inp.set_linear_scaling()
assert inp["dft"]["inputpsiid"] == "linear"

log = SystemCalculator(omp="1", dry_run=True, verbose=False).run(
    name="linear", input=inp, posinp="h2o.xyz", run_dir="runs")
assert "Additional Info" not in log.log                 # accepted
assert getattr(log, "memory_peak", None) is None        # and yet no estimate
print("accepted; memory estimate:", getattr(log, "memory_peak", "not printed in linear scaling"))
