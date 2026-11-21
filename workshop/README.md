# Workshop 2: build a study, step by step

One place, one study. You define a system, add a calculation, compute it, look at the result, add the next step. Each step continues what is already there. There is no separate "Study" space and no capsule: the graph in the centre is the study, and it is also the script.

```bash
python tools/preview.py 8766 workshop     # http://localhost:8766, on recorded results, without accounts
node tools/check_workshop.js              # the page against a real BigDFT run
cd backend && uv run python serve.py      # the application: accounts, your studies kept, computing on the HAPS (see backend/README.md)
```

## Your studies

Served by `backend/serve.py`, the page belongs to whoever signs in. It is covered until someone does; an account is created there too, unless registration is closed.

- **A study is saved by itself**, a moment after each change, and the header says where that stands ("Saved", "Saving…", "Not saved · retry"). Nothing asks to be saved and nothing waits for the server: what is done on screen is done, the server follows. If it does not answer, the save is tried again; if the session ended, the page asks to sign in and goes on from where it was.
- **"Studies"** lists yours: open, rename, duplicate, delete. A change of the list shows at once and goes back, with the reason, if the server refuses it. "New study" and "The example" make studies of their own; the one in hand stays in the list.
- **What BigDFT computed stays with the study.** Results are kept by the server under the identity of each calculation and come back when the study is opened, from any browser. A wave sent before the page was closed is followed to its end by the server, and taken up by the page when it is opened again.
- **Two tabs do not overwrite each other.** A save carries the revision it was made from; when the study was changed elsewhere, the page says so and the person chooses which version is kept.
- **Only you see your studies.** The profile menu (top right) holds the account settings: name, e-mail, password, where the account is signed in, deleting it. For an administrator it also holds the accounts and the waves sent to the HAPS.

| File | Role |
|---|---|
| `shared/api.js` | The page's way to the API: the session cookie is the browser's business, the CSRF token is sent with what changes something, an error has a code and a message. No DOM |
| `shared/account.js` | Signing in and up, the profile menu, the account settings, the administrator's screens. Shared with the first workshop |
| `js/store.js` | The studies of the user: the list, the open one, saving it (`model.serialize`), opening one (`model.restore`). No DOM |
| `js/studies.js` | The list of studies and the save status, drawn |

A study is written by `serialize` in `js/model.js` and read back by `restore`, its exact inverse: `tools/check_workshop.js` checks that a study saved and opened again gives the same script and the same identities of calculations.

The first workshop (`prototype/`) is untouched. This one reuses its 3D scene, figures, parameter schema, checks and registries through `workshop/shared`, a link to `prototype/js`.

## How it reads

| Where | What |
|---|---|
| Centre | **The study as a graph: one box per step.** A box says what the step is, what it continues, what it gave and where it stands. The arrows are the links between steps, one line style per kind of link. The system stays in sight in a corner, in 3D, as the selected step sees it; it can be hidden, and "3D system" shows it in full |
| Left | The same study as a list, in order, and "Add a step": the steps of the registry |
| Below | The result of the selected step, its `input.yaml`, the script of the whole study, its equations, the log of what was sent |
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
| Structures | `structure` |
| Calculations | `calculation`, `relax` |
| Pre-filled calculations | `ionised`, `triplet`, `hybrid`, `empty_states` |
| Series and decisions | `converge`, `vary`, `choose` |
| Results | `difference`, `combination`, `levels`, `target` |

The settings of a calculation are the first workshop's: the essential controls, the input actions of `BigDFT.InputActions`, and all 311 variables.

## More than one structure

A study starts on one system, and can name others: a `structure` step is a second molecule, a fragment, an isolated atom. A calculation is placed **on** it ("Computed on"), and when it also continues another calculation it is *the same calculation on another structure*: its functional, its grid and its extents, which is what an energy difference between two systems needs. Only what belongs to a system is advised again there: the spin of an isolated atom follows Hund's rule (oxygen: two unpaired electrons), because an atom computed without it is too high in energy and every atomisation energy built on it too large.

A structure, the system of the study included, comes from one of four places:

| Source | |
|---|---|
| The built-in systems | water, C₆₀, benzene on graphene, silicon, a peptide |
| One atom | an element of the first three rows |
| A file of your disk | an `.xyz`, read in the page (`js/structures.js`). A plain `.xyz` is in angstroem; BigDFT's own names its unit and its cell on the first two lines, and is read as it says |
| A molecule by its name | its 3D structure from PubChem, fetched by the server with the pack's `xyz_downloader.py`. Only when the page is served by `backend/serve.py`, to someone signed in |

Whatever the source, the script writes the structure as BigDFT reads it, positions in angstroem **with their unit**: a plain `.xyz` handed to BigDFT would be read in bohr, silently.

