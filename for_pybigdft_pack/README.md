# For the PyBigDFT pack: the API as a graph, with code that was run

What an agent needs to write PyBigDFT code that works with the version it runs,
as an instantiated Turtle graph the pack can load into its memory without any
model call. Generated from the pack's own image, so it says what that version
does, not what a tutorial written for another one says.

Read from **PyBigDFT 0.9, BigDFT 1.9.1** (`bigdft/runtime@sha256:6f16f65f5b33…`).

| In the graph | Count | Where it comes from |
|---|---|---|
| Modules, classes, functions and methods | 39, 62, 530 | introspection of the installed package: exact signatures, defaults, docstrings |
| Attributes of a `Logfile` | 37 | the table PyBigDFT builds them from, with the log keys they read |
| Input actions, with what each one writes | 45 | each action called on an empty input file, the result recorded |
| Input variables | 317 | the log of a run (243) completed from the source definitions |
| Snippets | 41 | written by hand, **each executed in the image**; only those that pass are kept |
| Pitfalls | 24 | observed on real runs; all but one are asserted by a snippet |
| Tasks | 7 | what the snippets are grouped by |

1058 individuals, 7778 statements. Three modules cannot be imported in this
image (AiiDA, ASE interoperability, `check_examples`); the graph says so.

## What is here

```
repopulate.sh              one command: rebuild everything from an image
extract/extract.py         runs IN the image: reads the installed PyBigDFT, runs the snippets
snippets/*.py              the tested code, one task each, with assertions
knowledge/pitfalls.yaml    the pitfalls, each tied to the snippets that reproduce it
tools/build_ttl.py         writes data/pybigdft-api.ttl from the above
tools/compare_builds.py    what changed between two versions
tools/audit_tutorials.py   which calls of the tutorials do not exist in the installed version
ontology/api_layer.ttl     the classes and predicates to add to the pack's schema
fetchers/pybigdft_api.py   loads the graph into the pack's memory
eval/                      questions with the snippet expected, asked through the pack's query tool
data/pybigdft-api.ttl      THE GRAPH (generated)
data/REPORT.md             what is in it, what was left out and why (generated)
data/TUTORIAL_AUDIT.md     the pack's tutorials checked against this version (generated)
build/<version>/*.json     what was read from the image, kept to compare versions
```

## Put it in the pack

Three files to copy, then three commands.

```bash
PACK=/path/to/Pack_pybigdft_HAPS
mkdir -p $PACK/data
cp data/pybigdft-api.ttl      $PACK/data/
cp fetchers/pybigdft_api.py   $PACK/fetchers/
cp ontology/api_layer.ttl     $PACK/ontology/

cd $PACK
python fetchers/pybigdft_api.py --add-layer   # once: adds the layer to ontology/schema.ttl
python fetchers/pybigdft_api.py --dry-run     # shows a sample, writes nothing
python fetchers/pybigdft_api.py               # writes into the MEMORY_DB of config.yaml
```

`--add-layer` is needed because the graph uses classes and predicates the pack's
schema does not have (PythonClass, Parameter, Pitfall, shownIn, hasSignature…).
It appends `ontology/api_layer.ttl` at the end of `ontology/schema.ttl`, keeps
the schema as it was in `schema.ttl.before_api_layer`, and touches nothing that
is already there. Without it the loader stops and says so.

Use the Python the pack runs under (the one with `aom_ingest`). The loader calls
no model: only the local sentence-transformer that embeds labels and summaries,
`all-MiniLM-L6-v2` unless the pack sets `MEMORY_EMBEDDING_MODEL`. It is a command
you run, like pack-kit's `fetchers/ttl_instances.py` which it follows, not a
`fetcher:` of `sources.yaml`: `learn.sh` ends in an LLM extraction and nothing
here needs one. It fills the same database, beside what `learn.sh` wrote.

Every predicate of the layer is marked `extractionScope "derived"`, as the
notebook layer of pack-kit is: adding it does not change what the tutorials'
extraction is offered.

