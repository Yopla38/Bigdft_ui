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
| `examples/water-study/` | A study built with the mock-up's builder and run with BigDFT 1.9.1: board, generated script, inputs, logs, two attempts |
| `prototype/` | Immersive mock-up (single page, three.js, no build step) |
| `tools/` | Schema extraction and comparison, catalogue and graph generation, preview server |

## See the mock-up

```bash
python tools/preview.py        # http://localhost:8765
```

## Regenerate after a BigDFT upgrade

```bash
git clone --depth 1 --branch <tag> https://gitlab.com/l_sim/bigdft-suite.git /tmp/bigdft-suite
python tools/extract_schema.py /tmp/bigdft-suite -o /tmp/new.json --revision "tag <tag>"
python tools/diff_schema.py schema/bigdft-input.schema.json /tmp/new.json   # what changes; fails if a control is lost
cp /tmp/new.json schema/bigdft-input.schema.json
python tools/build_prototype_schema.py               # prototype/js/schema.js, fails if the curation is stale
python tools/build_parameter_instances.py            # ontology/instances/ and ontology/corpus/
```

## Regenerate the real results

```bash
git clone --depth 1 https://github.com/BigDFT-group/capsule-maker.git /tmp/capsule-maker
python tools/build_results.py "/tmp/capsule-maker/Open-Scientific-Intelligence-Hackathon-2026/knowledge-capsule-artefacts-claude-opus-5.5/phase-2-growth/bigdft-6a-tsubame"
```

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
