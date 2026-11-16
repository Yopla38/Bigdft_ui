"""Load the PyBigDFT API graph into this pack's memory. No LLM.

    python fetchers/pybigdft_api.py --list       what the file holds, by class
    python fetchers/pybigdft_api.py --dry-run    show what would be written, touch nothing
    python fetchers/pybigdft_api.py              load data/pybigdft-api.ttl into the memory
    python fetchers/pybigdft_api.py --prune      also drop what is no longer in the file

Copy this file into the pack's fetchers/ and data/pybigdft-api.ttl into its
data/. The pack's ontology/schema.ttl must contain ontology/api_layer.ttl.

What it is
----------
data/pybigdft-api.ttl is an instantiated graph: every module, class, function
and method of PyBigDFT as installed in the pack's image, with signatures and
docstrings; what each input action writes; every input variable; snippets that
were executed against that image; and the pitfalls those snippets demonstrate.
It is generated (tools/build_ttl.py), not written.

This loader writes that graph into the memory the agents query, exactly as
pack-kit's `fetchers/ttl_instances.py` does, and for the reason it gives: an
instantiated graph IS the facts, so having a model read them back out of
Turtle would cost a call per individual to get an approximation of what the
file states exactly. Like it, this is a command you run, not a `fetcher:` of
sources.yaml: `learn.sh` ends in an LLM extraction, and nothing here needs one.
The only model that runs is the local sentence-transformer that embeds labels
and summaries (MEMORY_EMBEDDING_MODEL, all-MiniLM-L6-v2 unless the pack says
otherwise).

It follows that loader's conventions (one memory and its triplets per
individual, a literal kept in `object_label` with an empty `object_uri`,
re-running replaces) and adds two things this graph needs:

  - **Snippets are verbatim artifacts.** The code of a CodeSnippet (its
    `hasCode` literal) is stored with `store_verbatim_artifact`, the way
    fetchers/notebooks.py stores a notebook cell. The node's IRI ends in
    `:CodeSnippet:<artifact id>`, which is what a graph query looks for to
    bring the exact code along with a subgraph. The code is not a triplet.
  - **Importance comes from evidence.** A snippet that ran, and a pitfall a
    snippet asserts, rank above a function nobody documented.

Re-running after a new version of PyBigDFT
------------------------------------------
Regenerate the .ttl (see README.md), copy it over, run this again with
`--prune`. Individuals whose rendering did not change are left alone; those
that changed are replaced; those that vanished from the new version are dropped.
"""
from __future__ import annotations

import argparse
import hashlib
import importlib.util
import json
import os
import re
import sys
from pathlib import Path

PACK = Path(__file__).resolve().parent.parent
DEFAULT_TTL = PACK / "data" / "pybigdft-api.ttl"
STATE = PACK / "memory" / "pybigdft_api_state.json"

#: Predicate labels whose object qualifies the subject's label: the function
#: `set_xc` defined in `BigDFT.InputActions` is the node `BigDFT.InputActions.set_xc`,
#: the method `run` of `Runner` is `Runner.run`, the attribute `energy` of
#: `Logfile` is `Logfile.energy`. A bare `run` would be six different things.
QUALIFYING = ("methodOf", "attributeOf", "definedIn")
DESCRIPTION = "hasDescription"
CODE = "hasCode"
#: What the layer must have brought into the pack's schema.
REQUIRED_CLASSES = ("PythonClass", "Attribute", "Parameter", "Pitfall", "Function", "Module", "CodeSnippet")
REQUIRED_PREDICATES = (DESCRIPTION, CODE, "definedIn", "methodOf", "shownIn", "hasSignature", "avoids")
ARTIFACT_IRI = re.compile(r":(\w+):(sha256_[0-9a-f]+)$")


# --------------------------------------------------------------------------- the pack

def memory_env() -> dict[str, str]:
    """MEMORY_DB, MEMORY_ONTOLOGY and the rest, as the pack's config.yaml declares them."""
    import yaml

    config = yaml.safe_load((PACK / "config.yaml").read_text(encoding="utf-8")) or {}
    for agent in (config.get("agents") or {}).values():
        for entry in ((agent.get("tools") or {}).get("native") or []):
            env = entry.get("env") or {}
            if env.get("MEMORY_DB"):
                return {k: str(v).replace("{here}", str(PACK)) for k, v in env.items()}
    raise SystemExit(f"No memory tool with a MEMORY_DB env in {PACK / 'config.yaml'}: "
                     "name the database with --db and the schema with --ontology.")


