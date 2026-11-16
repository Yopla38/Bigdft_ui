"""Read a structure from an .xyz file into a System, and turn it into `posinp`.

`IO.read_xyz` takes an OPEN FILE, not a file name. `fragmentation` is "atomic"
(one fragment per atom, the default) or "single" (the whole file is one
fragment); nothing else is accepted.

task: Build a structure
stage: prepare
"""
from BigDFT.IO import read_xyz

with open("h2o.xyz") as ifile:
    system = read_xyz(ifile, fragmentation="single")

print("fragments:", list(system.keys()))          # ['FRA:0']
fragment = system[list(system.keys())[0]]
print("atoms:", [atom.sym for atom in fragment])

posinp = system.get_posinp(units="angstroem")     # what `posinp=` of a calculator takes
assert len(posinp["positions"]) == 3 and posinp["units"] == "angstroem"
print(posinp["positions"][1])
