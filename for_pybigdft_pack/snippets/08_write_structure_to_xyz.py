"""Write a System to an .xyz file.

`IO.write_xyz` takes a System and an OPEN FILE. The first line holds the
number of atoms and the units, the second the boundary conditions.

task: Build a structure
stage: prepare
"""
from BigDFT.IO import read_xyz, write_xyz

with open("h2o.xyz") as ifile:
    system = read_xyz(ifile)

with open("copy.xyz", "w") as ofile:
    write_xyz(system, ofile)

lines = open("copy.xyz").read().splitlines()
assert lines[0].split()[0] == "3" and lines[1].strip() == "free"
print("\n".join(lines))
