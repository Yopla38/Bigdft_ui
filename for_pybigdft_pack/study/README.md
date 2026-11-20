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

1. **Passing a step to another step is the link.** `after=` continues a calculation, `wavefunctions=` starts it from the wavefunctions of another, `on=` computes it on another structure, `of=` varies it, `among=` decides on a series, the two arguments of `difference` compare.
2. **A calculation is described by input actions.** A keyword argument named after a function of `BigDFT.InputActions` calls it: `set_xc="PBE"`, `set_rmult={"coarse": 5, "fine": 8}`, `spin_polarize=1`. A step that continues another inherits its actions and adds its own. `keys=` reaches any input variable no action covers.
3. **A decision applies to what follows.** `choose` retains a value of the setting a series varied; every calculation written after it uses that value. Left without `retained=`, it takes the value the criterion proposes; if none passes, the steps after it wait.

## The steps

| Family | Step | What it is |
|---|---|---|
| Structures | `structure` | Another structure in the study: a second molecule, a fragment, an isolated atom |
| Calculations | `calculation` | One BigDFT calculation: an energy, at a fixed geometry |
| | `relax` | Relax the geometry. A step placed `after` it starts from the relaxed geometry |
| Pre-filled | `ionised` | The same system with an electron removed |
| | `triplet` | The lowest triplet, with the convergence settings a triplet needs |
| | `hybrid` | The same calculation with a hybrid functional, at the same geometry |
| | `empty_states` | The same calculation, followed by its first empty states: what a gap needs |
| Series and decisions | `converge` | Vary one setting and see when the result stops changing |
| | `vary` | The same calculation for several values of one setting, side by side: functionals, for instance |
| | `choose` | Decide on the value of a setting, for every step that follows |
| Results | `difference` | The energy of one step minus the energy of another, judged against a target |
| | `combination` | A sum of energies with coefficients: an atomisation, a formation or a reaction energy |
| | `levels` | The highest occupied level of a calculation, and its gap if empty states were computed |
| | `target` | A reference value and the window that counts as agreement, set before computing |

A series varies the argument of one input action. For an action with several arguments, name the one that moves: `converge(..., action="set_rmult", argument="coarse", values=(4, 5, 6, 7))`; the others keep what the calculation gives to that action.

### More than one structure

```python
oxygen = study.structure("oxygen", {"units": "angstroem", "positions": [{"O": [0, 0, 0]}]})
hydrogen = study.structure("hydrogen", {"units": "angstroem", "positions": [{"H": [0, 0, 0]}]})
o = study.calculation("o_atom", after=water, on=oxygen, spin_polarize=2)
h = study.calculation("h_atom", after=water, on=hydrogen, spin_polarize=1)
study.combination("atomisation_energy", [(1, o), (2, h), (-1, water)])
```

`on=` computes a calculation on another structure, as that structure was given. With `after=` as well it inherits every action of the step it continues: the same functional and the same grid on both, which an energy difference needs. The steps that continue it stay on that structure; a relaxed geometry is not carried across (it is another system), and neither are wavefunctions. The spin of an atom is not guessed by the engine: say it (`spin_polarize`), as the workshop does from Hund's rule.

The structure the study is created with is `study.system`; `study.structure(...)` is the step.

### Starting from the wavefunctions of another step

```python
relaxed = study.relax("relaxed", after=ground)
pbe0 = study.hybrid("pbe0", after=relaxed, wavefunctions=relaxed)
```

The step that is read writes its wavefunctions; the one that reads them waits for it, and `prepare` copies the files into its own data directory, where BigDFT looks for them. Only that step starts from them: what continues it starts from scratch again. The two must have the same charge and spin; `prepare` refuses the run otherwise, because BigDFT would not: when the files do not fit it warns and starts from scratch. Measured on water: a PBE0 calculation converges in 8 iterations from the PBE wavefunctions, for 11 from scratch, to the same energy within 10⁻¹⁰ Ha.

On the HAPS the files travel with the input of the run. The pack as published does not select them: `docs/patches/haps-wavefunctions.patch` is the change that lets them through.

A pre-filled step is a calculation with its actions written in: `ionised` is `calculation(..., charge=1, spin_polarize=1)`. Its body is the documentation of what it fills. To add a step, write a function in `StudyActions.py`, name it in the module docstring under its family, and run `python tools/build_steps.py` so the workshop lists it.

## Running it

```python
state = study.prepare()      # inputs written, dry run of each: ready, waiting, refused
# on the HAPS:  haps_bigdft(names=state["ready"], directory="runs")
study.analyse()              # what every step gives, in order
```

`prepare(only={...})` looks at the named runs alone: a dry run is a round trip to the dry-run HAPS, and a caller that sends one step does not pay for all (`backend/runner.py` does this for workshop 2).

`prepare` is called again after each wave: a calculation that starts from a relaxed geometry is "waiting" until the relaxation has run, and a calculation after an undecided `choose` waits for the series. `run_here.py study.py` loops prepare, `bigdft -n NAME`, analyse where BigDFT itself can run; it stands in for the HAPS in tests.

What the engine takes care of, each learned from a real run:

- Two steps that need the same input at the same geometry share one run. The manifest records the alias. Writing its wavefunctions does not make a run another run.
- A run already computed is not prepared again: a dry run would overwrite its log.
- A run is refused when the dry run's log has no `Additional Info` or lists input errors, not when a call raises: it never does.
- Run names hold 30 characters at most. BigDFT truncates the name of a dry run's log beyond that, and PyBigDFT then finds no log. Members of a series are named `ground_state-hgrid0p45`.
- A hybrid functional gets the pseudopotentials it needs (`psppar.X: {Pseudopotential XC: 11}`).
- The energy of a relaxation is that of its last step, not the lowest of the trajectory.
- A run refused by the engine or by the dry run does not stop the others.
- `runs/manifest.json` says which run is which step, with which input, from which geometry and from whose wavefunctions.

## What ran

`examples/water-ionisation/` holds a study of sixteen steps, as the workshop wrote it, with its inputs, logs and analysis. `workshop/library/lattice.py` and `lattice2.py` are two more, of 48 and about 110 runs, all through this registry.

## Not there yet

- No retry when a run fails or does not converge; the step is reported and what depends on it waits.
- A series varies one argument of one action. No loop over structures.
- `levels` reads what BigDFT prints. Orbitals as volumes (cube files) are not handled.
- The HAPS call itself is not made by `Study`: it prepares and analyses, the caller sends. `backend/runner.py` is such a caller.
