# Ondelette, the matter workshop

Day-one proposal. "Ondelette" (French for wavelet, the basis of BigDFT) is a working name.

Immersive mock-up: <https://claude.ai/artifact/DonwKJb1QPz4ygYwUB5QkY> (shared from its Share menu).
Locally: `python tools/preview.py`, then <http://localhost:8765>.

## 1. The idea on one page

BigDFT can do a great deal and exposes it through 311 input variables (version 1.9.1). The simplest way to "do everything" is neither a form with 311 fields nor an agent everything is delegated to. It is an **object you build**:

> A simulation is a **blueprint of seven blocks** laid around a 3D scene. Each block answers one question. Each value says where it comes from. Whatever you do with the mouse, the agent can do through the same action, and the other way round.

Three views of the same object stay in sync: the 3D scene, the blocks, and the source (the YAML file BigDFT reads, plus the equivalent PyBigDFT script). You can enter through any of them. A beginner touches the scene and a few controls; an expert writes in the source or searches a variable by name. It is the same workshop.

What makes building enjoyable: the scene reacts to every move (the wavelet grid tightens when `hgrids` goes down, spin switches on when a crystal is doped), a gauge says whether the blueprint is ready, the cost is stated before launch, and someone else's work can be replayed like a saved game.

The object is called a *blueprint*, not a recipe, on purpose: in aom-memory and pack-kit a **recipe** is a consolidated episode of experience, and the two must not be confused.

## 2. What I examined

| Source | What I take from it |
|---|---|
| `bigdft-suite` upstream (GitLab `l_sim`), tag 1.9.1 and the development branch of 2026-09-25 | `input_variables_definition.yaml` of BigDFT, PSolver and CheSS: the code loads these files itself, so they are the source of truth. 311 variables in 1.9.1 (313 on the development branch), with defaults, bounds, allowed values, activation conditions and named profiles (`linear`, `mixing`, `water`…). |
| PyBigDFT (`InputActions.py`, `Calculators.py`, `Fragments`, `BioQM`, `PostProcessing`) | About fifty high-level actions (`set_xc`, `optimize_geometry`, `set_implicit_solvent`…). They already are "moves": the mock-up emits real PyBigDFT. |
| `l_sim/ia_tools/pack/pack_pybigdft` | **The existing PyBigDFT pack.** Its container (`bigdft/runtime` pinned by digest, BigDFT 1.9.1), its tools (`run_in_container`, `parse_bigdft_log`, `visualize`, `download_xyz_for_bigdft`, `declare_file`, `query_memory`), its skills, its ontology (namespace `http://bigdft.org/onto#`), its tutorials corpus. The workshop builds on it. |
| `l_sim/ia_tools/agent-slapsci` (v0.4.1) | The agent engine: one YAML per agent or pool, a permission gate, and a **wire protocol** (events out with a sequence number, commands in) that a browser can speak over a WebSocket. Also the **renderer** contract. See §7. |
| `l_sim/ia_tools/pack-kit` (v0.7.0rc8) | What a pack is, how it is served (A2A), how libraries publish their interface (panels), how files and containers are declared. See §7. |
| `l_sim/ia_tools/aom/aom_memory` | The experience memory (episodes, verdicts, recipes) and its export to **Capsule-Maker**: what a capsule actually contains. See §7. |
| `BigDFT-group/capsule-maker` | **The capsule format** (1.0 and 1.1): a directory with `manifest.json`, typed records, an inventory with SHA-256 digests, a review, and lineage from a parent capsule. Also the published artefacts of a real BigDFT campaign, which the mock-up now shows. See §3 and §7. |
| AOM format 1.0.1 (`hopa_aom/aom_format`) | SQLite file with six tables, facts with mandatory provenance, pivots for n-ary relations, artifacts for verbatim content. See §5. |
| Your fork `Yopla38/BigDFT` | Dated 2017. I worked on upstream. |
| `BigDFT-group/llm-hackathon-2025` (LARA-HPC), OntoFlow | remotemanager, the BigDFT-school notebooks, earlier ontologies. |
| OneAngstrom partner program | SAMSON SDK, SAMSON Connect marketplace, no fixed fee, a percentage of sales, usage-based billing of cloud services called from SAMSON. SAMSON is a desktop application. See §9. |
| V_Sim (`l_sim/v_sim`, 3.9.0 tagged June 2025) | Desktop application. See §9. |
| Paper2Agent (arXiv 2509.06917) | Turns a paper and its code into a tested MCP server. See §7. |
| WEAS, Mol\*, 3Dmol.js | See §8. |

