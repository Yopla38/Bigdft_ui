# Workshop 2: build a study, step by step

One place, one study. You define a system, add a calculation, compute it, look at the result, add the next step. Each step continues what is already there. There is no separate "Study" space and no capsule: the graph in the centre is the study, and it is also the script.

```bash
python tools/preview.py 8766 workshop     # http://localhost:8766
node tools/check_workshop.js              # the page against a real BigDFT run
```

The first workshop (`prototype/`) is untouched. This one reuses its 3D scene, figures, parameter schema, checks and registries through `workshop/shared`, a link to `prototype/js`.

## How it reads

| Where | What |
|---|---|
| Centre | **The study as a graph: one box per step.** A box says what the step is, what it continues, what it gave and where it stands. The arrows are the links between steps, one line style per kind of link. The system stays in sight in a corner, in 3D, as the selected step sees it; it can be hidden, and "3D system" shows it in full |
| Left | The same study as a list, in order, and "Add a step": the steps of the registry |
| Below | The result of the selected step, its `input.yaml`, the script of the whole study, the log of what was sent |
| Right | The selected step: what it continues, what it changes, and for every setting where its value comes from |

A study is mostly a chain, longer than the screen. The graph wraps like a line of text: it is cut into bands of as many boxes as fit, one band under the other. Boxes can be dragged; "+" on the selected box adds a step after it.

## The rules

1. **A step continues a step.** A calculation holds only what it changes. Everything else is inherited from the step it comes after, back to the first one. Change the functional of the first calculation and every later step follows.
2. **Every value says where it comes from**: *inherited* from a named step, set by a *decision*, set by *you* on this step, *adapted* by the workshop to the system, or BigDFT's *default*.
3. **A decision is a step.** A convergence series proposes the cheapest value that meets the criterion. A decision step retains a value, the proposed one or yours with a reason, and that value applies to every step after it. Downstream it is shown read-only, with a link back to the decision.
4. **Nothing stale stays on screen.** A result belongs to an input. When an upstream step changes, the steps that depend on it go back to "ready to compute".
5. **Compute goes in waves.** A wave holds every run that waits for nothing. A calculation that starts from a relaxed geometry, or from the wavefunctions of another step, waits for that step. Two steps that need the same calculation share one run.
6. **The study is a script.** The Script tab is the study written with the registry of steps, one line per step. It runs as is with `for_pybigdft_pack/study`.

## The steps

They are not written in the page. `tools/build_steps.py` reads `for_pybigdft_pack/study/StudyActions.py` by introspection and writes `js/steps.js`: names, families, parameters, defaults, the first line of each docstring. A step added to the registry appears in "Add a step" after a rebuild.

| Family | Steps |
|---|---|
| Calculations | `calculation`, `relax` |
| Pre-filled calculations | `ionised`, `triplet`, `hybrid`, `empty_states` |
| Series and decisions | `converge`, `vary`, `choose` |
| Results | `difference`, `levels`, `target` |

The settings of a calculation are the first workshop's: the essential controls, the input actions of `BigDFT.InputActions`, and all 311 variables.

Three things a step can do besides inheriting:

- **Start from the wavefunctions of another step** ("Starts from the wavefunctions of"). The step that is read then writes them, and this one waits for it. The page refuses a pair with different charge or spin, and says why.
- **Vary any setting.** A series varies one argument of one input action. The list offered is drawn from PyBigDFT's registry: every argument that writes one setting. `converge` is for what converges (grid spacing, extents, criterion); `vary` lays values side by side without a criterion (functionals), judged against a target if there is one.
- **Read more than an energy.** `levels` reads the levels of a calculation; with an `empty_states` step before it, the gap.

## Results are drawn from PyBigDFT's registry of log attributes

