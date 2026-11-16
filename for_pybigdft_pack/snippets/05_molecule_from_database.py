"""Take a common molecule from the database shipped with PyBigDFT.

`Molecule(name)` is already a `posinp` dictionary (units, positions): pass it
as it is to a calculator. It is not a System; build one from its positions
when fragments or geometry operations are needed.

task: Build a structure
stage: prepare
"""
from BigDFT.Database.Molecules import Molecule
from BigDFT.Systems import system_from_dict_positions

posinp = Molecule("H2O")
assert len(posinp["positions"]) == 3 and posinp["units"] == "angstroem"
print("positions:", [[k for k in atom if k != "frag"][0] for atom in posinp["positions"]])

system = system_from_dict_positions(posinp["positions"], units=posinp["units"])
print("as a System, fragments:", list(system.keys()))