Not read: `Pack_pybigdft_HAPS`, which lives on a local machine this cloud session cannot reach, and the platform pack-kit was extracted from.

## 3. The seven blocks

| Block | Question | BigDFT sections | Essential controls |
|---|---|---|---|
| **Matter** | What are we talking about? | `posinp` | structure, cell, boundary conditions, fragments, atom editing |
| **Theory** | How are electrons described? | `dft`, `sic`, `mode` | `ixc`, `nspin`, `mpol`, `qcharge`, `dispersion` |
| **Accuracy** | At what numerical price? | `dft`, `mix`, `lin_*`, `chess` | `hgrids`, `rmult`, `gnrm_cv`, cubic or linear scaling |
| **Environment** | What is around it? | `kpt`, `psolver.environment`, `dft.elecfield` | k-points, implicit solvent, field, electronic temperature |
| **Task** | What is asked? | `geopt`, `md`, `tddft` | energy, relaxation, dynamics, path (NEB), excitations, fragments |
| **Observables** | What do we want to see? | `output`, `lin_general` | density, orbitals, DOS, dipole, charges |
| **Machine** | Where, and for how much? | `perf`, `psolver.setup` | target, cores, GPU, budget |

The order is the order in which a physicist states the problem. Boundary conditions live in Matter because they are a property of the cell (`posinp.cell`); their consequences (k-points, field) live in Environment.

### From one blueprint to a study (proposed)

A blueprint is one calculation. Real work is rarely one calculation, and BigDFT's own tooling says so:

- PyBigDFT has a `Datasets.Dataset` class for "series of calculations" and "ensemble calculations", with `append_run`, `fetch_results` and `seek_convergence`.
- `read_orbitals_from_disk` restarts from the wavefunctions of an earlier run (in linear mode, from its support functions and kernel), and `connect_run_data(inp, log)` attaches the data of a previous logfile to a new input.
- The `linear_fragments` profile is documented as needing "templates ready": a fragment calculation reuses the support functions of an earlier template run (`inputpsiid: linear_restart`).
- All six BigDFT-school notebooks shipped as guided paths run more than one calculation. Three run BigDFT inside a loop (grid convergence, a rotation scan, linear-scaling parameters) and the N₂ tutorial chains five runs.
- The PyBigDFT pack has a `Workflow` class in its ontology and tutorials on datasets and on AiiDA workflows; pack-kit's schema template lets a recipe be `composedOfStep` other recipes.

So composition belongs in the product. I propose a **study**: blueprints snapped together by three kinds of typed link.

| Link | What flows | Typical use |
|---|---|---|
| **Series** | one blueprint, one parameter swept | convergence in `hgrids` or k-points, a scan along a coordinate |
| **Hand-over** | geometry, wavefunctions, support functions or density from one run to the next | relax then compute a spectrum; cubic run then virtual states; template then fragments; relaxed end points then a path |
| **Combination** | several results into one derived quantity, written as a formula | $E_{\mathrm{ads}}=E_{\mathrm{complex}}-E_{\mathrm{sheet}}-E_{\mathrm{molecule}}$, atomisation and formation energies |

A link is checked like a parameter: a wavefunction hand-over needs the same grid, a fragment template needs the same species. The study states its total cost before launch, re-runs only what a change invalidates downstream, and its execution is a chain of episodes, so a capsule of a study replays as one.

The **Study** space of the mock-up shows a real one: the ΔSCF triplet energy of the tetrapeptide 6a (77 atoms), computed with BigDFT 1.9.5 on TSUBAME4.0 and published with its logs in `BigDFT-group/capsule-maker`. Eleven blocks: a starting geometry, two grid series, single points, two relaxations (one set aside by the researcher), PBE0 stages still queued, and two formulas. The board is drawn natively (HTML cards, SVG links) rather than with Cytoscape.js, because a block has to carry live content: a status, a typeset formula, later a thumbnail. Cytoscape.js keeps its place for large graphs such as a memory.

