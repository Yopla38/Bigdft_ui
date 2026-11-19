# Bigdft_ui

A web workshop for BigDFT: build a simulation around a 3D scene, run it, analyse it, share it, publish it.

The proposal is in [`docs/PROPOSAL.md`](docs/PROPOSAL.md). Working name: Ondelette.

## Contents

| Path | Role |
|---|---|
| `docs/PROPOSAL.md` | Concept, parameter analysis, place in the pack-kit ecosystem, architecture, build order, open questions |
| `docs/letters/` | Draft letters (OneAngstrom, L_Sim) |
| `schema/bigdft-input.schema.json` | The 311 input variables of BigDFT 1.9.1, PSolver and CheSS, extracted from the source. This is the version the PyBigDFT pack's container pins |
| `schema/bigdft-input.devel.schema.json` | The same for the development branch (313 variables), to anticipate an upgrade |
| `schema/ui-tiers.yaml` | Product decision: block and depth of each variable |
| `ontology/workshop_layer.ttl` | Uninstantiated layer a BigDFT pack schema can merge |
| `ontology/instances/bigdft-parameters.ttl` | Generated parameter graph, for pack-kit's `ttl_instances` loader |
| `ontology/corpus/bigdft-variables.md` | Generated descriptions, one section per variable, for `markdown_sections` |
| `guides/` | Guided paths: the Jupyter notebooks, a manifest, and how they are read |
| `prototype/js/results.js` | Real results, extracted from the logs of a BigDFT campaign published in `BigDFT-group/capsule-maker` (MIT) |
| `config/haps.yaml` | Where calculations run: addresses, limits and capabilities of each HAPS. The only place an address is written |
| `docs/patches/` | Changes proposed for repositories this work may read but not write, tested on a copy |
| `for_pybigdft_pack/` | For the PyBigDFT pack's agent: the installed API as an instantiated graph, 41 snippets executed in the pack's image, 24 pitfalls, the loader, and one command to rebuild it for a new version. See its README |
| `examples/water-study/` | A study built with the mock-up's builder and run with BigDFT 1.9.1: board, generated script, inputs, logs, two attempts |
| `prototype/` | The first workshop: immersive mock-up (single page, three.js, no build step) |
| `workshop/` | **Workshop 2**: one study built step by step, from a system to its results. Each step continues the previous one; the steps come from the registry of steps; results are real BigDFT runs. See its README |
| `for_pybigdft_pack/study/` | The registry of steps (`StudyActions.py`) and its engine (`Studies.py`): a study as a script, prepared here, computed on the HAPS, analysed here. See its README |
| `examples/water-ionisation/` | A study written by workshop 2 and run as written with BigDFT 1.9.1: script, inputs, logs, analysis |
| `tools/` | Schema extraction and comparison, catalogue and graph generation, preview server |

## See the mock-up

```bash
python tools/preview.py                   # the first workshop, http://localhost:8765
python tools/preview.py 8766 workshop     # workshop 2,         http://localhost:8766
node tools/check_workshop.js              # workshop 2 against a real BigDFT run
```

The two are separate pages. Workshop 2 starts again from one idea: you are building a calculation, then a study, in one continuous line. It reuses the first workshop's scene, figures, checks and registries.

## Regenerate what workshop 2 reads

```bash
python tools/build_steps.py                       # the steps, from for_pybigdft_pack/study/StudyActions.py
mkdir -p /tmp/lattice && tar -xzf workshop/library/runs.tgz -C /tmp/lattice
python tools/build_library.py /tmp/lattice examples/water-study/attempt-2/runs    # the recorded results
```

To record more results, run a study through the registry (`workshop/library/lattice.py` is the one behind the library) and pass its `runs` directory to `build_library.py`.

## Moving to another version of BigDFT or PyBigDFT

One command. It needs the image the pack will run and a source checkout of the same version
(the input variables are declared in the source, not in the image):