def import_memory_tools():
    """aom_ingest's memory_tools, for purge_source (see pack-kit's ttl_instances.py)."""
    candidates: list[Path] = []
    spec = importlib.util.find_spec("memory_tools")
    if spec is not None and spec.origin and spec.origin != "namespace":
        candidates.append(Path(spec.origin))
    package = importlib.util.find_spec("aom_ingest")
    if package is not None and package.origin:
        candidates.append(Path(package.origin).parent.parent / "memory_tools.py")
    for path in candidates:
        if not path.exists():
            continue
        spec = importlib.util.spec_from_file_location(f"packkit_{path.stem}", path)
        module = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(module)
        if hasattr(module, "purge_source"):
            return module
    raise SystemExit("aom_ingest's memory_tools (the one with purge_source) is not reachable from "
                     f"{sys.executable}. Tried: {', '.join(map(str, candidates)) or 'nothing found'}.")


# --------------------------------------------------------------------------- reading

class Schema:
    def __init__(self, path: Path):
        from aom_ingest.ontology import OntologyManager

        self.path = path
        self.manager = OntologyManager(path)
        self.classes = dict(self.manager.valid_classes)                       # IRI -> label
        self.predicates = {uri: info["label"] for uri, info in self.manager.valid_predicates.items()}
        missing = [c for c in REQUIRED_CLASSES if c not in self.classes.values()]
        missing += [p for p in REQUIRED_PREDICATES if p not in self.predicates.values()]
        if missing:
            raise SystemExit(f"{path} does not declare {', '.join(missing)}.\n"
                             "Paste ontology/api_layer.ttl (below its @prefix lines) at the end of that file.")

    def class_of(self, graph, node) -> str | None:
        from rdflib import RDF

        for cls in graph.objects(node, RDF.type):
            label = self.classes.get(str(cls))
            if label:
                return label
        return None


def label_of(graph, node) -> str:
    from rdflib import RDFS

    value = graph.value(node, RDFS.label)
    return str(value) if value is not None else str(node).rsplit("#", 1)[-1]


class Individual:
    """One subject of the file: the memory a reader sees and the facts the graph holds."""

    def __init__(self, graph, schema: Schema, node, cls: str):
        from rdflib import RDFS, Literal, URIRef

        self.uri, self.cls = str(node), cls
        self.name = label_of(graph, node)
        self.comment = str(graph.value(node, RDFS.comment) or "")
        self.code = ""
        self.statements: list[tuple[str, str, str, str]] = []       # predicate, object uri, object label, object class
        for pred_uri, pred in sorted(schema.predicates.items(), key=lambda kv: kv[1]):
            for obj in sorted(graph.objects(node, URIRef(pred_uri)), key=str):
                if isinstance(obj, Literal):
                    if pred == CODE:
                        self.code = str(obj)
                    else:
                        self.statements.append((pred, "", str(obj), ""))
                else:
                    self.statements.append((pred, str(obj), label_of(graph, obj), schema.class_of(graph, obj) or ""))
        self._graph = graph
        self.label = self.name
        for wanted in QUALIFYING:
            owner = next((label for pred, uri, label, cls_ in self.statements if pred == wanted and uri), None)
            if owner:
                self.label = f"{owner}.{self.name}"
                break
        self.description = next((label for pred, uri, label, _ in self.statements if pred == DESCRIPTION), "")
        self.shown = any(pred == "shownIn" for pred, *_ in self.statements)

    def qualified(self, labels: dict[str, str]) -> None:
        """Give every object its qualified label, so that a fact reads `Runner.run`, not `run`."""
        self.statements = [(p, u, labels.get(u, lab) if u else lab, c) for p, u, lab, c in self.statements]

    def summary(self) -> str:
        return f"{self.label} — {self.cls}: {self.description or self.comment[:200]}".strip(" :")

    def embedding_text(self) -> str:
        signature = next((label for pred, uri, label, _ in self.statements if pred == "hasSignature"), "")
        return " — ".join(x for x in (self.label, self.description or self.comment[:300], signature) if x)

    def text(self) -> str:
        lines = [f"{self.cls} \"{self.name}\" of {PACK.name}.", f"  qualified name : {self.label}"]
        for pred, uri, label, cls in self.statements:
            value = f"{label} ({cls})" if uri else label
            if "\n" in value:
                value = "\n      " + value.replace("\n", "\n      ")
            lines.append(f"  {pred:15s}: {value}")
        if self.comment:
            lines.append("  documentation  :\n      " + self.comment.replace("\n", "\n      "))
        if self.code:
            lines.append("  code           :\n      " + self.code.rstrip().replace("\n", "\n      "))
        return "\n".join(lines)

    def triplets(self) -> list[dict]:
        return [{"subject_uri": self.uri, "subject_label": self.label, "subject_class": self.cls,
                 "predicate": pred, "object_uri": uri, "object_label": label, "object_class": cls}
                for pred, uri, label, cls in self.statements]

    def importance(self) -> float:
        if self.cls in ("CodeSnippet", "Pitfall"):
            return 0.9
        if self.cls == "Workflow" or self.shown:
            return 0.7
        if self.cls in ("Function", "PythonClass") and not self.comment and "(no docstring)" in self.description:
            return 0.3
        return 0.5

    def digest(self) -> str:
        return hashlib.sha256(self.text().encode("utf-8")).hexdigest()


