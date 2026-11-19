# The registry of steps

`BigDFT.InputActions` holds the actions an input file is made of. `StudyActions.py` holds the steps a **study** is made of, one level above, with the same convention: plain functions, the study as first argument, a default for everything, read by introspection. `Studies.py` is the engine that attaches them to a `Study` and runs them the way the pack runs BigDFT: prepare here, compute on the HAPS, analyse here.

It lives here for now. Nothing in the pack is changed by it: copy the two files beside a script, or put them on the Python path of the pack's container. Python 3.7, PyBigDFT 0.9, no other dependency.

## A study

```python
from Studies import Study

study = Study("h2o.xyz", name="water")
experiment = study.target("experiment", 12.62, within=0.3, source="photoelectron spectroscopy")
ground = study.calculation("ground_state", set_xc="PBE", set_hgrid=0.40, set_rmult={"coarse": 5, "fine": 8})
cation = study.ionised("cation", after=ground)
series = study.converge("grid_convergence", of=cation, relative_to=ground, values=(0.50, 0.45, 0.40, 0.35), within=0.010)
grid = study.choose("grid_kept", among=series, retained=0.40, because="the geometry is not converged at 0.45")
relaxed = study.relax("relaxed", after=ground)
vertical = study.ionised("cation_vertical", after=relaxed)
study.difference("ionisation_energy", vertical, relaxed, against=experiment)
```

Three rules do the work:

1. **Passing a step to another step is the link.** `after=` continues a calculation, `of=` varies it, `among=` decides on a series, the two arguments of `difference` compare.
2. **A calculation is described by input actions.** A keyword argument named after a function of `BigDFT.InputActions` calls it: `set_xc="PBE"`, `set_rmult={"coarse": 5, "fine": 8}`, `spin_polarize=1`. A step that continues another inherits its actions and adds its own. `keys=` reaches any input variable no action covers.
3. **A decision applies to what follows.** `choose` retains a value of the setting a series varied; every calculation written after it uses that value. Left without `retained=`, it takes the value the criterion proposes; if none passes, the steps after it wait.

## The steps

| Family | Step | What it is |
|---|---|---|
| Calculations | `calculation` | One BigDFT calculation: an energy, at a fixed geometry |
| | `relax` | Relax the geometry. A step placed `after` it starts from the relaxed geometry |
| Pre-filled | `ionised` | The same system with an electron removed |
| | `triplet` | The lowest triplet, with the convergence settings a triplet needs |
| | `hybrid` | The same calculation with a hybrid functional, at the same geometry |
| Series and decisions | `converge` | Vary one setting and see when the result stops changing |
| | `choose` | Decide on the value of a setting, for every step that follows |
| Results | `difference` | The energy of one step minus the energy of another, judged against a target |
| | `target` | A reference value and the window that counts as agreement, set before computing |

A pre-filled step is a calculation with its actions written in: `ionised` is `calculation(..., charge=1, spin_polarize=1)`. Its body is the documentation of what it fills. To add a step, write a function in `StudyActions.py`, name it in the module docstring under its family, and run `python tools/build_steps.py` so the workshop lists it.

## Running it

```python
state = study.prepare()      # inputs written, dry run of each: ready, waiting, refused
# on the HAPS:  haps_bigdft(names=state["ready"], directory="runs")
study.analyse()              # what every step gives, in order
```

`prepare` is called again after each wave: a calculation that starts from a relaxed geometry is "waiting" until the relaxation has run, and a calculation after an undecided `choose` waits for the series. `run_here.py study.py` loops prepare, `bigdft -n NAME`, analyse where BigDFT itself can run; it stands in for the HAPS in tests.

What the engine takes care of, each learned from a real run:

- Two steps that need the same input at the same geometry share one run. The manifest records the alias.
- A run already computed is not prepared again: a dry run would overwrite its log.
- A run is refused when the dry run's log has no `Additional Info` or lists input errors, not when a call raises: it never does.
- Run names hold 30 characters at most. BigDFT truncates the name of a dry run's log beyond that, and PyBigDFT then finds no log. Members of a series are named `ground_state-hgrid0p45`.
- A hybrid functional gets the pseudopotentials it needs (`psppar.X: {Pseudopotential XC: 11}`).
- The energy of a relaxation is that of its last step, not the lowest of the trajectory.
- `runs/manifest.json` says which run is which step, with which input and from which geometry.

## What ran

`examples/water-ionisation/` holds the study above, as the workshop wrote it, with its inputs, logs and analysis: 11 runs in two waves, 12.564 eV vertical and 12.459 eV adiabatic for 12.62 ± 0.3 measured. `workshop/library/lattice.py` is a second study, 48 runs, all through this registry.

## Not there yet

- No restart from the wavefunctions of an earlier step.
- No retry when a run fails or does not converge; the step is reported and the study stops there.
- A series varies one action over numbers. No loop over structures.
- The HAPS call itself is not made by `Study`: it prepares and analyses, the caller sends.