```bash
tools/update_version.sh --image docker://bigdft/runtime@sha256:<digest> \
                        --source /path/to/bigdft-suite --revision "tag 1.9.5"
```

It ends with the list of what a person has to look at. When that list is empty, the application
follows the new version as it is.

What is read again from the code, never rewritten by hand:

| Part of the application | Read from | By |
|---|---|---|
| The 311 input variables: names, defaults, ranges, conditions, profiles (Expert and Advanced depths) | the source definitions | `extract_schema.py`, `build_prototype_schema.py` |
| The parameter graph and its text corpus | the same | `build_parameter_instances.py` |
| The PyBigDFT depth: one control per input action, with what it writes | the installed PyBigDFT, called in the image | `for_pybigdft_pack/repopulate.sh`, `build_actions.py` |
| The agent's graph: API, snippets, pitfalls | the installed PyBigDFT, snippets executed in the image | `for_pybigdft_pack/repopulate.sh` |
| Where calculations run | `config/haps.yaml` | `build_targets.py` |

What is written by hand, and what watches over it:

| Written by hand | What stops the build, or is reported, when the version no longer agrees |
|---|---|
| Which variable is shown at which depth and in which block (`schema/ui-tiers.yaml`) | `diff_schema.py`, `build_prototype_schema.py`: a variable shown as a control that no longer exists |
| The Essential controls and how they become input keys (`prototype/js/blueprint.js`) | `build_actions.py`: every key the workshop writes must be a variable of the version (40 today) |
| The PyBigDFT calls the workshop and the study builder write | `build_actions.py`: every call must be an action of the installed registry |
| The snippets and the pitfalls | they are executed: one that fails is listed, with what changed, in `for_pybigdft_pack/data/CHANGES.md` |
| The adaptive defaults, the checks, the cost estimates (`blueprint.js`) | nothing automatic: they are judgements, to be re-read when the physics or the defaults change |
| The reading of logs for the figures (`tools/build_results.py`) | nothing automatic: it names log keys, and would fail on a log whose keys changed |

So a new version does not mean rewriting the application: the command regenerates what describes the
code and says where the hand-written part stopped agreeing with it. The last two rows are the honest
limit. The way to shrink it is the one started with the PyBigDFT depth: draw the Essential controls
from registry actions too, and the result views from `BigDFT.Logfiles.BUILTIN`.

## Regenerate the real results

```bash
git clone --depth 1 https://github.com/BigDFT-group/capsule-maker.git /tmp/capsule-maker
python tools/build_results.py "/tmp/capsule-maker/Open-Scientific-Intelligence-Hackathon-2026/knowledge-capsule-artefacts-claude-opus-5.5/phase-2-growth/bigdft-6a-tsubame"
```

## Regenerate the controls drawn from PyBigDFT

The "PyBigDFT" depth of the workshop is drawn from the registry of input actions of the installed
PyBigDFT, read in the pack's image by `for_pybigdft_pack/repopulate.sh`. After a new build:

```bash
python tools/build_actions.py        # for_pybigdft_pack/build/<latest> -> prototype/js/actions.js
```

It fails if the workshop itself writes a call the installed version does not have.

## Change where calculations run

Edit `config/haps.yaml`, then:

```bash
python tools/build_targets.py        # checks the file, writes prototype/js/targets.js
```

## Regenerate the example study

```bash
python tools/build_example.py        # examples/water-study -> prototype/js/example.js
```

`examples/water-study/README.md` says how the runs themselves were made.

## Add a guided path

In the mock-up, switch to "Admin view" and use "Add a notebook" in the Library. To ship one with the workshop:

```bash
python tools/build_guides.py --strip my-tutorial.ipynb > guides/notebooks/my-tutorial.ipynb
# add an entry to guides/manifest.yaml (level, minutes, summary), then
python tools/build_guides.py                         # prototype/js/guides.js
```

Requires Python 3.10 or later and PyYAML.
