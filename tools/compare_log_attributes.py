#!/usr/bin/env python3
"""Compare what the workshop bundles for a run with what PyBigDFT itself reads from its log.

    # in the pack's image, beside a runs/ directory:
    python3 workshop/library/pybigdft_attributes.py runs pybigdft.json
    # here:
    python tools/compare_log_attributes.py pybigdft.json

tools/build_logviews.py reads the attributes of a log by following the paths of
BigDFT.Logfiles.BUILTIN, without PyBigDFT. This checks that it gives what
`Logfile` gives, for every run of the library whose name is in the file.
Exit status 1 when a value differs or an attribute exists on one side only.
"""
from __future__ import annotations

import json
import math
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent


def same(a, b) -> bool:
    if isinstance(a, bool) or isinstance(b, bool):
        return str(a) == str(b)
    if isinstance(a, (int, float)) and isinstance(b, (int, float)):
        return math.isclose(a, b, rel_tol=1e-8, abs_tol=1e-12)
    if isinstance(a, list) and isinstance(b, list):
        return len(a) == len(b) and all(same(x, y) for x, y in zip(a, b))
    if isinstance(a, dict) and isinstance(b, dict):
        return set(map(str, a)) == set(map(str, b)) and all(same(v, b.get(k, b.get(str(k)))) for k, v in a.items())
    return str(a) == str(b)


def levels(items) -> list[float]:
    """Every level of the list a log holds, whichever way BigDFT wrote it."""
    out = []
    for item in items:
        for key in ("e", "e_occ", "e_vrt"):
            if key in item:
                out += item[key] if isinstance(item[key], list) else [item[key]]
    return sorted(out)


def main() -> int:
    theirs = json.loads(Path(sys.argv[1]).read_text())
    text = (ROOT / "workshop/js/library.js").read_text()
    library = json.loads(text.split("OND.library = ", 1)[1].rstrip().rstrip(";"))["runs"]
    mine = {run["name"]: run["log"] for run in library.values()}
    compared = runs = 0
    problems = []
    for name, attributes in theirs.items():
        if name not in mine:
            continue
        runs += 1
        for attribute in sorted(set(attributes) | set(mine[name])):
            if attribute not in attributes or attribute not in mine[name]:
                problems.append(f"{name}: {attribute} only {'in PyBigDFT' if attribute in attributes else 'in the library'}")
                continue
            compared += 1
            if attribute == "evals":          # PyBigDFT turns the list into an array of levels per spin
                given = sorted(e for spin in attributes[attribute] for e in spin)
                ok = same(given, levels(mine[name][attribute]))
            else:
                ok = same(attributes[attribute], mine[name][attribute])
            if not ok:
                problems.append(f"{name}: {attribute} differs: {str(attributes[attribute])[:70]} | {str(mine[name][attribute])[:70]}")
    print(f"{compared} attribute values of {runs} runs compared with PyBigDFT: {len(problems)} problem(s)")
    for problem in problems[:20]:
        print("  ", problem)
    return 1 if problems or not runs else 0


if __name__ == "__main__":
    sys.exit(main())
