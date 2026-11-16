"""Set an input variable that no action covers, by writing its key.

The Inputfile is a dictionary of sections. Any variable of BigDFT can be
written as inp[section][key] = value; create the section first if it is not
there. Actions and direct keys mix freely. A wrong key name is NOT refused by
PyBigDFT: only BigDFT (the dry run) tells.

task: Write an input file
stage: dry-run
"""
from BigDFT.Calculators import SystemCalculator
from BigDFT.Inputfiles import Inputfile

inp = Inputfile()
inp.set_xc("PBE")
inp["dft"]["ncong"] = 8                                   # the section exists: set_xc created it
inp.setdefault("mix", {})["alphamix"] = 0.3               # a section that may not exist yet
inp["perf"] = {"multipole_preserving": True}              # a new section, written whole

log = SystemCalculator(omp="1", dry_run=True, verbose=False).run(
    name="keys", input=inp, posinp="h2o.xyz", run_dir="runs")
assert log.memory_peak is not None, log.log.get("Additional Info")
assert log.log["dft"]["ncong"] == 8                       # BigDFT read it: the log repeats the input
print("ncong read by BigDFT:", log.log["dft"]["ncong"], "| alphamix:", log.log["mix"]["alphamix"])
