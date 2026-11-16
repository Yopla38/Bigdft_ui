"""Build a System atom by atom, grouped in named fragments.

A System is a dictionary of Fragments; a Fragment is a list of Atoms. Fragment
names have the form "NAME:NUMBER". An Atom is made from a dictionary holding
the element as key, its position, and the units of that position.

task: Build a structure
stage: prepare
"""
from BigDFT.Atoms import Atom
from BigDFT.Fragments import Fragment
from BigDFT.Systems import System

water = Fragment([
    Atom({"O": [0.0, 0.0, 0.0], "units": "angstroem"}),
    Atom({"H": [0.757, 0.5859, 0.0], "units": "angstroem"}),
    Atom({"H": [-0.757, 0.5859, 0.0], "units": "angstroem"}),
])
system = System()
system["WAT:0"] = water

posinp = system.get_posinp()                       # angstroem by default
assert [list(p)[0] for p in posinp["positions"]] == ["O", "H", "H"]
print("valence electrons of the fragment:", water.nel)
print("first atom:", water[0].sym, water[0].get_position(units="angstroem"))