A snippet is stored as a verbatim artifact, the way `fetchers/notebooks.py`
stores a notebook cell, and its node ends in `:CodeSnippet:<artifact id>`: a
graph query brings the exact code back with the facts around it.

## When PyBigDFT changes

```bash
./repopulate.sh --image docker://bigdft/runtime@sha256:<new digest> \
                --definitions ../schema/bigdft-input.schema.json \
                --docs /path/to/Pack_pybigdft_HAPS/docs
```

`--runtime docker` if the machine has docker and not apptainer. The image must be
one where `bigdft` runs (the fixtures are four small real calculations, about a
minute): not the pack's container, where `bigdft` is disabled on purpose.

It then writes, besides the new graph:

- `data/CHANGES.md`: functions added and removed, signatures changed, input
  actions that write something else, and **the snippets that no longer pass**.
  Read those first. A snippet asserts a behaviour; when it fails the behaviour
  changed, and the pitfall tied to it is to revise. Some snippets assert that
  something is *missing* (no action for k-points, pandas not installed): they
  fail on the day the version gains it, which is how the graph stops repeating
  an obsolete warning.
- `data/REPORT.md`: failed snippets are left out of the graph and listed.

Then copy `data/pybigdft-api.ttl` to the pack and run
`python fetchers/pybigdft_api.py --prune`: unchanged individuals are left alone,
changed ones replaced, those the new version no longer has are dropped.

Nothing in the tools names a function or a version. The graph is whatever the
installed package declares and whatever the snippets did when they ran.

`--definitions` is optional. It is the file `tools/extract_schema.py` of this
repository writes from a BigDFT source tree; without it the graph holds the
input variables a default log prints (243 of 311 for 1.9.1), since the image
does not carry the definitions.

## Adding a snippet

One file in `snippets/`, self-contained, runnable in an empty directory that
holds the fixtures (`log-h2o.yaml`, `log-h2o_relax.yaml`, `final_h2o_relax.yaml`,
`log-oh.yaml`, `log-pbe0_restart.yaml`, `log-pbe0_cold.yaml`, `log-refused.yaml`,
`h2o.xyz`, `data-h2o/`). Its docstring is its description:

```python
"""One sentence: what the code does. This is what a search shows.

Why it is done this way, and what to watch for.

task: Read a result
stage: analysis
"""
```

`stage` is `prepare` (no BigDFT at all), `dry-run`, `analysis` (reads finished
logs) or `compute` (needs the `bigdft` executable). Assert what the snippet
claims: an assertion is what makes it evidence. Which functions it uses is not
declared: it is recorded while it runs. To tie it to a pitfall, name its file in
`knowledge/pitfalls.yaml`.

## What was measured

- All 41 snippets pass in the image.
- The graph loads into a memory database with the pack's schema plus the layer:
  1058 memories, 5035 triplets, 41 artifacts, none rejected by the schema
  validator; `aom-format check` accepts the database (all-MiniLM-L6-v2, 384).
- `eval/retrieval.py` asks 24 questions through `query_memory`, the tool the
  agent calls: 24 bring back the expected snippet, 19 of them first.
- Loading again leaves the unchanged individuals alone; `--prune` drops what a
  new graph no longer has.
- The tutorials of the pack hold 20 calls that cannot work with this version, in
  9 of 30 pages (`data/TUTORIAL_AUDIT.md`): `set_psp_nlcc`, `BigDFT.PDoS`,
  `get_molecule`, the ASE and AiiDA modules.

## What was not

- **The agent itself.** The retrieval test measures what the agent is given, not
  what it then writes. It was run on a database holding this graph alone; in the
  pack the tutorials are there too and compete for the same questions. Run
  `python eval/retrieval.py /path/to/pack` there, before and after loading.
- **apptainer.** `repopulate.sh` was run with docker; its apptainer branch is
  written and not executed.
- **Large systems, GPU, AiiDA, ASE**: nothing of these can be tested in this image.
- The tutorial audit reads by pattern. What it lists is certain; what it does not
  list is not thereby correct. The tutorial cells were not executed.
- 110 of the 530 functions have no docstring: the graph gives their signature
  and nothing more.