### A study is a script, and the board is how you write it

The real capsule makes the point: its pipeline *is* code. `procedures/make_inputs.py` writes every input with PyBigDFT (one function, loops for the series, a relaxed geometry read back for the next stage); `procedures/dry_run.py` has BigDFT check them all; job scripts run them, one variant first copying the wavefunctions of an earlier run; `analysis/summarize.py` applies the formulas; a test recounts the evidence. The Study space shows these five steps with the capsule's own files, unchanged.

So **relaunching** a study means running that code again, in the pack's container or on the cluster: only what is missing (the queued PBE0 stages), everything (to check that the capsule reproduces, new energies compared with the recorded ones), or what lies downstream of a change. What the workshop's Run tab does today for the tetrapeptide is a *reading* of the recorded log, and says so. Nothing is executed in the mock-up.

For someone who does not write Python, the board is the editor. "Build your own" starts from the blueprint made in the workshop and offers three gestures on a block:

1. **Vary a setting**: the block becomes a series (grid spacing, extent of the regions, functional).
2. **Continue from it**: a new block that relaxes the geometry, computes another spin state, recomputes with a hybrid functional or computes excitations, taking the geometry and, where it applies, the wavefunctions.
3. **Compare it** with another block: a formula on the energies, in eV, kJ/mol or hartree.

Each gesture rewrites `study.py`, shown beside the board: a `blueprint()` function with the workshop's settings, one entry per run, a `run()` that dry-runs or runs in dependency order with the hand-over procedures the real capsule verified, and an `analyse()` with the formulas. The links are checked as parameters are: a difference between a series and a single run is refused (it would mix grids), and so is taking the wavefunctions of a series. The script has the same shape as the capsule's, so that a study built by hand and a study received in a capsule are the same object. Reading a capsule's script back into a board is the next step; it is not done.

### Results: a view is a description, code is the exception

`tools/build_results.py` reads the BigDFT logfiles of that campaign and writes a small typed result set (40 single points, 4 relaxations). Every number of the Study space comes from it. Three ways to get a view, from no code to code:

1. **From the catalogue.** A view is attached to a kind of result: a series, a trace, a trajectory, a spectrum, a comparison. It is a short declarative definition (which runs, which quantity, unit, scale, grouping), shown under each figure. The workshop draws it. Nothing is executed.
2. **Describe it.** The agent answers a request with a view definition, approved like any change to a blueprint. In the mock-up, asking how the triplet energy depends on the grid adds a figure that needs no code, because the data are already extracted. The agent writes code only when they are not.
3. **An analysis cell.** Python, for what no view covers. It runs in the pack's container, beside the calculation: read-only on the run's files, no network, time and memory limits. This is the confinement pack-kit already gives an agent (a launcher that only knows `apptainer exec --containall --cleanenv` on one mounted folder, the agent itself under Landlock). The cell must return a **table**, not a picture: the workshop draws it, so the figure stays consistent, themed and exportable. The cell is saved with the study, declared with its digest, and travels in the capsule as a procedure. Written by the agent, it passes the same approval. A cell that proves useful can be promoted to the catalogue by a maintainer.

This answers the question of where user code may run. Not in the page and not on the platform: nothing a user writes ever executes there. Not "agent only" either: a researcher must be able to do without it. Free plotting code is the escape hatch, not the path: an image made by a script can be attached, but it cannot be restyled or re-exported, and it is marked as such.

What makes the figures publishable: one renderer for the screen and for print. "Journal, 1 column" draws the figure at 85 mm with 7 pt type, as it will be printed; the SVG that is shown is the SVG that is copied, with every colour resolved. Each figure has a title that states the finding, a caption written from the numbers, a table view of its data, and a palette checked for colour-vision deficiency. What makes them honest: a converged run that warned is shown with its warnings; a queued stage is shown as queued; a criterion fixed before the calculations is drawn before the result exists.

Two things the real logs allowed me to check. With the localisation radii BigDFT printed, the workshop's own count of coarse and fine grid points matches BigDFT's on all twelve grids of the study to within 0.03 %: the grid drawn in the scene is the grid that is computed. And the time and memory estimates are now fitted on these runs instead of guessed.

A **dry run** comes before a run. The researcher of that study made it a rule ("every BigDFT input must first pass a dry run"): BigDFT builds the input, counts electrons and grid points and estimates memory without a self-consistent step. The workshop has the button next to Run.