`combination` sums energies with coefficients. On a molecule, "As an atomisation energy" adds what is missing — each atom as a structure, the same calculation on it — and fills the sum: every one is an ordinary step, written in the script. Computed through the page for water with PBE at 0.40 bohr, at the built geometry: E(O) + 2 E(H) − E(H₂O) = 9.814 eV.

## The graph

Zooming changes the size and nothing else: the bands keep their columns, so no box changes place, and there is no smallest size (the buttons, or Ctrl + wheel). "Fit" shows the whole study, cut into bands the way that shows it largest; pressed again it goes back to reading size.

Three things a step can do besides inheriting:

- **Start from the wavefunctions of another step** ("Starts from the wavefunctions of"). The step that is read then writes them, and this one waits for it. The page refuses a pair with different charge or spin, and says why.
- **Vary any setting.** A series varies one argument of one input action. The list offered is drawn from PyBigDFT's registry: every argument that writes one setting. `converge` is for what converges (grid spacing, extents, criterion); `vary` lays values side by side without a criterion (functionals), judged against a target if there is one.
- **Read more than an energy.** `levels` reads the levels of a calculation; with an `empty_states` step before it, the gap.

## What a step computes, as an equation

Every step that computes is shown with its equations, typeset (`js/equations.js` writes the TeX, MathJax draws it): in the settings of the step, in its results, and in its box of the graph for a difference or a sum of three terms at most. The Equations tab holds those of the whole study, in the order of its steps, calculations that solve the same equations with the same settings sharing one block. "Copy LaTeX" gives the source.

**A calculation** is shown with what BigDFT solves for it, as the first workshop did for a blueprint: the Kohn-Sham equation, the density, the expansion of an orbital on scaling functions and wavelets. They are written with the settings the step is run with, inherited ones and decisions included: the functional names the exchange-correlation term (a hybrid or Hartree-Fock is an operator, and the legend says how much exact exchange it holds); the charge and the unpaired electrons are the numbers the density integrates to, with one equation per spin when the calculation is polarised; an implicit solvent adds the generalised Poisson equation, the D3 correction its term, the linear-scaling mode the density kernel, a relaxation the forces and its criterion. Once computed, the size of the basis is written with the grid points of its log, `N_dof = N_c + 7 N_f`.

**A difference, a combination and a series** compute something from the energies of other steps. Their equation is written from the study, never typed: its terms are the links of the step, and each energy is named by what it is the energy of — the structure and its charge, `E(H₂O⁺)`; the multiplicity when two terms differ only by it; the title of the step when nothing else tells them apart. A legend says which step each symbol comes from. Once the step is computed, the equation goes on with the energies it was computed from, in hartree, and the value:

```
E_I^vert = E(H₂O⁺) − E(H₂O)
         = −16.756986 − (−17.218714) Ha
         = 0.461728 Ha = 12.564 eV
```

The left-hand side is named only when the terms define it: the cation minus the neutral on one structure is an ionisation energy (`E_I`), vertical when both energies are taken at one geometry, adiabatic when each is relaxed; a triplet minus a singlet is `E_T`; the atoms minus the molecule is `E_at`. Anything else is `ΔE`. A convergence is written with what it follows and its criterion, `|ΔE(h) − ΔE(h_ref)| ≤ 10 meV`.

MathJax is loaded from the network after the page. Until it is there, and without it, the same equation is shown in plain characters; no TeX source is ever on screen.

## Results are drawn from PyBigDFT's registry of log attributes

PyBigDFT reads a log through one table, `BigDFT.Logfiles.BUILTIN`: each entry is an attribute of a `Logfile` (`log.energy`, `log.forces`, `log.evals`, 37 in PyBigDFT 0.9) with the paths where its value may be in the log. `tools/build_logviews.py` turns that table, as recorded in the pack's image, into `js/logviews.js`, and `tools/build_library.py` reads each run's log through it.

Under the figures of a computed calculation, "Everything the log holds" shows every attribute that log has, each as a view chosen by the shape of its value: a number with its unit, a vector, a table per atom, the levels, a structure. It also names the attributes the log does not have, which is how one sees what the calculation was not asked for. The values are read without PyBigDFT, by following the same paths; `tools/compare_log_attributes.py` compares them with what `Logfile` gives in the pack's image: 3,316 values on 122 runs, none differs. A new version of PyBigDFT changes the table, not the page: an attribute the page has no words for is shown under its own name.

## What "compute" does here

There are two answers, and the page says which one it is giving (top right).

**Served as files** (`tools/preview.py`), it is a mock-up on recorded results, described below.

