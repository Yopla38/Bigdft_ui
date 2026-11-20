"""More calculations the workshop can show for real: what the newer steps reach on water.

Run after lattice.py, the same way. It covers, for PBE at the two grid
spacings a study on water ends up with (0.45 and 0.40 bohr):

  - hybrids restarted from the PBE wavefunctions, and B3LYP and Hartree-Fock from scratch;
  - the functionals side by side, at the built and at the relaxed geometry;
  - the extents of the coarse and of the fine region;
  - empty states;
  - a study that decides for PBE0 and goes on with it: relaxation, cations.

    python3 run_here.py lattice2.py       (in the image, with StudyActions.py and Studies.py beside it)
"""
import os
import sys

sys.path.insert(0, os.environ.get("STUDY_REGISTRY", "."))
from Studies import Study

WATER = {"units": "angstroem", "positions": [
    {"O": [0.0, 0.0, 0.0]}, {"H": [0.757, 0.5859, 0.0]}, {"H": [-0.757, 0.5859, 0.0]}]}

study = Study(WATER, name="h2o")
for h in (0.45, 0.40):
    t = "h%03d" % round(h * 100)
    neutral = study.calculation("n_" + t, set_xc="PBE", set_hgrid=h, set_rmult={"coarse": 5.0, "fine": 8.0})
    cation = study.ionised("c_" + t, after=neutral)
    relaxed = study.relax("nr_" + t, after=neutral)
    single = study.calculation("ns_" + t, after=relaxed)                # the neutral again, at the relaxed geometry
    vertical = study.ionised("cv_" + t, after=relaxed)

    for tag, step in (("n", neutral), ("c", cation), ("ns", single), ("cv", vertical)):
        study.hybrid("%s0w_%s" % (tag, t), after=step, wavefunctions=step)            # PBE0 from the PBE wavefunctions
    study.hybrid("nr0w_" + t, after=relaxed, wavefunctions=relaxed)                      # the same, read from the relaxation itself

    values = ("LDA", "PBE", "PBE0", "B3LYP", "HF")
    study.vary("xc_" + t, of=cation, relative_to=neutral, values=values)
    study.vary("xcr_" + t, of=vertical, relative_to=single, values=values)

    study.converge("crm_" + t, of=cation, relative_to=neutral, action="set_rmult", argument="coarse", values=(4.0, 5.0, 6.0, 7.0))
    study.converge("frm_" + t, of=cation, relative_to=neutral, action="set_rmult", argument="fine", values=(7.0, 8.0, 9.0, 10.0))

    study.empty_states("nv_" + t, after=neutral)
    study.empty_states("nsv_" + t, after=single)
    study.empty_states("nrv_" + t, after=relaxed)

    # a study that keeps PBE0: everything after the decision is computed with it
    neutral0 = study.calculation("p0_" + t, after=neutral, set_xc="PBE0")
    relaxed0 = study.relax("p0r_" + t, after=neutral0)
    vertical0 = study.ionised("p0cv_" + t, after=relaxed0)
    study.relax("p0cr_" + t, after=vertical0)
    study.empty_states("p0v_" + t, after=neutral0)

for xc in ("LDA", "PBE"):                                                # empty states on the first lattice
    for h in (0.50, 0.35) if xc == "PBE" else (0.50, 0.45, 0.40, 0.35):
        t = "%s_h%03d" % (xc, round(h * 100))
        neutral = study.calculation("n_" + t, set_xc=xc, set_hgrid=h, set_rmult={"coarse": 5.0, "fine": 8.0})
        study.empty_states("nv_" + t, after=neutral)