## 4. 311 parameters, three depths

Nothing is copied by hand. `tools/extract_schema.py` reads the BigDFT source and writes `schema/bigdft-input.schema.json`. `schema/ui-tiers.yaml` holds only the product decision: for each variable, its block and its depth. Generation fails if a listed variable no longer exists upstream, so a BigDFT upgrade cannot leave an orphan control.

| Depth | Count | Form | Criterion |
|---|---|---|---|
| Essential | 29 | a control drawn on the block | changes the physics or the cost, and a beginner can understand the question |
| Advanced | 68 | an editable row, one click away | regularly useful to a practitioner (mixing, NEB, thermostat, localisation radii) |
| Expert | 214 | full-text search over the whole code | internal numerical settings, debug outputs, experimental options |

What becomes a "button", and why:

- **`hgrids` and `rmult`**: the two settings that make the quality of a wavelet basis. They are *visible*: the scene shows a slice of the two-level grid, and the number of degrees of freedom $N_c + 7N_f$ feeds the memory and time estimate.
- **`ixc`, `nspin`, `mpol`, `qcharge`**: the minimal physics. The aliases of the source (`PBE`, `PBE0`, `B3LYP`…) become the offered choices.
- **`inputpsiid`**: shown as a choice of algorithm (cubic or linear), not as an integer.
- **Profiles** (`linear`, `mixing`, `water`): the code's own presets. The interface calls them with `import`; it does not copy their values.
- **Activation conditions** of the source (`CONDITION / MASTER_KEY`) drive what is shown: `nimg` appears only for NEB, the thermostat only for dynamics.

What does *not* become a button: the 49 `perf` variables (except acceleration and a few analyses), the internal tolerances of CheSS, the block sizes of the input guess. They remain reachable in Expert mode and in the source.

## 5. Defaults that adapt, and say why

Every value carries a provenance: **BigDFT default**, **Adapted**, **You**, **Agent**, **Paper**, **Guide**. An adapted value never overwrites a human choice: when the advice differs it is shown beside the value with a "Follow the advice" button.

Advice and consistency checks name the parameters they involve. A notice appears at the top of every block that owns one of those parameters, even when the cause sits in another block: choosing the linear algorithm with a k-point mesh shows the conflict in Accuracy, with a "See parameter" link to the k-points of Environment. Pointing at a notice highlights the controls concerned; following the link opens the block, scrolls to the control and flashes it.

In the mock-up a dozen rules are hard-coded to show the behaviour. All are grounded in the code or its documentation:

- odd electron count → collinear spin, moment of the same parity (try it: substitute one Si with P);
- gapless system → `mixing` profile;
- periodic system → k-point mesh from the cell size;
- D3 requested with surface boundary conditions → refused with the reason (PyBigDFT: "only works with Free Boundary conditions");
- electric field along a periodic direction → refused (documentation of `elecfield`);
- biomolecule → implicit water with a soft-sphere cavity, SQNM with `biomode`.

In production these rules are **facts of the pack's memory**, not code. pack-kit's schema template already has the right shapes for advice, and I align on them instead of inventing a parallel vocabulary:

| What the interface needs | In the memory |
|---|---|
| "in this kind of case, that parameter takes this value" | a `Prescription` pivot (`onParameter`, `appliesInContext`, `prescribesValue` / `prescribesNumeric`, `justification`) |
| a blocking check versus a comfort recommendation | `isMandatory` on the prescription |
| "this combination fails" | a `Pitfall` (symptom, affected parameter, remedy, silent or loud failure) |
| the "why?" under a value | the triplet, plus the passage in `memories` linked through `triplet_sources` |
| exact facts about a parameter (default, bounds, section, block, depth) | the **workshop layer** below, loaded without an LLM |

Two files implement the last row:

- `ontology/workshop_layer.ttl`: an uninstantiated layer (5 classes, 12 properties) in the namespace of `pack_pybigdft` (`http://bigdft.org/onto#`, no name clash with its 59 terms). It adds only what the interface needs: section, block, tier, default, bounds, allowed values, activation dependency, profiles. It is descriptive on purpose: advice stays a `Prescription`.
- `ontology/instances/bigdft-parameters.ttl`: the 311 parameters, 20 sections and 9 profiles of BigDFT 1.9.1 as instances, generated from the source. It is meant for pack-kit's `ttl_instances` loader, which writes facts without an LLM call. A default of 0.45 paraphrased into "about 0.45 bohr" would be a wrong fact carried silently.