**Served by `backend/serve.py`**, it computes: "Compute this step" sends the runs of the step through the server to the HAPS. BigDFT checks each input first (a dry run on the dry-run HAPS), then runs it; the page follows the wave run by run and shows the result read from the log that came back, with the same views. A switch, "Recorded | Compute", goes back to the mock-up. What decides a wave, an identity or a stale result is the same code in both cases (`js/model.js`); only where a result comes from changes (`js/live.js`). The server is sent the study as data, the list of calls the script is written from, never the script. `backend/README.md` says how to start it and what a failure looks like.

The rest of this section is the mock-up. A web page cannot start BigDFT. So that computing is not a simulation, the calculations a study on water can reach were run once with BigDFT 1.9.1, through the registry of steps itself, and bundled by `tools/build_library.py` into `js/library.js`: 131 calculations, 21 of them relaxations. They come from `library/lattice.py` (48 runs), `library/lattice2.py` (98), `examples/water-ionisation` (18) and `examples/water-study` (9); two runs that are the same calculation are kept once. The logs of the lattices are in `library/runs.tgz` and `library/runs2.tgz`; the library rebuilds from them, byte for byte (the command is in the root README).

A step is looked up by the **identity of its calculation**: its input with BigDFT's defaults removed, the geometry it starts from, and the run whose wavefunctions it reads. If the calculation is in the library, its real result is shown. If it is not, the step says "no recorded result" and shows nothing. No number is invented.

What the library covers, on water:

| | |
|---|---|
| LDA and PBE, grid spacing 0.50 to 0.35 bohr | neutral, cation, relaxation, cation at the relaxed geometry, cation relaxed, empty states |
| PBE at 0.45 and 0.40 bohr | the functionals LDA, PBE, PBE0, B3LYP and Hartree-Fock side by side, at the built and at the relaxed geometry; PBE0 started from the PBE wavefunctions; coarse extent 4 to 7 and fine extent 7 to 10; empty states |
| A study that keeps PBE0, at 0.45 and 0.40 bohr | relaxation, cation, relaxed cation, empty states |

Other systems and other settings are written and checked, not computed.

## Checked against a real run

`tools/check_live.js` does for the computing page what `check_workshop.js` does for the mock-up, and computes: it sends the example through the server with the code of the page, and compares every energy BigDFT gives with the recorded run.

The example ("Load an example": the ionisation energy of water, sixteen steps) was written with the interface, saved as `examples/water-ionisation/study.py` and executed with BigDFT. `tools/check_workshop.js` rebuilds it with the model of the page and checks that the page writes that script character for character, sends the same 18 runs under the same names in the same 3 waves, starts the same 2 from wavefunctions, and shows the numbers BigDFT gave.

## Files

| File | Role |
|---|---|
| `index.html` | Page and styles |
| `js/model.js` | The study: steps, inheritance, decisions, identity, status, waves, script. No DOM |
| `js/app.js` | The interface |
| `js/board.js` | The graph: boxes, bands, arrows |
| `js/structures.js` | Structures that are not built in: an atom, an `.xyz` file, a fetched molecule; and what BigDFT reads of any structure. No DOM |
| `js/equations.js` | What a step computes, as TeX and in plain characters: the equations BigDFT solves for a calculation, and what a difference, a combination or a series computes from energies. No DOM |
| `js/live.js` | Computing for real: asks the page's server wave after wave, hands the results to the model. No DOM |
| `js/steps.js` | Generated: the registry of steps |
| `js/logviews.js` | Generated: the registry of log attributes |
| `js/library.js` | Generated: the recorded results |
| `library/lattice.py`, `lattice2.py`, `runs.tgz`, `runs2.tgz` | The runs behind the library, and their logs |
| `library/pybigdft_attributes.py` | Run in the pack's image: what PyBigDFT reads from each log, for `tools/compare_log_attributes.py` |

## Limits

- On recorded results: they exist for water only, on the lattice above, and nothing is executed. The log shows the call that would be sent to the HAPS, and the recorded outcome.
- Computing for real: any setting is computed, but only water went through the chain; the other systems are written the same way and were not run.
- On the HAPS, wavefunctions travel only if it takes them: the pack's does since 2026-11-20; an older copy needs `docs/patches/haps-wavefunctions.patch`.
- Levels are numbers and a ladder. Orbitals and densities as volumes are not shown: no cube file is produced or read.
- No retry on failure, no loop over structures: each structure is a step, and so is each calculation on it.
- An isolated atom is computed spin-polarised in its Hund ground state, with the occupations BigDFT chooses: the workshop does not set them, and for an open p shell the energy depends on them by tenths of an eV. An atomisation energy is to be read with that in mind.
- Elements beyond argon are not known to the page yet: a file that holds one is refused, with the list of those that are.
- A study lives in the page: reloading starts over. The script is what to keep. Computed for real, its runs are kept by the server: build the same study again and they come back without being computed.