def read_individuals(ttl: Path, schema: Schema) -> list[Individual]:
    from rdflib import RDF, Graph

    graph = Graph()
    graph.parse(str(ttl), format="turtle")
    found = []
    for node in sorted(set(graph.subjects(RDF.type, None)), key=str):
        cls = schema.class_of(graph, node)
        if cls is not None:
            found.append(Individual(graph, schema, node, cls))
    labels = {ind.uri: ind.label for ind in found}
    for ind in found:
        ind.qualified(labels)
    return found


# --------------------------------------------------------------------------- writing

def source_label(ttl: Path, individual: Individual) -> str:
    local = individual.uri.rsplit("#", 1)[-1].lstrip(":")
    path = ttl.relative_to(PACK).as_posix() if ttl.is_relative_to(PACK) else ttl.name
    return f"{path}#{local}"


def in_memory(db: str, label: str) -> bool:
    import sqlite3

    if not Path(db).exists():
        return False
    con = sqlite3.connect(db)
    try:
        return con.execute("SELECT 1 FROM memories WHERE source = ? LIMIT 1", (label,)).fetchone() is not None
    except sqlite3.Error:
        return False
    finally:
        con.close()


def sources_from(db: str, ttl: Path) -> list[str]:
    import sqlite3

    if not Path(db).exists():
        return []
    path = ttl.relative_to(PACK).as_posix() if ttl.is_relative_to(PACK) else ttl.name
    con = sqlite3.connect(db)
    try:
        return [r[0] for r in con.execute("SELECT DISTINCT source FROM memories WHERE source LIKE ?", (f"{path}#%",))]
    finally:
        con.close()