PyBigDFT reads a log through one table, `BigDFT.Logfiles.BUILTIN`: each entry is an attribute of a `Logfile` (`log.energy`, `log.forces`, `log.evals`, 37 in PyBigDFT 0.9) with the paths where its value may be in the log. `tools/build_logviews.py` turns that table, as recorded in the pack's image, into `js/logviews.js`, and `tools/build_library.py` reads each run's log through it.

Under the figures of a computed calculation, "Everything the log holds" shows every attribute that log has, each as a view chosen by the shape of its value: a number with its unit, a vector, a table per atom, the levels, a structure. It also names the attributes the log does not have, which is how one sees what the calculation was not asked for. The values are read without PyBigDFT, by following the same paths; `tools/compare_log_attributes.py` compares them with what `Logfile` gives in the pack's image: 3,316 values on 122 runs, none differs. A new version of PyBigDFT changes the table, not the page: an attribute the page has no words for is shown under its own name.

## What "compute" does here

A web page cannot start BigDFT. So that computing is not a simulation, the calculations a study on water can reach were run once with BigDFT 1.9.1, through the registry of steps itself, and bundled by `tools/build_library.py` into `js/library.js`: 131 calculations, 21 of them relaxations. They come from `library/lattice.py` (48 runs), `library/lattice2.py` (98), `examples/water-ionisation` (18) and `examples/water-study` (9); two runs that are the same calculation are kept once. The logs of the lattices are in `library/runs.tgz` and `library/runs2.tgz`; the library rebuilds from them, byte for byte (the command is in the root README).

A step is looked up by the **identity of its calculation**: its input with BigDFT's defaults removed, the geometry it starts from, and the run whose wavefunctions it reads. If the calculation is in the library, its real result is shown. If it is not, the step says "no recorded result" and shows nothing. No number is invented.

What the library covers, on water:

| | |
|---|---|
| LDA and PBE, grid spacing 0.50 to 0.35 bohr | neutral, cation, relaxation, cation at the relaxed geometry, cation relaxed, empty states |
| PBE at 0.45 and 0.40 bohr | the functionals LDA, PBE, PBE0, B3LYP and Hartree-Fock side by side, at the built and at the relaxed geometry; PBE0 started from the PBE wavefunctions; coarse extent 4 to 7 and fine extent 7 to 10; empty states |
| A study that keeps PBE0, at 0.45 and 0.40 bohr | relaxation, cation, relaxed cation, empty states |

Other systems and other settings are written and checked, not computed.

## Checked against a real run

The example ("Load an example": the ionisation energy of water, sixteen steps) was written with the interface, saved as `examples/water-ionisation/study.py` and executed with BigDFT. `tools/check_workshop.js` rebuilds it with the model of the page and checks that the page writes that script character for character, sends the same 18 runs under the same names in the same 3 waves, starts the same 2 from wavefunctions, and shows the numbers BigDFT gave.

## Files

| File | Role |
|---|---|
| `index.html` | Page and styles |
| `js/model.js` | The study: steps, inheritance, decisions, identity, status, waves, script. No DOM |
| `js/app.js` | The interface |
| `js/board.js` | The graph: boxes, bands, arrows |
| `js/steps.js` | Generated: the registry of steps |
| `js/logviews.js` | Generated: the registry of log attributes |
| `js/library.js` | Generated: the recorded results |
| `library/lattice.py`, `lattice2.py`, `runs.tgz`, `runs2.tgz` | The runs behind the library, and their logs |
| `library/pybigdft_attributes.py` | Run in the pack's image: what PyBigDFT reads from each log, for `tools/compare_log_attributes.py` |

## Limits

- Results exist for water only, on the lattice above.
- Nothing is executed from the page. The log shows the call that would be sent to the HAPS, and the recorded outcome.
- On the HAPS, wavefunctions travel only with `docs/patches/haps-wavefunctions.patch` applied to the pack.
- Levels are numbers and a ladder. Orbitals and densities as volumes are not shown: no cube file is produced or read.
- No retry on failure, no loop over structures.
- A study lives in the page: reloading starts over. The script is what to keep.
