"""Translate and rotate a fragment, and measure a distance between fragments.

Fragment.translate takes a vector in BOHR, whatever the units the atoms were
given in. `centroid` is in bohr too. Multiply by AU_to_A to get angstroem.

task: Build a structure
stage: prepare
"""
import copy

import numpy as np
from BigDFT.Atoms import AU_to_A
from BigDFT.Fragments import distance
from BigDFT.IO import read_xyz
from BigDFT.Systems import System

with open("h2o.xyz") as ifile:
    first = read_xyz(ifile, fragmentation="single")["FRA:0"]

second = copy.deepcopy(first)
second.translate([0.0, 0.0, 3.0 / AU_to_A])        # 3 angstroem along z, given in bohr
second.rotate(z=90, units="degrees")

dimer = System()
dimer["WAT:0"], dimer["WAT:1"] = first, second

d = distance(first, second) * AU_to_A               # between centroids
assert abs(d - 3.0) < 0.2, d
print("distance between the two molecules: %.3f angstroem" % d)
print("atoms in the dimer:", len(dimer.get_posinp()["positions"]))
