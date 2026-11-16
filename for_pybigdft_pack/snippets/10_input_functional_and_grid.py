"""Write the three settings every calculation needs: functional, grid spacing, extent of the grid.

An Inputfile is a dictionary. Its methods (set_xc, set_hgrid, ...) are the
functions of BigDFT.InputActions, attached when the object is created: they do
not appear in dir(Inputfile). Each one writes one or a few keys; printing the
Inputfile shows exactly what BigDFT will read. A key left out keeps BigDFT's default.

task: Write an input file
stage: prepare
"""
from BigDFT.Inputfiles import Inputfile

inp = Inputfile()
inp.set_xc("PBE")                    # dft.ixc. "LDA", "PBE", "PBE0", "B3LYP", "HF", or a libxc code
inp.set_hgrid(0.40)                  # dft.hgrids, in bohr. Smaller is more accurate and more expensive
inp.set_rmult(coarse=5.0, fine=8.0)  # dft.rmult: how far the coarse and fine grids extend around atoms

assert dict(inp) == {"dft": {"ixc": "PBE", "hgrids": 0.40, "rmult": [5.0, 8.0]}}
print(dict(inp))
