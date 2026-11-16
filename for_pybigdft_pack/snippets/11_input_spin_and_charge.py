"""Set the spin polarisation and the charge of a system.

spin_polarize(mpol) writes dft.nspin = 2 and dft.mpol = number of up minus down
electrons. charge(q) writes dft.qcharge: +1 for a cation (charge() without
argument means -1, an anion). The parity of mpol must match the number of
electrons, or BigDFT refuses the input.

task: Write an input file
stage: dry-run
"""
from BigDFT.Calculators import SystemCalculator
from BigDFT.Inputfiles import Inputfile

water = {"units": "angstroem", "positions": [
    {"O": [0.0, 0.0, 0.0]}, {"H": [0.757, 0.5859, 0.0]}, {"H": [-0.757, 0.5859, 0.0]}]}

inp = Inputfile()
inp.set_xc("PBE")
inp.charge(1)                # H2O+: 7 valence electrons
inp.spin_polarize(mpol=1)    # so one unpaired electron
assert inp["dft"]["qcharge"] == 1 and inp["dft"]["nspin"] == 2 and inp["dft"]["mpol"] == 1

log = SystemCalculator(omp="1", dry_run=True, verbose=False).run(
    name="cation", input=inp, posinp=water, run_dir="runs")
assert log.memory_peak is not None, log.log.get("Additional Info")
print("charge:", log.system_charge, "| nspin:", log.spin_polarization, "| mpol:", log.total_magn_moment)
