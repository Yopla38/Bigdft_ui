# Bigdft_ui

A web workshop for BigDFT: build a simulation around a 3D scene, run it, analyse it, share it, publish it.

The proposal is in [`docs/PROPOSAL.md`](docs/PROPOSAL.md). Working name: Ondelette.

## Contents

| Path | Role |
|---|---|
| `docs/PROPOSAL.md` | Concept, parameter analysis, place in the pack-kit ecosystem, architecture, build order, open questions |
| `docs/letters/` | Draft letters (OneAngstrom, L_Sim) |
| `schema/bigdft-input.schema.json` | The 313 input variables of BigDFT, PSolver and CheSS, extracted from the source |
| `schema/ui-tiers.yaml` | Product decision: block and depth of each variable |
| `ontology/workshop_layer.ttl` | Uninstantiated layer a BigDFT pack schema can merge |
| `ontology/instances/bigdft-parameters.ttl` | Generated parameter graph, for pack-kit's `ttl_instances` loader |
| `ontology/corpus/bigdft-variables.md` | Generated descriptions, one section per variable, for `markdown_sections` |
| `prototype/` | Immersive mock-up (single page, three.js, no build step) |
| `tools/` | Schema extraction, catalogue and graph generation, preview server |

## See the mock-up

```bash
python tools/preview.py        # http://localhost:8765
```

## Regenerate after a BigDFT upgrade

```bash
git clone --depth 1 https://gitlab.com/l_sim/bigdft-suite.git /tmp/bigdft-suite
python tools/extract_schema.py /tmp/bigdft-suite     # schema/bigdft-input.schema.json
python tools/build_prototype_schema.py               # prototype/js/schema.js, fails if the curation is stale
python tools/build_parameter_instances.py            # ontology/instances/ and ontology/corpus/
```

Requires Python 3.10 or later and PyYAML.
