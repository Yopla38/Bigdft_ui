"""Ask BigDFT to write the density, the orbitals or cube files.

These actions choose what a run leaves in data-NAME/ besides its log.

task: Write an input file
stage: prepare
"""
from BigDFT.Inputfiles import Inputfile

inp = Inputfile()
inp.write_density_on_disk()                     # dft.output_denspot = 21: density as a cube file
inp.write_orbitals_on_disk()                    # output.orbitals = binary: one file per orbital
inp.write_cubefiles_around_fermi_level(nplot=2) # dft.nplot: cube files of the orbitals near the gap

assert inp["dft"]["output_denspot"] == 21 and inp["dft"]["nplot"] == 2
assert inp["output"]["orbitals"] == "binary"
print(dict(inp))