def load(ttl: Path, db: str, schema: Schema, *, mode: str = "", force: bool = False, prune: bool = False,
         dry_run: bool = False, quiet: bool = False) -> dict:
    individuals = read_individuals(ttl, schema)
    report = {"individuals": len(individuals), "written": 0, "unchanged": 0, "replaced": 0, "triplets": 0,
              "artifacts": 0, "rejected": 0, "pruned": 0}
    print(f"pack       : {PACK.name}")
    print(f"instances  : {ttl}  ({len(individuals)} individuals)")
    print(f"schema     : {schema.path}  ({len(schema.classes)} classes, {len(schema.predicates)} predicates)")
    print(f"memory     : {db}")

    if dry_run:
        for ind in individuals[:: max(1, len(individuals) // 12)]:
            print(f"\n── {source_label(ttl, ind)}\n    " + "\n    ".join(ind.text().splitlines()[:24]))
        report["triplets"] = sum(len(ind.triplets()) for ind in individuals)
        print(f"\n[dry run] nothing written. {len(individuals)} memories, {report['triplets']} triplets and "
              f"{sum(1 for i in individuals if i.code)} artifacts would be. A sample is shown above.")
        return report

    from aom_ingest.db import (record_ontology, store_dead_letter, store_memory, store_node_embedding,
                                 store_triplets, store_verbatim_artifact)
    from aom_ingest.embeddings import embed_document, to_bytes
    from aom_ingest.memory_index import index_memories
    from aom_ingest.validation import TripletValidator

    Path(db).parent.mkdir(parents=True, exist_ok=True)
    memory_tools = import_memory_tools()
    validator = TripletValidator(schema.manager)
    recorded = record_ontology(
        db, schema.path.read_text(encoding="utf-8"), source=str(schema.path.resolve()),
        schema_key=hashlib.sha256("\n".join(sorted(schema.classes) + sorted(schema.predicates)).encode()).hexdigest(),
        classes=sorted(schema.classes.values()), predicates=sorted(schema.predicates.values()),
        triplet_mode=mode, on_divergence="record")
    print(f"ontology   : recorded in the base ({recorded.get('status', '?')})")

    try:
        state = json.loads(STATE.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        state = {}

    descriptions = {ind.uri: ind.embedding_text() for ind in individuals}
    embedded: set[str] = set()

    def embed_node(uri: str, label: str) -> None:
        if uri and uri not in embedded:
            embedded.add(uri)
            store_node_embedding(db, uri, label, to_bytes(embed_document(descriptions.get(uri) or label)))

    seen: set[str] = set()
    for ind in individuals:
        label = source_label(ttl, ind)
        seen.add(label)
        digest = ind.digest()
        if not force and state.get(label) == digest and in_memory(db, label):
            report["unchanged"] += 1
            continue
        if "no memory found" not in str(memory_tools.purge_source(label, db_path=db)):
            report["replaced"] += 1

        if ind.code:
            artifact = store_verbatim_artifact(db, content=ind.code, kind="code", source_file=label,
                                               location=ind.name, intent=ind.description or ind.name)
            named = ARTIFACT_IRI.search(ind.uri)
            if not named or named.group(2) != artifact:
                raise SystemExit(f"{ind.uri} does not end in the id of its code ({artifact}): "
                                 "the .ttl was edited by hand, regenerate it.")
            report["artifacts"] += 1

        accepted, corrected, dead = validator.validate(ind.triplets())
        valid = accepted + corrected
        memory = store_memory(
            db, raw_text=ind.text(), summary=ind.summary(),
            entities=sorted({ind.label} | {t["object_label"] for t in valid if t["object_uri"]}),
            topics=sorted({t["predicate"] for t in valid}), importance=ind.importance(), source=label)
        store_triplets(db, memory["memory_id"], valid)
        embed_node(ind.uri, ind.label)
        for t in valid:
            embed_node(t["object_uri"], t["object_label"])
        for t in dead:
            store_dead_letter(db, memory["memory_id"], t, t.pop("rejection_reason", "unknown"))
            report["rejected"] += 1
        state[label] = digest
        report["written"] += 1
        report["triplets"] += len(valid)
        if not quiet or dead:
            print(f"    {label[:70]:70s} {len(valid):3d} triplet(s)" + (f"  {len(dead)} REJECTED" if dead else ""))

    if prune:
        for label in sources_from(db, ttl):
            if label not in seen:
                memory_tools.purge_source(label, db_path=db)
                state.pop(label, None)
                report["pruned"] += 1
                print(f"    [pruned] {label}")

    try:
        STATE.parent.mkdir(parents=True, exist_ok=True)
        STATE.write_text(json.dumps(state, indent=2, sort_keys=True), encoding="utf-8")
    except OSError as error:
        print(f"warning: could not write {STATE}: {error}")

    indexed = index_memories(db)
    print(f"\nindexed    : {indexed.get('indexed', 0)} memories, {len(embedded)} node vectors")
    return report


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(prog="pybigdft_api.py", description="Load the PyBigDFT API graph into this pack's memory.")
    parser.add_argument("--ttl", help=f"the instance file (default: {DEFAULT_TTL.relative_to(PACK)})")
    parser.add_argument("--db", help="the memory database (default: MEMORY_DB of config.yaml)")
    parser.add_argument("--ontology", help="the schema (default: MEMORY_ONTOLOGY of config.yaml)")
    parser.add_argument("--dry-run", action="store_true", help="show a sample of what would be written, touch nothing")
    parser.add_argument("--list", action="store_true", dest="list_only", help="the individuals of the file, by class")
    parser.add_argument("--force", action="store_true", help="rewrite individuals unchanged since the last run")
    parser.add_argument("--prune", action="store_true", help="drop the memories of individuals no longer in the file")
    parser.add_argument("--verbose", action="store_true", help="one line per individual written")
    args = parser.parse_args(argv)

    missing = [m for m in ("rdflib", "aom_ingest") if importlib.util.find_spec(m) is None]
    if missing:
        raise SystemExit(f"{', '.join(missing)} not importable from {sys.executable}. Use the Python the pack "
                         "runs under: the one $PACK_KIT_PYTHON names, or the pack's virtual environment.")

    env = {} if (args.db and args.ontology) else memory_env()
    os.environ.update(env)
    db = args.db or env["MEMORY_DB"]
    schema = Schema(Path(args.ontology or env.get("MEMORY_ONTOLOGY") or PACK / "ontology" / "schema.ttl"))
    ttl = Path(args.ttl) if args.ttl else DEFAULT_TTL
    if not ttl.exists():
        raise SystemExit(f"instance file not found: {ttl}")

    if args.list_only:
        by_class: dict[str, list[str]] = {}
        for ind in read_individuals(ttl, schema):
            by_class.setdefault(ind.cls, []).append(ind.label)
        for cls, labels in sorted(by_class.items()):
            print(f"{cls:12s} {len(labels):4d}   {', '.join(sorted(labels)[:5])}" + (" …" if len(labels) > 5 else ""))
        return 0

    report = load(ttl, db, schema, mode=env.get("MEMORY_TRIPLET_MODE", ""), force=args.force, prune=args.prune,
                  dry_run=args.dry_run, quiet=not args.verbose)
    if args.dry_run:
        return 0
    print("─" * 68)
    print("written {written}  unchanged {unchanged}  replaced {replaced}  triplets {triplets}  "
          "artifacts {artifacts}  rejected {rejected}  pruned {pruned}".format(**report))
    if report["rejected"]:
        print(f"\n{report['rejected']} rejected triplet(s) are in dead_letters: the schema does not cover them. "
              "Is ontology/api_layer.ttl the version this .ttl was generated for?")
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
