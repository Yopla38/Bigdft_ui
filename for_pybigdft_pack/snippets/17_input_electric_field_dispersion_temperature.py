"""Add an electric field, a dispersion correction, or an electronic temperature.

Three independent actions, each writing one key. The field is in atomic units
(Ha/bohr). The dispersion correction (D3) only exists for isolated systems.

task: Write an input file
stage: prepare
"""
from BigDFT.Inputfiles import Inputfile

inp = Inputfile()
inp.apply_electric_field([0.0, 0.0, 1.0e-3])   # dft.elecfield
inp.set_dispersion_correction()                # dft.dispersion = 5 (Grimme D3)
inp.set_electronic_temperature(kT=1.0e-3)      # mix.tel, in hartree; or T=300 in kelvin

assert inp["dft"]["elecfield"] == [0.0, 0.0, 1.0e-3]
assert inp["dft"]["dispersion"] == 5 and inp["mix"]["tel"] == 1.0e-3
print(dict(inp))
