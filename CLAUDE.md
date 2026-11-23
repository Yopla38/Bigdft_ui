# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

A proposal and two browser mock-ups for a BigDFT web workshop (working name: Ondelette), plus material meant to be copied into the PyBigDFT pack (`Pack_pybigdft_HAPS`, a separate repository this one may read but not write). `docs/PROPOSAL.md` is the reference document: concept, architecture, and in §11 what is real, simulated and verified. Everything is written in English.

A third page, Asymille (curve fitting, analysis, figures for publication), is served at `/asymille/`. It is developed in its own repository; here it is a copy (see "Asymille" below).

On the `production` branch the two pages are an application: `backend/` serves them with accounts, a database and a REST API, and each user builds, keeps and computes their own studies. Served as files (`tools/preview.py`) the same pages are still the mock-up, without accounts.

The pages have no package and no build step: plain scripts loaded in order. The tools are standalone Python scripts run with the system `python3` (3.10+, PyYAML the only dependency). The one environment is `backend/` (uv, `backend/.venv`): the application server (FastAPI, SQLAlchemy, Alembic, Pydantic, Argon2) and what lets workshop 2 compute on the HAPS.

## Commands

```bash
python tools/preview.py                   # first workshop (prototype/),  http://localhost:8765, as files: no account
python tools/preview.py 8766 workshop     # workshop 2 (workshop/),       http://localhost:8766, as files: no account
node tools/check_workshop.js              # workshop 2's model against a real BigDFT run, and a study saved and opened again
```

The application (accounts, studies in a database, computing through the bridge on 8791 when it runs):

```bash
cd backend && uv sync
uv run alembic upgrade head               # create or update the database (SQLite in backend/data/ unless ONDELETTE_DATABASE_URL says otherwise)
uv run python -m app.seed                 # an administrator and a demonstration account; run once
uv run python serve.py                    # http://localhost:8766 (workshop 2), /first/ (first workshop) and /asymille/
uv run pytest                             # the API on a database made by the migrations; no HAPS needed
uv run pytest tests/test_studies.py -k revision     # one file, one test
uv run mypy && uv run ruff check app tests serve.py migrations
./update_from_asymille.sh /path/to/Asymille [--apply]     # what differs from Asymille's repository; --apply takes it
ONDELETTE_EMAIL=… ONDELETTE_PASSWORD=… node ../tools/check_live.js    # the example COMPUTED through the server: 18 BigDFT runs, about 3 minutes
```

