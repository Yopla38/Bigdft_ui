"""A study as one script with two verbs: prepare the runs, then analyse the logs.

The shape that fits the HAPS: `prepare` writes and dry-runs every input that
is not computed yet and returns the names to send; `analyse` reads the logs
that came back and applies the formulas. Both can be repeated: finished runs
are skipped, missing ones are simply not in the result.

task: Send runs to the HAPS
stage: dry-run
"""
import os

from BigDFT.Calculators import SystemCalculator
from BigDFT.DoS import AU_eV
from BigDFT.Inputfiles import Inputfile
from BigDFT.Logfiles import Logfile

RUNS = "."            # where NAME.yaml is written and log-NAME.yaml comes back
WATER = {"units": "angstroem", "positions": [
    {"O": [0.0, 0.0, 0.0]}, {"H": [0.757, 0.5859, 0.0]}, {"H": [-0.757, 0.5859, 0.0]}]}
OH = {"units": "angstroem", "positions": [{"O": [0.0, 0.0, 0.0]}, {"H": [0.0, 0.0, 0.97]}]}


def base():
    inp = Inputfile()
    inp.set_xc("PBE")
    inp.set_hgrid(0.45)
    return inp


def inputs():
    """Every run of the study: name -> (input, structure)."""
    runs = {"h2o": (base(), WATER)}
    radical = base()
    radical.spin_polarize(mpol=1)
    runs["oh"] = (radical, OH)
    cation = base()
    cation.charge(1)
    cation.spin_polarize(mpol=1)
    runs["h2o_cation"] = (cation, WATER)
    return runs


def energy(name):
    path = os.path.join(RUNS, "log-%s.yaml" % name)
    if not os.path.isfile(path):
        return None
    try:
        log = Logfile(path)
        return getattr(log if len(log) == 0 else log[len(log) - 1], "energy", None)
    except Exception:
        return None


def prepare():
    code = SystemCalculator(omp="1", dry_run=True, verbose=False)
    ready, refused = [], {}
    for name, (inp, posinp) in inputs().items():
        if energy(name) is not None:
            continue                                   # computed: a dry run would overwrite its log
        doc = code.run(name=name, input=inp, posinp=posinp, run_dir=RUNS).log
        problem = doc.get("Additional Info") or doc.get("List of error found while parsing input variables")
        if problem:
            refused[name] = problem
        else:
            ready.append(name)
    return ready, refused


def analyse():
    E = {name: energy(name) for name in inputs()}
    out = {}
    if E["h2o"] is not None and E["h2o_cation"] is not None:
        out["ionisation_energy_eV"] = (E["h2o_cation"] - E["h2o"]) * AU_eV
    return E, out


ready, refused = prepare()
assert ready == ["h2o_cation"] and not refused        # h2o and oh are already computed here
print("to send to the HAPS:", ready)

E, results = analyse()
assert E["h2o_cation"] is None and results == {}      # not back yet: no result, no error
print("energies so far:", {k: (round(v, 6) if v is not None else None) for k, v in E.items()})
