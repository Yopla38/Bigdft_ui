"""The calculations the workshop can show for real: a lattice of runs on water.

The mock-up cannot start BigDFT from a web page. So that "compute" is not a
simulation, every calculation a study on water can reach with the steps and
the presets of the workshop is run here once, through the registry of steps
itself, and bundled (tools/build_library.py). A step whose input is one of
these is shown with its real result; any other says it was not computed.

    python3 run_here.py lattice.py        (in the image, with StudyActions.py and Studies.py beside it)
"""
import os
import sys

sys.path.insert(0, os.environ.get("STUDY_REGISTRY", "."))
from Studies import Study

WATER = {"units": "angstroem", "positions": [
    {"O": [0.0, 0.0, 0.0]}, {"H": [0.757, 0.5859, 0.0]}, {"H": [-0.757, 0.5859, 0.0]}]}

study = Study(WATER, name="h2o")
for xc in ("LDA", "PBE"):
    for h in (0.50, 0.45, 0.40, 0.35):
        t = "%s_h%03d" % (xc, round(h * 100))
        neutral = study.calculation("n_" + t, set_xc=xc, set_hgrid=h, set_rmult={"coarse": 5.0, "fine": 8.0})
        cation = study.calculation("c_" + t, after=neutral, charge=1, spin_polarize=1)
        relaxed = study.relax("nr_" + t, after=neutral)
        vertical = study.calculation("cv_" + t, after=relaxed, charge=1, spin_polarize=1)
        study.relax("cr_" + t, after=vertical)
        if xc == "PBE" and h in (0.45, 0.40):                     # the hybrid, at the PBE geometries
            study.calculation("n0_" + t, after=neutral, set_xc="PBE0")
            study.calculation("c0_" + t, after=cation, set_xc="PBE0")
            study.calculation("nr0_" + t, after=relaxed, set_xc="PBE0")
            study.calculation("cv0_" + t, after=vertical, set_xc="PBE0")