Run `pytest` and `mypy` after any change in `backend/app`. After a change of `app/models.py`: `uv run alembic revision --autogenerate -m "…"`, read the migration, and never edit a migration that was already applied somewhere. `check_live.js` is the only check that computes, and it costs real calculations (needs the two HAPS served, which is the user's to start, and `backend/bridge.sh [credentials.env]`): run it when `backend/runner.py`, `app/compute.py`, `workshop/js/live.js` or the live branches of `model.js` change, not routinely. Without a HAPS, `ONDELETTE_RUNNER=tests/replay_runner.py` makes the server answer each run with its recorded log, and `check_live.js` then checks everything around the calculation; say which of the two was run. Publishing or unpublishing a HAPS on a remote server is the user's business, never yours; a local stack (`serve_local.sh` of the HAPS) is enough to test.

`check_workshop.js` loads `workshop/js/model.js` in Node without a DOM, rebuilds the example study and checks it against `examples/water-ionisation/` (script character for character, run names, waves, every number). Run it after any change to `workshop/js/model.js`, `prototype/js/blueprint.js`, the registry of steps or a generated file. There is no way to run a single check; the script is one pass that prints `ok`/`FAILED` per line.

The generators double as checks: each one fails when the hand-written part stops agreeing with what it reads.

```bash
python tools/build_steps.py               # StudyActions.py           -> workshop/js/steps.js
python tools/build_logviews.py            # for_pybigdft_pack/build/  -> workshop/js/logviews.js
python tools/build_actions.py             # for_pybigdft_pack/build/  -> prototype/js/actions.js (exit 3: the workshop writes a call or key the version lacks)
python tools/build_prototype_schema.py    # schema/ + ui-tiers.yaml   -> prototype/js/schema.js
python tools/build_targets.py             # config/haps.yaml          -> prototype/js/targets.js
python tools/build_guides.py              # guides/                   -> prototype/js/guides.js
python tools/build_example.py             # examples/water-study      -> prototype/js/example.js
```

`workshop/js/library.js` (the recorded results) needs the run logs unpacked first; the exact command is in the README under "Regenerate what workshop 2 reads". `tools/update_version.sh` chains everything for a new BigDFT/PyBigDFT version and needs a container image (docker or apptainer) where `bigdft` runs; so does `for_pybigdft_pack/repopulate.sh`. Neither is needed for ordinary work on the pages.

## Architecture

### Generated versus hand-written

The governing rule of the repository: whatever describes BigDFT or PyBigDFT is read from the code and generated; only product judgement is written by hand, and a generator checks it. Files starting with `// Generated by tools/… - do not edit` must be changed through their source and tool, never directly:

- `prototype/js/`: `schema.js`, `actions.js`, `targets.js`, `guides.js`, `example.js`, `results.js`
- `workshop/js/`: `steps.js`, `logviews.js`, `library.js`
- `ontology/instances/`, `ontology/corpus/`, `for_pybigdft_pack/data/`, `for_pybigdft_pack/build/<version>/`

`prototype/js/steps.js` is the exception to the name: it is a hand-written sketch of the first workshop, unrelated to the generated `workshop/js/steps.js`.

The README's "Moving to another version" tables say, for each hand-written part, which tool watches it. Two parts have no watcher: the adaptive defaults, checks and cost estimates in `prototype/js/blueprint.js`, and the log keys named in `tools/build_results.py`.

### The two pages

Both pages are single HTML files with no bundler: every script attaches to the global `window.OND` (`OND.Blueprint`, `OND.schema`, `OND.steps`, `OND.model`…), and the `<script>` order in `index.html` is the dependency order. `index.html` is written as page content, without doctype or `<html>` (the form the artifact publishing pipeline expects); `tools/preview.py` wraps it, so open the pages through it rather than from the file system.

- `prototype/` is the first workshop: one calculation as a *blueprint* of seven blocks around a 3D scene, with `blueprint.js` owning parameter values, provenance, adaptive defaults, checks and the compilation to BigDFT YAML and PyBigDFT.
- `workshop/` is workshop 2: a study built step by step. It has two sources of results, chosen at load: the recorded library (served as files by `tools/preview.py`) or BigDFT now (served by `backend/serve.py`, to someone signed in). The model's `live` store holds what came back, under the same identities as the library. Four files know the server and nothing else does: `shared/api.js` (the one function that calls the API, with the CSRF token), `shared/account.js` (signing in, the profile menu, account settings, the administrator's screens; shared by both pages), `store.js` (the user's studies: list, open, autosave with a revision; no DOM) and `live.js` (the waves). `studies.js` draws the list. `app.js` calls `store.changed()` at each redraw; the store compares `model.serialize()` with what it last sent. `workshop/shared` is a symlink to `prototype/js`, so it reuses the first workshop's scene, figures, schema and blueprint; a change in `prototype/js` changes both pages. `model.js` holds the whole study logic with no DOM (inheritance between steps, decisions, run identity, status, waves, the script); `app.js` and `board.js` only draw. `equations.js` (no DOM either) writes what a step computes as TeX: the Kohn-Sham equations of a calculation from its resolved settings (`model.valuesOf`), and what a difference, a combination or a series computes from the links of the step and the energies the model holds; `app.js` typesets it with `MathJax.tex2svg` and shows the plain-character version when MathJax, which comes from the network, is not there.

"Blueprint" is deliberately not called a recipe: in the surrounding ecosystem (aom-memory, pack-kit) a recipe is a consolidated episode of experience.

### One study, three implementations that must agree

A study is a script written with the registry of steps, and the same logic exists in three places:

1. `for_pybigdft_pack/study/StudyActions.py` (the registry: plain functions, read by introspection) and `Studies.py` (the engine: prepare, dry run, analyse). They run inside the pack's container, so they must stay Python 3.7 with no dependency beyond PyBigDFT 0.9.
2. `workshop/js/model.js`, which computes inheritance, run names (30 characters at most), waves and the script the same way in the browser.
3. `tools/build_library.py`, whose `identity()` must stay the same function as `identity` in `model.js`: a calculation is looked up by its input with BigDFT's defaults removed, the geometry it starts from, and the run whose wavefunctions it reads.

`check_workshop.js` is what holds 1 and 2 together, and the library lookup is what exposes a drift in 3 (steps showing "no recorded result").

A study is also a document: `serialize` and `restore` in `model.js` are exact inverses (`check_workshop.js`, part 7), and the server keeps that document as it is. `StudyDocument` in `backend/app/schemas.py` describes the same shape and refuses any field it does not know: a field added to `serialize` must be added there, or every save fails with 422. `backend/app/seed_data/studies.json` is generated by `node tools/build_seed.js` from the model, and `test_studies.py` posts it to the API: that pair is what catches a drift between the two. Never dump the document with `exclude_none`: the page's own dictionaries hold meaningful nulls. `model.calls()` is the single list behind both the script (`script()`) and what the server computes (`plan()`): change a step's arguments there, never in one of the two.

A study can hold several structures: `structure` steps, and calculations placed `on` them. The structure of a step is found by walking up what it continues (`sysOf` in the model, `structure_of` in the engine), and it is part of the identity of a run on both sides. `after` + `on` means "the same calculation on another structure": the page then keeps the first structure's advised settings and re-advises only what belongs to a system (`OF_THE_SYSTEM` in `model.js`). In the engine the study's own structure is `study.system`, because `study.structure` is the step. A step names only steps written before it: anything that inserts steps (`addAtoms`) must keep the list in script order. To add a step: write the function in `StudyActions.py`, name it under its family in the module docstring, run `build_steps.py`.

### Results are recorded, never invented

A page cannot run BigDFT. Workshop 2 shows results only for calculations found in `workshop/js/library.js`, real BigDFT 1.9.1 runs on water bundled from `examples/` and `workshop/library/*.tgz`. A step whose identity is not in the library shows "no recorded result". Keep that property: do not add placeholder or estimated numbers, and label anything simulated as such (as §11 of the proposal does).

### Computing for real: `backend/`

`page → serve.py (app/) → runner.py → MCP bridge (backend/haps_bridge) → dry-run HAPS and HAPS`. `serve.py` only reads the settings and starts the FastAPI application of `backend/app`: `main.py` (pages, static scripts, headers, the API router), `routers/` (auth, account, studies with the waves, guides, admin), `deps.py` (session, CSRF, roles), `compute.py` (the waves), `models.py` + `migrations/` (the database), `schemas.py` (what is accepted), `errors.py` (the one error shape). The page drives the waves (the model decides what is ready) and sends the study as data; `runner.py` rebuilds it with the registry of steps, dry-runs each run through PyBigDFT and the stand-in `bigdft_bin/bigdft-tool`, sends it with `haps_bigdft`, and reads the log with `tools/build_library.read_run`, so a live result has the shape of a library entry. `compute.py` starts `runner.py` in the study's directory, reads the status it writes, and records each result in `run_results`. Things that are easy to break:

- **No code travels from the page.** The API accepts JSON from its own origin only, validated by models that forbid unknown fields, and `runner.build` calls registry functions by name. Do not add an endpoint that executes what it receives.
- **Everything belongs to a user.** A study, a result, a wave is fetched with `owner_id == user.id` in the query itself (`owned`, `job_of` in `routers/studies.py`) and answers 404 otherwise; never fetch by id and compare afterwards. A new table of user data gets an `owner_id` with `ondelete="CASCADE"`, and a test in which a second account gets 404. An administrator sees accounts and jobs, not the content of a study.
- **Every address of the API passes `csrf_guard`** (it is a dependency of the `/api` router in `main.py`): a route added outside that router is unprotected. Sessions are rows (`sessions`), looked up by the digest of the cookie; roles are read from the database at each request, never from the cookie.
- **The study directory persists** (`backend/work/u<user>/s<study>/runs`, named by ids the server gives, never by what the page sends), so a result is trusted only while its digest matches (`runner.signatures`, `forget_stale`). Anything that changes what a run is computed from must be in that digest.
- **One process.** `Compute` holds the processes of the waves it started and a sweeper follows them (`main.follow`); do not add workers, and keep what must survive a restart in the database or in the job's directory.
- **The runner's environment is a short list** (`Compute.environment`): no `ONDELETTE_*` variable reaches it, so neither the database address nor a seed password does. `ONDELETTE_RUNNER` exists for the tests' stand-ins (`tests/fake_runner.py` invents numbers, `tests/replay_runner.py` replays recorded logs): neither is ever the runner of a server people use.
- **The bridge is a copy, and nothing of the HAPS or of the pack is read at run time.** `backend/haps_bridge/` is the pack's MCP bridge, copied unchanged; `bridge.sh [credentials.env]` starts it from `backend/.venv` with `backend/haps.toml` (ours: port 8791, `work/`, a 10 s wait). It reaches the HAPS over HTTP(S) only, so no path to `Demo_ExaAtow` appears anywhere: those directories are renamed and moved, and a path to them broke `bridge.sh` twice on 2026-11-20. Do not bring one back. `backend/update_from_pack.sh /path/to/Pack_pybigdft` is the one moment the pack's location matters: it says which copies differ, and re-copies them with `--apply`.
- **The bridge and the server share one working directory** and the bridge alone holds the HAPS account, for every user of the application. The server refuses to compute when `haps_info` reports another directory.
- **Wavefunctions**: the backend asks the bridge whether they travel (`accepts` line of `haps_info`; the pack's HAPS has it since 2026-11-20, `docs/patches/haps-wavefunctions.patch` is the same change for an older copy) and refuses the step otherwise, because BigDFT would silently start from scratch.
- `haps_bridge/`, `bigdft_bin/`, `bigdft_refused.sh`, `haps_dryrun_client.py` and `xyz_downloader.py` are verbatim copies from the pack: re-copy them (`update_from_pack.sh`) rather than edit them.
- Dry runs are sequential on purpose (PyBigDFT reads the verdict from a directory-wide `debug/`).
- **Look at what is listening before you test** (`ss -ltnp | grep -E ':(8766|8790|8791) '`). The user may be running the real thing: their bridge on 8791 in front of a remote HAPS, their `serve.py` on 8766, with `backend/work/` as its directory and `backend/data/` as its database. A test server started on the default bridge address then computes on their HAPS, with their account. Test on a stack of your own: other ports (`serve.py --port … --bridge … --workdir …`, the local stack with `HAPS_MCP_PORT`), another work directory and another database (`ONDELETTE_DATABASE_URL`), and never a directory of `backend/work/` or a database you did not create. Stop a test server by its process id, not by a pattern that would match theirs.

### Asymille

`asymille/` (the page) and `backend/asymille/` (its engine and API) are verbatim copies from the Asymille repository, taken by `backend/update_from_asymille.sh`: never edit them here. A change of Asymille is made and tested there (`pytest`, `node tools/check_page.js`), then copied. Its own `CLAUDE.md` holds its rules.

`backend/app/asymille.py` is the only code of this repository that knows it: it hands Asymille a `Host` (the base, `deps.current_user`, `get_db`, `AppError`), which makes its tables (`asymille_projects` and `asymille_formats`, in `models.Base.metadata`, created by migrations `0002` and `0003`) and its router (included in the `/api` router, so behind `csrf_guard`). `migrations/env.py` imports that module so that autogenerate sees the tables: after copying a new `asymille/web/tables.py`, run `alembic revision --autogenerate` and read the result. `main.py` serves the page at `/asymille/` and mounts `/asymille/shared` on `prototype/js`: the page signs people in with this repository's `account.js`, not with the stand-in of Asymille's standalone server. `tests/test_asymille.py` holds what must stay true: 401 without a session, 404 for another account, the guards, deletion with the account, and a project built by the page's model in Node accepted by the API.

mypy skips `asymille.*` and ruff excludes it (it is checked in its own repository). Its calculations run in the server's process, in the threads of the requests, a few at a time: the "one process" rule above still holds.

### Where calculations run

`config/haps.yaml` is the only place a service address is written; no secret goes there, only the names of the environment variables that hold them. `backend/serve.py` and `bridge.sh` read the bridge's address from it (8791: the workshop's own bridge; 8790 is the agent's). Preparing and analysing happen where PyBigDFT is (no BigDFT there); the dry run and the calculation are two HAPS applications, `memguess` and `bigdft -n NAME`. The `gpu` and `hpc` entries are placeholders (`example: true`).

### `for_pybigdft_pack/`

Self-contained material for the pack's agent: the installed PyBigDFT API as a Turtle graph, snippets that were each executed in the pack's image, pitfalls tied to the snippets that reproduce them, and the loader. A snippet is evidence because it asserts and was run; a new one only enters the graph through `repopulate.sh`. See its README for the snippet docstring format (`task:`, `stage:`).

Changes meant for repositories this work cannot write go in `docs/patches/` as a patch with a note on how it was tested, not as edits elsewhere.

## Conventions

- The README and the sub-READMEs (`backend/`, `workshop/`, `for_pybigdft_pack/`, `for_pybigdft_pack/study/`) state counts and measured facts (311 variables, 131 recorded calculations, 41 snippets, 39 API tests). When a change moves one of them, update the sentence.
- In the pages, a list or a form changes on screen first and is sent after; when the server refuses, it goes back to what it was and says why. Loading and failure are states that are drawn, not console messages. `Element.replaceChildren` turns `null` into the text "null": filter before spreading.
- Documentation states plainly what was measured, what was not, and what is simulated. Follow that register rather than describing intentions.
- Commit subjects are one plain sentence saying what changed, with a `Workshop 2:` prefix for that page.