`ontology/corpus/bigdft-variables.md` carries the prose descriptions, one Markdown section per variable, for a `sources.yaml` entry using the `markdown_sections` preprocess. Given the n-ary nature of the advice ("this value, *for* that kind of system"), the pack should use `triplet_mode: nary`.

Both Turtle files parse and cross-reference cleanly (checked with rdflib: no undeclared term, no dangling reference). They have **not** been run through `pack_kit.learn` or `aom_ingest`, which are not installed here.

## 6. The five spaces

1. **Workshop**: build, run, analyse. The heart.
2. **Library**: capsules to replay, papers to rebuild, guided paths. A guided path is a Jupyter notebook: an administrator adds one from the Library, reviews what the importer understood (steps cut at the headings, PyBigDFT calls turned into moves on the blueprint, installation cells folded away) and publishes it. The six paths shipped are the BigDFT-school notebooks, read by that same importer. Nothing in a notebook is executed.
3. **Lab**: shared projects, comments anchored on an atom or a curve, live presence.
4. **Compute**: execution targets, queue, credits, expertise offers.
5. **Publish**: figure at journal size, methods paragraph and references written from the blueprint, equations in LaTeX.

References will come from `bigdft_bibliography.yaml`, which the code already maintains.

## 7. Where the workshop sits in the existing ecosystem

The workshop should bring no agent plumbing of its own. It is a **browser front-end and a host for packs**, and almost every mechanism it needs already exists.

