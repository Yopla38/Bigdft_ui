#!/usr/bin/env python3
"""Write the instantiated graph of PyBigDFT from what extract.py read in the image.

    python tools/build_ttl.py build/0.9-bigdft-1.9.1

reads   <build>/api.json, actions.json, parameters.json, snippets.json, versions.json
        snippets/*.py and knowledge/pitfalls.yaml
writes  data/pybigdft-api.ttl     the graph, under ontology/api_layer.ttl
        data/REPORT.md            what is in it, and what was left out and why

Nothing in this file knows a function name or a version: the graph is whatever
the installed PyBigDFT declared and whatever the snippets did when they ran.

`--definitions schema.json` (optional) completes the input variables with the
ones a log does not print (those that only apply to an option not chosen) and
with their ranges. It is the file `tools/extract_schema.py` of this repository
writes from a BigDFT source tree of the same version.
"""
from __future__ import annotations

import argparse
import ast
import hashlib
import json
import re
import sys
from collections import Counter, defaultdict
from pathlib import Path

import yaml

HERE = Path(__file__).resolve().parent.parent
NS = "http://bigdft.org/onto#"


# --------------------------------------------------------------------------- Turtle

def local(*parts: str) -> str:
    return "_".join(re.sub(r"[^A-Za-z0-9]+", "_", p).strip("_") for p in parts if p)


def lit(text) -> str:
    return json.dumps(str(text), ensure_ascii=False)


class Graph:
    """Subjects in insertion order, each with its statements. Written as plain Turtle."""

    def __init__(self):
        self.nodes: dict[str, list[tuple[str, str]]] = {}

    def add(self, subject: str, predicate: str, obj: str) -> None:
        statements = self.nodes.setdefault(subject, [])
        if (predicate, obj) not in statements:
            statements.append((predicate, obj))

    def node(self, subject: str, cls: str, label: str, comment: str = "") -> str:
        self.add(subject, "a", ":" + cls)
        self.add(subject, "rdfs:label", lit(label))
        if comment:
            self.add(subject, "rdfs:comment", lit(comment))
        return subject

    def has(self, subject: str) -> bool:
        return subject in self.nodes

    def write(self, path: Path, header: str) -> None:
        out = [header, f"@prefix : <{NS}> .", "@prefix rdfs: <http://www.w3.org/2000/01/rdf-schema#> .", ""]
        for subject, statements in self.nodes.items():
            body = " ;\n    ".join(f"{p} {o}" for p, o in statements)
            out.append(f"{subject} {body} .\n")
        path.write_text("\n".join(out), encoding="utf-8")


def artifact_id(code: str) -> str:
    """The id aom_ingest gives a verbatim artifact: the fetcher must find the same."""
    return "sha256_" + hashlib.sha256(code.encode()).hexdigest()[:12]


def snippet_iri(code: str) -> str:
    return f"<{NS}:CodeSnippet:{artifact_id(code)}>"


# --------------------------------------------------------------------------- reading

def load(build: Path, name: str):
    return json.loads((build / name).read_text(encoding="utf-8"))


def definitions(path: Path | None) -> dict[str, dict]:
    """Input variables by path, from a schema extracted from the BigDFT source."""
    if not path:
        return {}
    schema, out = json.loads(path.read_text(encoding="utf-8")), {}
    for namespace, body in schema["namespaces"].items():
        for section in body["sections"]:
            for var in section["variables"]:
                prefix = "" if namespace == "bigdft" else namespace + "."
                out[f"{prefix}{section['name']}.{var['name']}"] = var
    return out


# --------------------------------------------------------------------------- building

