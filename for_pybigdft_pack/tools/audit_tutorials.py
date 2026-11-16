#!/usr/bin/env python3
"""Find, in tutorial pages, the PyBigDFT calls the installed version does not have.

    python tools/audit_tutorials.py build/0.9-bigdft-1.9.1 /path/to/pack/docs

Tutorials are written for the version their author had. Ingested as they are,
they teach an agent calls that fail with the version it runs. This reads every
.md and .ipynb under the given directory and checks three things against what
extract.py found installed:

  - `from BigDFT.x import name`: does the module import, does it have that name;
  - `inp.action(...)` on a variable built with Inputfile(): is it an input action;
  - the keyword arguments of a known input action: does it take them.

It is a static reading, by pattern: it does not execute anything and does not
follow a variable through a function. What it reports is certain; what it does
not report is not thereby correct.

Writes data/TUTORIAL_AUDIT.md.
"""
from __future__ import annotations

import json
import re
import sys
from collections import defaultdict
from pathlib import Path

HERE = Path(__file__).resolve().parent.parent
DICT_METHODS = set(dir(dict)) | {"copy", "update", "get", "pop", "setdefault", "items", "keys", "values"}


def code_lines(path: Path):
    """(line number, text) of what looks like code in a Markdown page or a notebook."""
    if path.suffix == ".ipynb":
        notebook = json.loads(path.read_text(encoding="utf-8"))
        n = 0
        for cell in notebook.get("cells", []):
            source = cell.get("source", [])
            lines = source if isinstance(source, list) else source.splitlines()
            for line in lines:
                n += 1
                if cell.get("cell_type") == "code":
                    yield n, line.rstrip("\n")
        return
    for n, line in enumerate(path.read_text(encoding="utf-8", errors="replace").splitlines(), 1):
        yield n, line


def audit(build: Path, docs: Path) -> int:
    api = json.loads((build / "api.json").read_text())
    actions = {a["name"]: a for a in json.loads((build / "actions.json").read_text())}
    versions = json.loads((build / "versions.json").read_text())
    stamp = f"PyBigDFT {versions['pybigdft']}, BigDFT {versions['bigdft']}"

    modules = {m["name"] for m in api["modules"]}
    unavailable = {u["module"]: u["error"] for u in api["unavailable"]}
    names = defaultdict(set)
    for c in api["classes"]:
        names[c["module"]].add(c["name"])
    for f in api["functions"]:
        if not f.get("cls"):
            names[f["module"]].add(f["name"])
    for c in api["constants"]:
        names[c["module"]].add(c["name"])
    for m in modules:                                    # a submodule is a name of its package
        if "." in m:
            names[m.rsplit(".", 1)[0]].add(m.rsplit(".", 1)[1])

    findings = defaultdict(list)                         # file -> [(line, code, problem)]
    counts = defaultdict(int)
    files = sorted(p for p in docs.rglob("*") if p.suffix in (".md", ".ipynb"))
    for path in files:
        inputs = set()
        lines = list(code_lines(path))
        for _, line in lines:
            for var in re.findall(r"\b(\w+)\s*=\s*(?:\w+\.)*Inputfile\(", line):
                inputs.add(var)
        for n, line in lines:
            code = line.strip()
            if code.startswith("#"):
                continue
            m = re.match(r"^(?:>>>\s*)?from\s+(BigDFT(?:\.\w+)*)\s+import\s+(.+)$", code)
            if m:
                module, imported = m.group(1), m.group(2).split("#")[0]
                if module in unavailable:
                    findings[path].append((n, code, f"`{module}` cannot be imported here ({unavailable[module]})"))
                    counts["module not importable"] += 1
                elif module not in modules:
                    findings[path].append((n, code, f"`{module}` does not exist in this version"))
                    counts["module absent"] += 1
                else:
                    for item in re.split(r"\s*,\s*", imported.strip("() ")):
                        name = item.split(" as ")[0].strip()
                        if name and name != "*" and name not in names[module]:
                            full = f"{module}.{name}"
                            if full in unavailable:
                                findings[path].append((n, code, f"`{full}` cannot be imported here ({unavailable[full]})"))
                                counts["module not importable"] += 1
                            else:
                                findings[path].append((n, code, f"`{module}` has no `{name}` in this version"))
                                counts["name absent"] += 1
            for var, method, rest in re.findall(r"\b(\w+)\.(\w+)\((.*)$", code):
                if var not in inputs or method in DICT_METHODS:
                    continue
                if method not in actions:
                    findings[path].append((n, code, f"`{method}` is not an input action of this version"))
                    counts["input action absent"] += 1
                    continue
                known = {p["name"] for p in actions[method]["parameters"]}
                if any(p["kind"] == "var_keyword" for p in actions[method]["parameters"]):
                    continue
                depth, args = 1, ""
                for ch in rest:
                    depth += ch in "([{"
                    depth -= ch in ")]}"
                    if depth == 0:
                        break
                    args += ch
                flat = re.sub(r"\([^()]*\)|\[[^\[\]]*\]|\{[^{}]*\}", "", args)
                for kw in re.findall(r"(?:^|,)\s*(\w+)\s*=(?!=)", flat):
                    if kw not in known:
                        takes = ", ".join(sorted(known)) or "no argument"
                        findings[path].append((n, code, f"`{method}` takes no `{kw}` in this version (it takes: {takes})"))
                        counts["argument absent"] += 1

    out = ["# Tutorial code against the installed PyBigDFT", "",
           f"Checked against **{stamp}**: {len(files)} pages under `{docs.name}/`, "
           f"{sum(len(v) for v in findings.values())} calls that cannot work with this version, in {len(findings)} pages.", "",
           "A static reading by pattern: what is listed is certain, what is not listed is not thereby correct.", ""]
    if counts:
        out += ["| Problem | Occurrences |", "|---|---|"] + [f"| {k} | {v} |" for k, v in sorted(counts.items(), key=lambda kv: -kv[1])] + [""]
    for path in sorted(findings):
        out += [f"## {path.relative_to(docs).as_posix()}", "", "| Line | Code | Problem |", "|---|---|---|"]
        out += [f"| {n} | `{code[:90].replace('|', '¦')}` | {problem} |" for n, code, problem in findings[path]]
        out.append("")
    target = HERE / "data" / "TUTORIAL_AUDIT.md"
    target.write_text("\n".join(out), encoding="utf-8")
    print(f"{target.relative_to(HERE)}: {sum(len(v) for v in findings.values())} findings in {len(findings)} of {len(files)} pages | "
          + ", ".join(f"{k} {v}" for k, v in counts.items()))
    return 0


if __name__ == "__main__":
    if len(sys.argv) != 3:
        print(__doc__)
        sys.exit(2)
    sys.exit(audit(Path(sys.argv[1]), Path(sys.argv[2])))
