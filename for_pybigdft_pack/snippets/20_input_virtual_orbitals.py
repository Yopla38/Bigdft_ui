"""Compute empty (virtual) orbitals, for a gap or a density of states above the Fermi level.

extract_virtual_states(nvirt) writes dft.nvirt and dft.norbv. Without it a log
only holds the occupied levels.

task: Write an input file
stage: dry-run
"""
from BigDFT.Calculators import SystemCalculator
from BigDFT.Inputfiles import Inputfile

inp = Inputfile()
inp.set_xc("PBE")
inp.extract_virtual_states(nvirt=4)
assert inp["dft"]["nvirt"] == 4

log = SystemCalculator(omp="1", dry_run=True, verbose=False).run(
    name="virtual", input=inp, posinp="h2o.xyz", run_dir="runs")
assert log.memory_peak is not None, log.log.get("Additional Info")
print(inp["dft"])
