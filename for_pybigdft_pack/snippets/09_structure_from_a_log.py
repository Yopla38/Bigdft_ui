"""Recover the structure a calculation was run on, from its log.

`log.astruct` is the `posinp` dictionary BigDFT read. Build a System from it
with system_from_dict_positions. (Systems.system_from_log does the same in one
call but imports scipy, which fails in the BigDFT 1.9.1 image of the pack.)

task: Build a structure
stage: analysis
"""
from BigDFT.Logfiles import Logfile
from BigDFT.Systems import system_from_dict_positions

log = Logfile("log-h2o.yaml")
structure = log.astruct                              # {'units': ..., 'positions': [...]}
system = system_from_dict_positions(structure["positions"], units=structure["units"])

posinp = system.get_posinp()

from BigDFT.Systems import system_from_log
try:
    system_from_log(log)
    raise AssertionError("system_from_log works here: use it, and revise this snippet")
except ImportError as error:
    print("system_from_log is unusable in this image:", error)
assert len(posinp["positions"]) == log.nat
print("units:", structure["units"], "| atoms:", [list(p)[0] for p in structure["positions"]])
