"""Run a calculation directly, where the bigdft executable is available.

Without dry_run the calculator launches BigDFT and returns the log of the
finished run. In the pack's container bigdft is disabled: there, prepare with a
dry run and send the name to the HAPS instead. `omp` is the number of OpenMP
threads (a string); `mpi_run` is the launcher prefix, e.g. "mpirun -np 2".

task: Send runs to the HAPS
stage: compute
"""
from BigDFT.Calculators import SystemCalculator
from BigDFT.Inputfiles import Inputfile

inp = Inputfile()
inp.set_xc("PBE")
inp.set_hgrid(0.5)

code = SystemCalculator(omp="2", verbose=False)
log = code.run(name="direct", input=inp, posinp="h2o.xyz", run_dir="runs")

assert abs(log.energy + 17.2) < 0.05
print("energy: %.6f Ha" % log.energy)