| Existing piece | Role for the workshop |
|---|---|
| **The PyBigDFT pack** (`pack_pybigdft`) | The engine room. Its container digest is what the Machine block shows; its tools are what runs. The workshop adds blueprint actions next to them, it does not replace them. |
| **A pack per code** (pack-kit) | BigDFT now; GROMACS later is a second pack, not a rewrite. |
| **agent-slapsci's wire protocol** (`service/protocol.py`): events out, each with a `seq`; commands in (`Send`, `Approve`, `Choose`, `Cancel`, `Resume`…) | The Agent drawer is one more front-end of this protocol, over a WebSocket. A browser that reconnects asks for everything after the last `seq` it saw. The existing transcript page (three static files and KaTeX) can be embedded unchanged. |
| **The permission gate** (`allow / ask / deny`), `APPROVAL_REQUESTED` then `ApproveCommand` | The *Approve / Reject* card of the mock-up. In the PyBigDFT pack `declare_file` is already on `ask`. |
| **Renderers** ("data plus one drawing per front-end"; today the choice menu) | The natural way for the agent to reach the scene. Three renderers to add: a **blueprint diff** (changes to approve), a **scene** (structure and overlays), a **plot**. Their rules already fit: fail closed with no client, always carry a text floor, a replayed request is inert. |
| **The journal** (`sessions/<id>.events.jsonl`, append-only) | The raw trace of a session, and what a replay reads. |
| **A2A server** of a pack, tasks in `input-required` | How a user's head agent reaches a deployed pack; approvals travel up the same way. |
| **`declare_file` and `MANIFEST.json`** (path, role, sha256, `derived_from`) | The files of a blueprint are declared, not guessed. `derived_from` gives the "Paper" and "Agent" marks a verifiable origin. |
| **Panels** (`pack_kit.panels`, capability vocabulary) | The workshop embeds aom_web's memory console and maps roles to `read / ingest / curate / purge / configure / optimize` once. |
| **Experience memory** (aom-memory): one episode per intention, the researcher's verdicts (accepted, corrected, rejected), judged episodes consolidated into recipes | What happened, and what was learned from it. Recipes feed the Library and the advice. |
| **Capsule-Maker** | **What a capsule is**: a goal, typed records (context, decision, correction, failed attempt, result, hypothesis, question, procedure, evidence) with a status (verified, superseded, unresolved, hypothesis, unverified), the files behind them with their digests, a review. A capsule can extend a parent (C1 → C2) and embeds it, so lineage verifies alone. Inspecting, importing and verifying never run code; running its tests is a separate act of trust. The Study space shows the real C2 capsule of the 6a campaign: 88 records, 173 files. |
| **LLM policy** (a pack never ships a model; the user's choice first) | The platform does not impose a model. |

What this changes in the design:

- **The capsule tab shows records, not just steps.** The replay example uses Capsule-Maker's kinds and statuses. "Fork" is `extend`: a child capsule with its parent embedded. The real capsule is browsed by kind in the Study space, each record with who decided (tool, researcher, AI, paper).
- **One action layer** (`blueprint.set`, `system.edit`, `job.submit`, `figure.render`…) serves the interface and the pack's tools (agent-slapsci `native:` functions), and an MCP server where one is wanted. The agent cannot do anything that is not visible and undoable in the interface.
- **The interface describes the code that runs.** The schema is extracted from the tag the pack's container pins (1.9.1), not from the development branch. `tools/diff_schema.py` reports what an upgrade changes and fails if a curated control would disappear. Today: 8 variables added and 6 removed between 1.9.1 and development, no default changed, no curated control lost.
- **Known silent failures become impossible by construction.** The pack's `xyz_downloader` documents one: a standard XYZ file carries no unit and BigDFT then reads it in bohr without a word. A blueprint always writes its units.
- **Paper → blueprint**: the Methods section is mapped onto blocks, each value marked "Paper" with its source passage; what the paper does not say is completed by the adviser and flagged. When a paper ships code, Paper2Agent can turn it into an MCP server added to the head agent's toolbox.

## 8. Proposed architecture

```mermaid
flowchart LR
  subgraph Browser
    UI[Workshop: blocks, inspector, source]
    S3D[3D scene, WebGL2 then WebGPU]
    PAN[Embedded panels:<br/>memory console, transcript]
  end
  subgraph Host platform
    API[Action layer<br/>blueprint, system, job, figure]
    ADV[Adviser]
    ORC[Job orchestrator]
    DB[(Projects, blueprints,<br/>action journals)]
    OBJ[(Workspace compartments,<br/>volumetric data)]
  end
  HEAD[Head agent<br/>agent-slapsci]
  subgraph BigDFT pack
    A2A[A2A server]
    MEM[(Domain memory, AOM)]
    EXP[(Experience memory)]
    CT[Pinned container<br/>PyBigDFT]
  end
  HPC[HPC through remotemanager]
  UI <--> API
  S3D <--> API
  PAN -.-> MEM
  HEAD <--> A2A
  A2A --> API
  API --> ADV --> MEM
  A2A --> MEM
  A2A --> EXP
  API --> ORC --> CT
  ORC --> HPC
  CT --> OBJ
  API <--> DB
```

Structuring choices:

- **Schema first.** Server-side validation models, forms and the parameter graph are generated from the same JSON.
- **Server in Python**, because PyBigDFT is native there (building the input, incremental reading of the YAML logfile for live convergence, post-processing) and so are pack-kit and the AOM bricks.
- **Blueprint state as a shared document** (CRDT), for multi-user editing and for the action journal capsules are made of.
- **3D scene: own engine on three.js.** The mock-up shows it is tenable: instanced atoms and bonds, periodic images, grid slice, isosurfaces computed in the browser. No existing library covers molecules, crystals, surfaces, the wavelet grid and editing together. WEAS (MIT, three.js) is the closest for materials but is a small project. Mol\* is the reference for large biomolecules: I propose to integrate it as a representation engine when the biology side arrives, rather than rewriting ribbons and surfaces.
- **Volumetric data**: `cube` files converted server-side into a multi-resolution pyramid, isosurfaces extracted in a worker.
- **Export**: high-resolution PNG and SVG/PDF from the scene, glTF and POV-Ray for rendering, RO-Crate for data deposit.

## 9. OneAngstrom and V_Sim

**OneAngstrom (SAMSON).** The program offers an SDK, a marketplace, licence and payment handling, and usage-based billing of a cloud service called from SAMSON. SAMSON is a desktop application that already has a GROMACS wizard running calculations in the cloud. My reading: SAMSON is a **distribution channel**, not the foundation of a web site. A "BigDFT" extension in SAMSON would be a thin client of our action layer (same blueprints, same credits), reaching their user base without duplicating the engine. To validate with them: the terms of the fee, whether our accounts can be linked, whether a web component exists.

**V_Sim.** A desktop application maintained by L_Sim that knows BigDFT's formats natively. It cannot be embedded in a page as it is. Three possible uses, to discuss with its maintainer: (a) publication-quality rendering on the server, headless; (b) reuse of its format readers and representation conventions; (c) an "open in V_Sim" link for those who already use it.

## 10. Proposed build order

| Step | Content | Proof |
|---|---|---|
| 0, done | Schema extracted for the pinned version, curation, mock-up, notebook importer and six guided paths, workshop layer and parameter graph | this repository |
| 1 | Action layer, models generated from the schema, pinned PyBigDFT container, live convergence | a real H₂O calculation launched from the page |
| 2 | Production scene: XYZ/PDB/CIF import, editing, `cube` reading, real results | density and orbitals of a real run in the scene |
| 2b | Studies: series first (convergence), then hand-overs, then formula nodes | a grid-convergence series and an adsorption energy composed in the page |
| 3 | Host `pack_pybigdft`: adviser reading its memory, Agent drawer on the wire protocol with approvals, the three renderers, panels embedded, capsules exported and replayed | a capsule replayed and verified end to end |
| 4 | Projects, sharing, anchored comments, presence | two people on the same scene |
| 5 | Credits, estimate calibrated on past runs, HPC through remotemanager, expertise offers | a billed calculation |
| 6 | Publish: vector figures, methods, references, RO-Crate; paper → blueprint | a figure and its paragraph usable as they are |
| 7 | Opening: a GROMACS pack, QM/MM, SAMSON extension | a hybrid blueprint |

## 11. What the mock-up is, and is not

Real in the mock-up: the 311 variables and their tiering, the pack's container digest, the structures (built by exact geometry), the two-level wavelet grid, the adaptation and checking logic with its links between parameters, the notebook importer and the six guided paths, the generated YAML and PyBigDFT, the whole Study space (structure, energies, convergence traces, orbitals, relaxations, warnings, capsule records, all read from published BigDFT logs), the bibliographic references.

Simulated: execution (no calculation runs; for the tetrapeptide 6a the Run tab replays the recorded run, labelled as such), result values of the other systems, isosurfaces (superposition of toy orbitals, marked "illustration"), times and costs (uncalibrated orders of magnitude), prices, people and example projects. The agent knows three moves. Notebooks an administrator adds are kept in that browser only: there is no server behind the mock-up. The pipeline script written by the study builder is valid Python but has not been run against BigDFT.

Verified: renders without error in Chromium, light and dark themes, at 1440, 1024, 768 and 400 px, with an automated pass for horizontal overflow, clipped text, small targets and equation errors on every block, tab, space and guide step; substitution → spin, paper → blueprint, capsule, run, agent approval, publish, notice → parameter, guided path and notebook import flows; behaviour when the 3D or math libraries fail to load. Equations were checked against their sources (Kohn-Sham with the density, the wavelet expansion of Genovese et al. 2008, the generalised Poisson equation, forces, the density kernel). Not verified: Safari and Firefox; the per-element localisation radii (approximate values); the generated `input.yaml` has not been fed to a real BigDFT.

## 12. Questions to move forward

1. **Existing platform.** pack-kit says it was extracted from a platform monorepo (FastAPI backend, React frontend, a runner with sidecars). Is the workshop to be built inside that platform, or beside it as a second host?
2. **`Pack_pybigdft_HAPS`.** I could not reach `/home/yopla/PycharmProjects/Pack_pybigdft_HAPS`: this session runs in a cloud container. Push it to a repository I can read, or run a session on that machine, and I will wire the dry run and the real launch to its commands.
3. **Workshop layer.** Should `ontology/workshop_layer.ttl` be merged into `pack_pybigdft`'s schema, or kept as a separate layer loaded beside it?
4. **Compute at launch.** The pack's Apptainer container alone, or a specific cluster from the start?
5. **First audience.** Teaching, materials researchers, or biology? This sets the order of steps 2 to 4.
6. **Openness.** The repository is MIT-licensed. Will the platform be open, or only parts of it?
7. **OneAngstrom and L_Sim.** Do you already have contacts? Two draft letters are in `docs/letters/`.
