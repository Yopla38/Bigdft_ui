"""Give the name of an .xyz file directly as the structure of a calculation.

`posinp=` also accepts a file name. The calculator then refers to that file
instead of writing the positions in NAME.yaml, so the .xyz must travel with the
input: prefer a dictionary (system.get_posinp()) when the input is sent elsewhere.

task: Build a structure
stage: prepare
"""
from BigDFT.Calculators import SystemCalculator
from BigDFT.Inputfiles import Inputfile

code = SystemCalculator(omp="1", dry_run=True, verbose=False)
log = code.run(name="from_file", input=Inputfile(), posinp="h2o.xyz")

assert log.nat == 3
print("structure read from:", log.posinp_file)
