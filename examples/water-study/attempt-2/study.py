"""Study pipeline, written by the workshop from the board.

A calculation has two places. Here, in the pack's container: prepare, dry-run and analyse,
with PyBigDFT. On the HAPS: compute, `bigdft -n NAME` on each prepared NAME.yaml, nothing else.

    python study.py prepare   # writes runs/NAME.yaml for every run that is ready, and dry-runs it
    #   -> send the names it prints to the HAPS: haps_bigdft(names=[...], directory="runs")
    python study.py analyse   # reads the logs the HAPS sent back
Repeat `prepare` after each wave: what continues from a relaxation is ready once its log is back.
"""
import sys
from pathlib import Path

import yaml
from BigDFT.Calculators import SystemCalculator
from BigDFT.Inputfiles import Inputfile
from BigDFT.Logfiles import Logfile

HA_EV, HA_KJ = 27.211386245988, 2625.4996394799
RUNS = "runs"
STRUCTURE = yaml.safe_load(Path("structure.yaml").read_text())  # Water, written by the Matter block
ELEMENTS = sorted({e for p in STRUCTURE["positions"] for e in p})


def blueprint():
    """The settings of the workshop blueprint this study starts from."""
    inp = Inputfile()
    inp.set_hgrid(0.45)
    inp.set_rmult(coarse=5.0, fine=8.0)
    inp.set_xc("PBE")
    inp.set_scf_convergence(gnrm=1e-5)
    return inp


def relaxed(name):
    """Final geometry of a relaxation, as BigDFT wrote it."""
    pos = yaml.safe_load(Path(RUNS, f"final_{name}.yaml").read_text())["positions"]
    return {"units": "angstroem", "positions": [{e: v} for p in pos for e, v in p.items() if e != "force"]}


def energy(name):
    """Final energy of a run; None if it is not back yet or if BigDFT refused it."""
    path = Path(RUNS, f"log-{name}.yaml")
    if not path.exists():
        return None
    try:
        log = Logfile(str(path))
        return (log if len(log) == 0 else log[len(log) - 1]).energy  # a relaxation logs every step: keep the last
    except Exception:
        return None


def inputs():
    """One entry per run: its input and, if any, the relaxation its geometry comes from."""
    runs = {}

    # A: Ground state, varied over grid spacing
    for h in (0.50, 0.45, 0.40):
        inp = blueprint()
        inp.set_hgrid(h)
        runs["A" + f"_h{round(h * 100):03d}"] = dict(input=inp)

    # B: Triplet state, same structure as A, varied over grid spacing
    for h in (0.50, 0.45, 0.40):
        inp = blueprint()
        inp.spin_polarize(mpol=2)
        inp["dft"].update(itermax=200, nrepmax=5)  # a triplet needs more iterations and restarts
        inp.set_hgrid(h)
        runs["B" + f"_h{round(h * 100):03d}"] = dict(input=inp)

    # D: Relaxation, same structure as A
    inp = blueprint()
    inp.optimize_geometry(method="SQNM", nsteps=300, forcemax=2.0e-4)
    runs["D"] = dict(input=inp)

    # E: PBE0 single point, at the relaxed geometry of D
    inp = blueprint()
    inp.set_xc("PBE0")
    for el in ELEMENTS:  # no pseudopotential is registered for a hybrid functional
        inp["psppar." + el] = {"Pseudopotential XC": 11}  # use the PBE ones
    runs["E"] = dict(input=inp, geometry="D")
    return runs


def prepare():
    code = SystemCalculator(omp="1", dry_run=True, verbose=False)
    ready, waiting, refused = [], [], []
    for name, r in inputs().items():
        if energy(name) is not None:
            continue  # already computed
        if r.get("geometry") and not Path(RUNS, f"final_{r['geometry']}.yaml").exists():
            waiting.append(name)  # its relaxation is not back yet
            continue
        posinp = relaxed(r["geometry"]) if r.get("geometry") else STRUCTURE
        log = code.run(name=name, input=r["input"], posinp=posinp, run_dir=RUNS)  # writes runs/NAME.yaml, no SCF
        memory = log.log.get("Estimated Memory Peak (MB)")
        if memory is None:  # BigDFT refused the input: its reason is in runs/log-NAME.yaml
            refused.append(name)
            continue
        print(f"{name}: dry run passed, memory peak {memory} MB")
        ready.append(name)
    print("ready for the HAPS:", ready)
    print("waiting for a relaxation:", waiting)
    print("refused by the dry run:", refused)
    return 1 if refused else 0


def analyse():
    E = {name: energy(name) for name in inputs()}
    E = {name: e for name, e in E.items() if e is not None}
    out = {}
    for key in [n.split("_", 1)[1] for n in E if n.startswith("B_")]:  # C: one value per member of the series
        a, b = f"B_{key}", f"A_{key}"
        if a in E and b in E:
            out[f"C_{key}"] = (E[a] - E[b]) * HA_EV  # Triplet energy, eV
    print(yaml.safe_dump({"energies_Ha": E, "results": out}, sort_keys=False))
    return 0


if __name__ == "__main__":
    sys.exit({"prepare": prepare, "analyse": analyse}[sys.argv[1] if len(sys.argv) > 1 else "prepare"]())