# Backend: workshop 2 computes for real

A web page cannot start BigDFT and must not hold the account of a HAPS. This directory is the part of the application that runs beside the page, on the user's machine: it serves workshop 2, and when a step is computed it prepares the runs with the registry of steps, has BigDFT check each input on the dry-run HAPS, sends the calculation to the HAPS, and reads the logs that come back.

```
page ──► serve.py ──► runner.py ──► MCP bridge ──► dry-run HAPS : memguess NPROC NAME dd l
 :8766               one wave       :8791          HAPS         : bigdft -n NAME
                     PyBigDFT       (bridge.sh)    (ebservice, ebuffer, the two runtimes)
```

No BigDFT here, no container, no image: PyBigDFT is installed without BigDFT (`pybigdft==1.9.6.1`, the version the pack runs). No account either: the bridge holds it.

## Run it

Three things must be up. The first is the HAPS operator's; the other two are this directory's.

```bash
# 1. The two HAPS, served: in the pack's HAPS directory, by whoever operates them
./serve_remote.sh                        # or ./serve_local.sh for the local stack

# 2. The workshop's bridge, on 8791, with this directory's work/ as its working directory
cd backend
./bridge.sh /path/to/haps ~/.config/haps/aqmo-test.env      # the same credentials file as serve_remote.sh
./bridge.sh /path/to/haps                                   # with serve_local.sh: no file

# 3. The page and its server
uv sync                                  # once
uv run python serve.py                   # http://localhost:8766
```

`serve.py` says at start whether the bridge answers and whether wavefunctions travel through it. The page then shows "BigDFT on the HAPS" and a switch, "Recorded | Compute": on "Compute" every step is computed now; on "Recorded" it is the mock-up, with the library of recorded results. Opened with `tools/preview.py`, no server answers and the page is the mock-up.

`/path/to/haps` is the directory that holds `haps.toml` and `pybigdft_haps/`. The bridge is that code, started a second time: the agent's bridge stays on 8790 with the agent's sandbox, this one has its own port and its own directory. Nothing is published by `bridge.sh` and nothing computes in it.

Check the whole chain, from the model of the page to BigDFT and back (it computes: 18 runs, a few minutes):

```bash
node tools/check_live.js http://127.0.0.1:8766
```

## What happens when a step is computed

1. The page decides what the wave is, as it does on recorded results: every run that waits for nothing (`workshop/js/model.js`). It sends the study as **data** — the structure and the calls of the registry of steps, the same list its script is written from — and the names of those runs (`workshop/js/live.js`).
2. `serve.py` checks that the bridge is ready and works in the same directory, and starts `runner.py` for that wave in `work/<study>/`.
3. `runner.py` rebuilds the study with `for_pybigdft_pack/study` and prepares the runs asked for. `SystemCalculator(dry_run=True)` calls `bigdft_bin/bigdft-tool`, which asks the bridge for a dry run (`haps_dryrun`): BigDFT's own input check, a few seconds. A refused input stops there, with BigDFT's message.
4. Each run that passed is sent with `haps_bigdft` and followed with `haps_result` until it ends. The files BigDFT wrote come back into `work/<study>/runs/`.
5. The log is read as `tools/build_library.py` reads the recorded ones (`read_run`): the page receives a result of the same shape as an entry of its library, and shows it with the same views.
6. The page hands the results to its model under the identity of each calculation, and asks again: what was waiting for a relaxed geometry or for wavefunctions is now ready. That is the next wave.

## What is kept, and when it is computed again

`work/<study>/` holds the runs of a study: `runs/NAME.yaml`, `runs/log-NAME.yaml`, the relaxed geometries, the wavefunctions that are read by another step, `runs/manifest.json`, and `study.py`, the script of the page as it stood at the last wave (kept for the reader; never executed). A run computed stays computed: reload the page, load the same study, press Compute, and the server answers from what it holds.

A result is kept only while it still answers the study. `runner.py` records, for each run it sends, a digest of what it is computed from: its input, the structure or the run whose relaxed geometry it starts from, the run whose wavefunctions it reads. Before a wave, any run whose digest changed is dropped, with what was computed from it.

A run that another step reads the wavefunctions of must have written them. If it was computed before anything read it, it is computed once more, the same calculation, writing them.

## What a failure looks like

| On the page | Meaning | What to do |
|---|---|---|
| "refused by BigDFT's dry run: …" | BigDFT's input parser refused the input; nothing was computed | change the setting the message names |
| "BigDFT stopped (exit n): …" | the calculation started and ended in error | read `work/<study>/runs/log-NAME.yaml` |
| "stopped by the HAPS…" | longer than `limits.max_timeout_s` of `config/haps.yaml` | `serve.py --timeout`, within what the runtime allows |
| "the HAPS did not run it…", "no answer after…" | the service or the runtime, not the input | look at the runtime; then "Try again" |
| "this HAPS does not take wavefunctions…" | the step starts from the wavefunctions of another, and the HAPS would drop them | apply `docs/patches/haps-wavefunctions.patch` to the HAPS |
| "The HAPS is not ready" (top of the page) | the bridge does not answer, or an application is not published | start `bridge.sh`; ask the operator of the HAPS |

A run that failed is not sent again by itself: "Try again" on the step does it.

## Files

| File | Role |
|---|---|
| `serve.py` | The page and five addresses (`/api/info`, `/api/compute`, `/api/jobs/ID`, `/api/jobs/ID/cancel`, `/api/structure`). Local only, and only for its own page |
| `runner.py` | One wave: rebuild the study from data, drop stale results, dry-run, send, read the logs |
| `haps.py` | The client of the bridge: the tools it calls and how their answers are read |
| `bridge.sh` | Starts the HAPS's own bridge a second time, on the workshop's port and directory |
| `bigdft_bin/`, `bigdft_refused.sh`, `haps_dryrun_client.py` | Copied unchanged from the PyBigDFT pack (`tools/`): the stand-in `bigdft-tool` that sends PyBigDFT's dry run to the bridge, and `bigdft`, `abscalc`, `frequencies`, which refuse |
| `xyz_downloader.py` | Copied unchanged from the pack too: asks PubChem for the 3D structure of a molecule and writes it in BigDFT's `.xyz`, unit included. `/api/structure` calls it and hands the text to the page; the files stay in `work/.structures/` |
| `pyproject.toml`, `uv.lock` | The environment: PyBigDFT without BigDFT, the MCP client, PyYAML, and `ase` and `requests` for the downloader |
| `work/` | The studies (not in git) |

## Structures

A study can hold several structures (see `workshop/README.md`). Three of their sources need nothing from the server: the built-in systems, an atom, a file read in the page. The fourth does: a molecule by its name is one request from this server to PubChem, with the name typed and nothing else. The name is checked before it is put in an address (letters, digits, spaces and a few signs).

The server is sent every structure with the study, as data. A result is kept only while the structure it was computed on is the one the study names now.

## Limits

- One machine: the page, `serve.py` and the bridge share a directory. Nothing here is a multi-user service.
- Dry runs go one after the other, about five seconds each through the HAPS: PyBigDFT reads BigDFT's verdict from a directory-wide `debug/`, so two at once could not be told apart.
- Results are read from the log. Orbitals and densities as volumes are not fetched.
- A wave can be stopped; the HAPS is then asked to stop its jobs. A job the bridge has not named yet (its first ten seconds) cannot be.
- Systems other than water go the same way, but only water was computed through this chain.