def build(args) -> int:
    directory = Path(args.build)
    api, actions = load(directory, "api.json"), load(directory, "actions.json")
    params, snippets = load(directory, "parameters.json"), load(directory, "snippets.json")
    versions = load(directory, "versions.json")
    pitfalls = yaml.safe_load((HERE / "knowledge/pitfalls.yaml").read_text(encoding="utf-8"))
    defs = definitions(Path(args.definitions) if args.definitions else None)
    stamp = f"PyBigDFT {versions['pybigdft']}, BigDFT {versions['bigdft']}, Python {versions['python']}"

    g, notes = Graph(), []

    # -- library and modules
    lib = g.node(":Library_PyBigDFT", "Library", "PyBigDFT")
    g.add(lib, ":hasDescription", lit("The Python package that builds BigDFT inputs, runs them and reads their logs. "
                                        "Imported as BigDFT."))
    g.add(lib, ":hasVersion", lit(stamp))

    def module_iri(name: str) -> str:
        return ":" + local("Module", name)

    for m in api["modules"]:
        iri = g.node(module_iri(m["name"]), "Module", m["name"], m["doc"] if m["doc"] != m["summary"] else "")
        g.add(iri, ":hasDescription", lit(m["summary"] or f"Module {m['name']} of PyBigDFT (no docstring)."))
        g.add(iri, ":belongsTo", lib)
    for u in api["unavailable"]:
        iri = g.node(module_iri(u["module"]), "Module", u["module"])
        g.add(iri, ":hasDescription", lit(f"Module of PyBigDFT that cannot be imported in this environment ({u['error']}). "
                                           "Nothing of it can be used here."))
        g.add(iri, ":availability", lit(f"not importable with {stamp}: {u['error']}"))
        g.add(iri, ":belongsTo", lib)

    # -- classes
    class_iri = {}
    for c in api["classes"]:
        iri = ":" + local("Class", c["module"], c["name"])
        class_iri[(c["module"], c["name"])] = iri
        own = sorted(f["name"] for f in api["functions"] if f.get("cls") == c["name"] and f["module"] == c["module"])
        doc = c["doc"]
        if c["init_doc"]:
            doc += "\n\nConstructor: " + c["init_doc"]
        if own:
            doc += "\n\nMethods and properties: " + ", ".join(own) + "."
        if c["inherited"]:
            doc += "\nInherited: " + ", ".join(f"{k} (from {v.rsplit('.', 1)[-1]})" for k, v in sorted(c["inherited"].items())) + "."
        g.node(iri, "PythonClass", c["name"], doc.strip())
        g.add(iri, ":hasDescription", lit(c["summary"] or f"Class {c['name']} of {c['module']} (no docstring)."))
        g.add(iri, ":definedIn", module_iri(c["module"]))
        if c["signature"]:
            g.add(iri, ":hasSignature", lit(f"{c['name']}{c['signature']}"))
            for p in c["parameters"]:
                g.add(iri, ":hasArgument", lit(f"{p['name']}={p['default']}" if p["default"] is not None else f"{p['name']} (required)"))
    for c in api["classes"]:
        for base in c["bases"]:
            key = tuple(base.rsplit(".", 1))
            if key in class_iri:
                g.add(class_iri[(c["module"], c["name"])], ":inheritsFrom", class_iri[key])

    # -- functions and methods
    function_iri, by_place, action_names = {}, {}, {a["name"]: a for a in actions}
    for f in api["functions"]:
        iri = ":" + local("Function", f["module"], f["qualname"])
        function_iri[(f["module"], f["qualname"])] = iri
        if f["file"]:
            by_place[(f["file"], f["line"])] = iri
        signature = f["signature"]
        is_action = f["module"] == "BigDFT.InputActions" and f["name"] in action_names
        if is_action:
            signature = action_names[f["name"]]["signature"]
        kind = {"property": "Property", "staticmethod": "Static method", "classmethod": "Class method",
                "method": "Method", "function": "Function"}[f["kind"]]
        owner = f.get("cls") or f["module"]
        g.node(iri, "Function", f["name"], f["doc"] if f["doc"] and f["doc"] != f["summary"] else "")
        g.add(iri, ":hasDescription", lit(f["summary"] or f"{kind} {f['name']} of {owner} (no docstring)."))
        if f.get("cls"):
            g.add(iri, ":methodOf", class_iri[(f["module"], f["cls"])])
        else:
            g.add(iri, ":definedIn", module_iri(f["module"]))
        if f["kind"] == "property":
            g.add(iri, ":hasSignature", lit(f"{f['qualname']}  (a property: read it, do not call it)"))
        elif signature:
            g.add(iri, ":hasSignature", lit(f"{f['name']}{signature}"))
        for p in f["parameters"]:
            if is_action and p["name"] == "inp":
                continue
            g.add(iri, ":hasArgument", lit(f"{p['name']}={p['default']}" if p["default"] is not None else f"{p['name']} (required)"))
    for c in api["classes"]:
        if c["file"]:
            by_place[(c["file"], c["line"])] = class_iri[(c["module"], c["name"])]

    # -- input variables
    param_iri, unprinted = {}, []

    def parameter(path: str) -> str | None:
        return param_iri.get(path)

    listed = {p["path"]: p for p in params}
    for path in sorted(set(listed) | set(defs)):
        seen, source = listed.get(path), defs.get(path, {})
        iri = ":" + local("Parameter", path)
        param_iri[path] = iri
        description = (seen or {}).get("comment") or source.get("comment") or f"Input variable {path} of BigDFT."
        long = source.get("description") or ""
        g.node(iri, "Parameter", path, long if long.strip() != description.strip() else "")
        g.add(iri, ":hasDescription", lit(description))
        g.add(iri, ":inSection", lit(path.rsplit(".", 1)[0]))
        default = seen["default"] if seen else json.dumps(source.get("default"))
        g.add(iri, ":hasDefault", lit(default))
        if source.get("range"):
            g.add(iri, ":hasRange", lit(f"from {source['range'][0]} to {source['range'][1]}"))
        if source.get("enum"):
            g.add(iri, ":hasAllowedValues", lit(", ".join(str(v) for v in source["enum"])))
        if not seen:
            unprinted.append(path)

    if unprinted:
        notes.append(f"{len(unprinted)} input variables are not printed in a default log (they apply to an option that was "
                     "not chosen) and come from the definitions: " + ", ".join(f"`{p}`" for p in unprinted[:8]) + ", …")
    if not defs:
        notes.append("no --definitions given: only the input variables a default log prints are in the graph")

    # -- input actions: how they are called and what they write
    for a in actions:
        iri = function_iri.get(("BigDFT.InputActions", a["name"]))
        if not iri:
            continue
        if a["is_method"]:
            g.add(iri, ":calledAs", lit(a.get("call") or f"inp.{a['name']}(...)"))
        if a["writes"] is None:
            notes.append(f"input action `{a['name']}` was {a['error']}")
            continue
        for path, value in sorted(a["writes"].items()):
            g.add(iri, ":writesInput", lit(f"{path} = {json.dumps(value)}"))
            if parameter(path):
                g.add(iri, ":setsParameter", parameter(path))
        if not a["writes"] and not a.get("writes_posinp"):
            g.add(iri, ":writesInput", lit("nothing when called with its default arguments"))

    # -- attributes of a Logfile
    attribute_iri = {}
    logfile = class_iri.get(("BigDFT.Logfiles", "Logfile"))
    for at in api["attributes"]:
        iri = ":" + local("Attribute", at["cls"], at["name"])
        attribute_iri[at["name"]] = iri
        what = at["label"] or at["name"].replace("_", " ")
        g.node(iri, "Attribute", at["name"])
        g.add(iri, ":hasDescription", lit(
            f"log.{at['name']}: {what}, read from the log" + (" (it repeats the input)" if at["input"] else "")
            + ". Absent when the log does not hold it."))
        if logfile:
            g.add(iri, ":attributeOf", logfile)
        for path in at["paths"]:
            g.add(iri, ":readsLogKey", lit(path))

    # -- tasks, snippets
    task_iri = {}
    snippet_of, used_by = {}, defaultdict(set)
    passed = [s for s in snippets if s["status"] == "passed"]
    for s in snippets:
        if s["status"] != "passed":
            notes.append(f"snippet `{s['file']}` FAILED with {stamp} and is not in the graph")
    for s in passed:
        code = (HERE / "snippets" / s["file"]).read_text(encoding="utf-8")
        iri = snippet_iri(code)
        snippet_of[s["file"]] = iri
        g.node(iri, "CodeSnippet", s["intent"], s["description"])
        g.add(iri, ":hasDescription", lit(s["intent"]))
        task = s["fields"].get("task")
        if task:
            if task not in task_iri:
                task_iri[task] = g.node(":" + local("Workflow", task), "Workflow", task)
                g.add(task_iri[task], ":hasDescription", lit(f"{task}, with PyBigDFT: the snippets that show how."))
            g.add(iri, ":demonstrates", task_iri[task])
        g.add(iri, ":runsAtStage", lit(s["fields"].get("stage", "prepare")))
        g.add(iri, ":verifiedWith", lit(stamp))
        output = "\n".join(l for l in s["output"].split("\n") if "<BigDFT> log of the run" not in l).strip()
        if output:
            g.add(iri, ":printsOutput", lit(output))
        g.add(iri, ":hasCode", lit(code))
        # what it really called, recorded while it ran
        for call in s["calls"]:
            target = by_place.get((call["file"], call["line"]))
            direct = call["depth"] == 1 or call["file"].endswith("InputActions.py")
            if target and direct:
                used_by[target].add(iri)
        # attributes of a log it reads, and input variables it writes by key
        tree = ast.parse(code)
        if "Logfile" in code:
            for node in ast.walk(tree):
                if isinstance(node, ast.Attribute) and node.attr in attribute_iri:
                    used_by[attribute_iri[node.attr]].add(iri)
        for sec, key in re.findall(r"\[\s*\"([\w.]+)\"\s*\]\s*\[\s*\"(\w+)\"\s*\]\s*=", code):
            if parameter(f"{sec}.{key}"):
                g.add(iri, ":setsParameter", parameter(f"{sec}.{key}"))
        for sec, body in re.findall(r"inp\[\s*\"([\w.]+)\"\s*\]\s*=\s*\{([^}]*)\}", code):
            for key in re.findall(r"\"(\w+)\"\s*:", body):
                if parameter(f"{sec}.{key}"):
                    g.add(iri, ":setsParameter", parameter(f"{sec}.{key}"))
    for target, users in used_by.items():
        for iri in sorted(users):
            g.add(target, ":shownIn", iri)

    # -- pitfalls
    def resolve(name: str) -> str | None:
        if name in param_iri:
            return param_iri[name]
        head, _, tail = name.partition(".")
        if head == "Logfile" and tail in attribute_iri:
            return attribute_iri[tail]
        found = [iri for (module, qual), iri in function_iri.items()
                 if qual == name or f"{module.rsplit('.', 1)[-1]}.{qual}" == name]
        found += [iri for (module, cls), iri in class_iri.items() if cls == name]
        return found[0] if len(found) == 1 else None

    for p in pitfalls:
        iri = g.node(":" + local("Pitfall", p["id"]), "Pitfall", p["title"])
        g.add(iri, ":hasDescription", lit(p["title"]))
        g.add(iri, ":hasSymptom", lit(p["symptom"]))
        g.add(iri, ":hasCause", lit(p["cause"]))
        evidence = [f for f in p["snippets"] if f in snippet_of]
        missing = [f for f in p["snippets"] if f not in snippet_of]
        remedy = p["remedy"]
        if p.get("observed"):
            remedy += " (Not asserted by a snippet. Observed: " + p["observed"] + ")"
        g.add(iri, ":hasRemedy", lit(remedy))
        if missing:
            notes.append(f"pitfall `{p['id']}`: its snippet(s) {', '.join(missing)} did not pass with {stamp}; "
                         "the behaviour may have changed, review the entry")
        for f in evidence:
            g.add(snippet_of[f], ":avoids", iri)
        for name in p["concerns"]:
            target = resolve(name)
            if target:
                g.add(iri, ":concerns", target)
            else:
                notes.append(f"pitfall `{p['id']}` concerns `{name}`, which is not in this version")

    # -- write
    out = HERE / "data"
    out.mkdir(exist_ok=True)
    header = (f"# Generated by tools/build_ttl.py - do not edit.\n# Read from: {stamp}.\n"
              "# Schema: ontology/api_layer.ttl, to be merged into the pack's ontology/schema.ttl.\n")
    g.write(out / "pybigdft-api.ttl", header)

    classes = Counter(o for statements in g.nodes.values() for p, o in statements if p == "a")
    triples = sum(len(s) for s in g.nodes.values())
    undocumented = sum(1 for f in api["functions"] if not f["doc"])
    report = [f"# PyBigDFT API graph\n", f"Read from **{stamp}**.\n",
              "| Class | Individuals |", "|---|---|"]
    report += [f"| {c[1:]} | {n} |" for c, n in sorted(classes.items())]
    report += ["", f"{len(g.nodes)} individuals, {triples} statements.",
               f"{len(passed)} of {len(snippets)} snippets passed and are in the graph; "
               f"{sum(1 for t in used_by)} functions, classes and attributes are shown in at least one of them.",
               f"{undocumented} of {len(api['functions'])} functions and methods have no docstring: the graph gives their signature only.",
               f"{len(api['unavailable'])} modules cannot be imported in this environment: "
               + ", ".join(f"`{u['module']}`" for u in api["unavailable"]) + ".", ""]
    if notes:
        report += ["## Left out, or to review", ""] + [f"- {n}" for n in notes]
    (out / "REPORT.md").write_text("\n".join(report) + "\n", encoding="utf-8")
    print(f"data/pybigdft-api.ttl: {len(g.nodes)} individuals, {triples} statements | " + ", ".join(f"{c[1:]} {n}" for c, n in sorted(classes.items())))
    print(f"data/REPORT.md: {len(notes)} note(s)")

    try:
        import rdflib
        check = rdflib.Graph()
        check.parse(str(out / "pybigdft-api.ttl"), format="turtle")
        print(f"valid Turtle: {len(check)} triples")
    except ImportError:
        print("rdflib not installed: the Turtle was not parsed back")
    return 0


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("build", help="directory written by extract/extract.py")
    parser.add_argument("--definitions", help="schema of the input variables, from tools/extract_schema.py of this repository")
    sys.exit(build(parser.parse_args()))
