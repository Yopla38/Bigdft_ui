#!/usr/bin/env python3
"""What changed in PyBigDFT between two builds.

    python tools/compare_builds.py build/pybigdft-0.9_bigdft-1.9.1 build/pybigdft-1.0_bigdft-1.9.5

Compares what extract.py read from two images and writes data/CHANGES.md:
functions and classes that appeared or went, signatures that changed, input
actions that write something else, input variables added, removed or with
another default, and snippets that no longer pass. That last list is what to
read first: a snippet that passed and now fails is a behaviour that changed.
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent.parent


def load(build: Path):
    read = lambda name: json.loads((build / name).read_text())
    api = read("api.json")
    return {
        "versions": read("versions.json"),
        "modules": {m["name"] for m in api["modules"]},
        "unavailable": {u["module"]: u["error"] for u in api["unavailable"]},
        "classes": {f"{c['module']}.{c['name']}": c["signature"] for c in api["classes"]},
        "functions": {f"{f['module']}.{f['qualname']}": f["signature"] for f in api["functions"]},
        "attributes": {a["name"] for a in api["attributes"]},
        "actions": {a["name"]: a for a in read("actions.json")},
        "parameters": {p["path"]: p["default"] for p in read("parameters.json")},
        "snippets": {s["file"]: s for s in read("snippets.json")},
    }


def section(title: str, rows: list[str]) -> list[str]:
    return [f"## {title}", ""] + (rows or ["Nothing."]) + [""]


def main() -> int:
    if len(sys.argv) != 3:
        print(__doc__)
        return 2
    old, new = load(Path(sys.argv[1])), load(Path(sys.argv[2]))
    stamp = lambda b: f"PyBigDFT {b['versions']['pybigdft']}, BigDFT {b['versions']['bigdft']}"
    out = ["# Changes in PyBigDFT", "", f"From **{stamp(old)}** to **{stamp(new)}**.", ""]

    broken = [f"- `{f}`: passed, now FAILS\n\n  ```\n  " + "\n  ".join(new["snippets"][f]["output"].splitlines()[-6:]) + "\n  ```"
              for f, s in old["snippets"].items()
              if s["status"] == "passed" and f in new["snippets"] and new["snippets"][f]["status"] != "passed"]
    fixed = [f"- `{f}`: failed, now passes" for f, s in old["snippets"].items()
             if s["status"] != "passed" and f in new["snippets"] and new["snippets"][f]["status"] == "passed"]
    out += section("Snippets whose behaviour changed", broken + fixed)

    def diff(kind: str, a: dict, b: dict, changed: str) -> list[str]:
        rows = [f"- added `{k}`" + (f" `{b[k]}`" if isinstance(b, dict) and b[k] else "") for k in sorted(set(b) - set(a))]
        rows += [f"- removed `{k}`" for k in sorted(set(a) - set(b))]
        if isinstance(a, dict):
            rows += [f"- `{k}`: {changed} `{a[k]}` → `{b[k]}`" for k in sorted(set(a) & set(b)) if a[k] != b[k]]
        return rows

    out += section("Modules", diff("module", old["modules"], new["modules"], "")
                   + [f"- `{m}` cannot be imported any more: {e}" for m, e in new["unavailable"].items() if m not in old["unavailable"]]
                   + [f"- `{m}` can now be imported" for m in old["unavailable"] if m not in new["unavailable"]])
    out += section("Classes", diff("class", old["classes"], new["classes"], "constructor"))
    out += section("Functions and methods", diff("function", old["functions"], new["functions"], "signature"))
    out += section("Attributes of a Logfile", diff("attribute", old["attributes"], new["attributes"], ""))
    writes = lambda b: {k: json.dumps(a["writes"], sort_keys=True) for k, a in b["actions"].items() if a["writes"] is not None}
    out += section("What input actions write", diff("action", writes(old), writes(new), "writes"))
    out += section("Input variables printed in a log", diff("variable", old["parameters"], new["parameters"], "default"))

    target = HERE / "data" / "CHANGES.md"
    target.write_text("\n".join(out), encoding="utf-8")
    print(f"{target.relative_to(HERE)}: {len(broken)} snippet(s) broken, "
          f"{len(set(new['functions']) - set(old['functions']))} functions added, "
          f"{len(set(old['functions']) - set(new['functions']))} removed")
    return 0


if __name__ == "__main__":
    sys.exit(main())
