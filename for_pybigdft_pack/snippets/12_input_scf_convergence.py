"""Tighten the self-consistency criterion and allow more iterations.

set_scf_convergence(gnrm=...) writes dft.gnrm_cv (default 1e-4). Called WITHOUT
a value it writes the string "default", not a number. The iteration limits are
dft.itermax (50 per cycle) and dft.nrepmax (1 restart): a spin-polarised or
difficult system often needs more than 50.

task: Write an input file
stage: prepare
"""
from BigDFT.Inputfiles import Inputfile

inp = Inputfile()
inp.set_scf_convergence(gnrm=1.0e-5)
inp["dft"].update(itermax=200, nrepmax=5)     # no action takes these two as plain numbers

assert inp["dft"] == {"gnrm_cv": 1.0e-5, "itermax": 200, "nrepmax": 5}
print(dict(inp))
