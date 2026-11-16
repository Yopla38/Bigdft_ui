"""Dry-run an input and decide, correctly, whether BigDFT accepted it.

A dry run (SystemCalculator(dry_run=True)) makes BigDFT read the input and
build the grid, without any SCF step. It writes NAME.yaml, the file a real run
reads. PyBigDFT returns a Logfile and raises nothing, WHATEVER BigDFT said.
Three outcomes, all read in log.log:
  - refused: the key "Additional Info" is at the top of the log, with the reason;
  - accepted with errors: "List of error found while parsing input variables"
    is there. BigDFT went on although a value is out of range or not allowed;
  - accepted: neither key. Warnings, if any, are under "WARNINGS".
The memory estimate (log.memory_peak) is only printed for the cubic algorithm:
do not use it as the test.

task: Check an input before computing
stage: dry-run
"""
from BigDFT.Calculators import SystemCalculator
from BigDFT.Inputfiles import Inputfile


def dry_run(name, inp, posinp, run_dir="runs"):
    """Return (status, details). status is "accepted", "errors" or "refused"."""
    code = SystemCalculator(omp="1", dry_run=True, verbose=False)
    doc = code.run(name=name, input=inp, posinp=posinp, run_dir=run_dir).log
    if "Additional Info" in doc:
        return "refused", [doc["Additional Info"]]
    errors = doc.get("List of error found while parsing input variables")
    if errors:
        return "errors", [e["Additional Info"] for e in errors]
    return "accepted", [str(w) for w in (doc.get("WARNINGS") or [])]


good = Inputfile()
good.set_xc("PBE")
assert dry_run("good", good, "h2o.xyz") == ("accepted", [])
print("good        : accepted")

odd = Inputfile()
odd.charge(1)                               # 7 electrons and no spin polarisation
status, details = dry_run("odd", odd, "h2o.xyz")
assert status == "accepted" and details     # accepted, but BigDFT warns
print("odd         : accepted, warnings:", details)

hybrid = Inputfile()
hybrid.set_xc("PBE0")                       # no pseudopotential registered for a hybrid
status, details = dry_run("hybrid", hybrid, "h2o.xyz")
assert status == "refused"
print("hybrid      : refused,", details[0])

typo = Inputfile({"dft": {"hgrid": 0.4}})   # the key is hgrids
status, details = dry_run("typo", typo, "h2o.xyz")
assert status == "refused"
print("typo        : refused,", details[0])

coarse = Inputfile()
coarse.set_hgrid(9.0)                       # out of range: BigDFT says so and goes on
status, details = dry_run("coarse", coarse, "h2o.xyz")
assert status == "errors"
print("out of range: accepted WITH ERRORS,", details[0])
