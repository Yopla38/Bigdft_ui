"""Use a hybrid functional (PBE0, B3LYP, HF): name the pseudopotentials explicitly.

BigDFT has no pseudopotential registered for a hybrid functional. With
set_xc("PBE0") alone it refuses the input: 'The pseudopotential parameter file
"psppar.O" is lacking, and no registered pseudo found for "O"'. Tell it to use
the PBE ones (XC code 11), for every element of the structure. BigDFT then
warns that the pseudopotential was generated with another functional.

task: Write an input file
stage: dry-run
"""
from BigDFT.Calculators import SystemCalculator
from BigDFT.Inputfiles import Inputfile

water = {"units": "angstroem", "positions": [
    {"O": [0.0, 0.0, 0.0]}, {"H": [0.757, 0.5859, 0.0]}, {"H": [-0.757, 0.5859, 0.0]}]}
elements = sorted({element for atom in water["positions"] for element in atom})
code = SystemCalculator(omp="1", dry_run=True, verbose=False)

inp = Inputfile()
inp.set_xc("PBE0")
refused = code.run(name="pbe0_refused", input=inp, posinp=water, run_dir="runs")
assert "Additional Info" in refused.log                     # BigDFT refused it: this key holds the reason
print("without pseudopotentials:", refused.log["Additional Info"])

for element in elements:
    inp["psppar." + element] = {"Pseudopotential XC": 11}   # 11 = PBE
accepted = code.run(name="pbe0", input=inp, posinp=water, run_dir="runs")
assert "Additional Info" not in accepted.log
print("with the PBE pseudopotentials: dry run passed, memory peak", accepted.memory_peak, "MB")
