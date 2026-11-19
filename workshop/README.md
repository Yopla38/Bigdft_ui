# Workshop 2: build a study, step by step

One place, one study. You define a system, add a calculation, compute it, look at the result, add the next step. Each step continues what is already there. There is no separate "Study" space and no capsule: the list on the left is the study, in order, and it is also the script.

```bash
python tools/preview.py 8766 workshop     # http://localhost:8766
node tools/check_workshop.js              # the page against a real BigDFT run
```

The first workshop (`prototype/`) is untouched. This one reuses its 3D scene, figures, parameter schema, checks and registries through `workshop/shared`, a link to `prototype/js`.

## How it reads

| Where | What |
|---|---|
| Left | The study: the system, then each step with its status and its result. "Add a step" lists the steps of the registry |
| Centre | The system as the selected step sees it (the relaxed geometry once a relaxation is computed). Below: the result of the step, its `input.yaml`, the script of the whole study, the map of links, the log of what was sent |
| Right | The selected step: what it continues, what it changes, and for every setting where its value comes from |

## The rules

1. **A step continues a step.** A calculation holds only what it changes. Everything else is inherited from the step it comes after, back to the first one. Change the functional of the first calculation and every later step follows.
2. **Every value says where it comes from**: *inherited* from a named step, set by a *decision*, set by *you* on this step, *adapted* by the workshop to the system, or BigDFT's *default*.
3. **A decision is a step.** A convergence series proposes the cheapest value that meets the criterion. A decision step retains a value, the proposed one or yours with a reason, and that value applies to every step after it. Downstream it is shown read-only, with a link back to the decision.
4. **Nothing stale stays on screen.** A result belongs to an input. When an upstream step changes, the steps that depend on it go back to "ready to compute".
5. **Compute goes in waves.** A wave holds every run that waits for nothing. A calculation that starts from a relaxed geometry waits for that relaxation. Two steps that need the same calculation share one run.
6. **The study is a script.** The Script tab is the study written with the registry of steps, one line per step. It runs as is with `for_pybigdft_pack/study`.

## The steps

They are not written in the page. `tools/build_steps.py` reads `for_pybigdft_pack/study/StudyActions.py` by introspection and writes `js/steps.js`: names, families, parameters, defaults, the first line of each docstring. A step added to the registry appears in "Add a step" after a rebuild.

| Family | Steps |
|---|---|
| Calculations | `calculation`, `relax` |
| Pre-filled calculations | `ionised`, `triplet`, `hybrid` |
| Series and decisions | `converge`, `choose` |
| Results | `difference`, `target` |

The settings of a calculation are the first workshop's: the essential controls, the input actions of `BigDFT.InputActions`, and all 311 variables.

## What "compute" does here

A web page cannot start BigDFT. So that computing is not a simulation, the calculations a study on water can reach were run once with BigDFT 1.9.1, through the registry of steps itself (`library/lattice.py`, 48 runs, plus the 9 of `examples/water-study`), and bundled by `tools/build_library.py` into `js/library.js`: 57 calculations, 17 of them relaxations. The logs are kept in `library/runs.tgz`; the library rebuilds from them, byte for byte.

A step is looked up by the **identity of its calculation**: its input with BigDFT's defaults removed, plus the geometry it starts from. If the calculation is in the library, its real result is shown: energy, iterations, residue, levels, forces, time, and the relaxed geometry. If it is not, the step says "no recorded result" and shows nothing. No number is invented.

The lattice covers water with LDA and PBE at four grid spacings (neutral, cation, relaxed, cation at the relaxed geometry, cation relaxed) and PBE0 at two. Other systems and other settings are written and checked, not computed.

## Checked against a real run

The example ("Load an example": the ionisation energy of water) was written with the interface, saved as `examples/water-ionisation/study.py` and executed with BigDFT. `tools/check_workshop.js` rebuilds it with the model of the page and checks that the page writes that script character for character, sends the same 11 runs under the same names in two waves, and shows the energies BigDFT gave (12.564 eV vertical, 12.459 eV adiabatic, for 12.62 ± 0.3 measured).

## Files

| File | Role |
|---|---|
| `index.html` | Page and styles |
| `js/model.js` | The study: steps, inheritance, decisions, identity, status, waves, script. No DOM |
| `js/app.js` | The interface |
| `js/board.js` | The map of links |
| `js/steps.js` | Generated: the registry of steps |
| `js/library.js` | Generated: the recorded results |
| `library/lattice.py`, `library/runs.tgz` | The runs behind the library, and their logs |

## Limits

- Results exist for water only, on the lattice above.
- Nothing is executed from the page. The log shows the call that would be sent to the HAPS, and the recorded outcome.
- The registry has no restart from wavefunctions yet, no retry on failure, and no loop over structures.
- A series varies one input action over numbers (`set_hgrid` today).
- A study lives in the page: reloading starts over. The script is what to keep.
