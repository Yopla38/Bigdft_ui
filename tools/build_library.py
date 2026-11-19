#!/usr/bin/env python3
"""Bundle the real calculations the workshop shows (workshop/js/library.js).

    python tools/build_library.py RUNS_DIR [MORE_RUNS_DIR ...]

RUNS_DIR is the `runs/` directory of a study executed with the registry of
steps (for_pybigdft_pack/study): its manifest.json says which run is which and
what its input was. A directory without manifest is read from its NAME.yaml
inputs, all taken to start from the structure of the study.

A calculation is identified by what BigDFT was asked, not by a name: the input
with every key that equals BigDFT's default removed, plus the geometry it
started from. The workshop computes the same identity for a step of a study
and looks it up here. `identity()` below and `identity` in workshop/js/app.js
must stay the same function.
"""
from __future__ import annotations

import json
import re
import sys
from pathlib import Path

import yaml

sys.path.insert(0, str(Path(__file__).resolve().parent))
from build_results import relaxation, single_point  # noqa: E402

ROOT = Path(__file__).resolve().parent.parent
IMAGE = "bigdft/runtime@sha256:6f16f65f5b33ffe83e53d3c228c21a1e8eb97d0b426f4fad0c805d0bc0540336"
IGNORED = ("posinp", "psppar", "radical", "output.orbitals")    # do not change what is computed, or follow from the rest


def canon(value) -> str:
    if isinstance(value, bool):
        return "true" if value else "false"
    if isinstance(value, (int, float)):
        mantissa, exponent = ("%.9e" % float(value)).split("e")
        return f"{mantissa}e{int(exponent)}"
    if isinstance(value, (list, tuple)):
        items = [canon(v) for v in value]
        return items[0] if len(items) == 3 and len(set(items)) == 1 else "[" + ",".join(items) + "]"
    return str(value)


def flatten(node: dict, prefix: str = "") -> dict:
    out = {}
    for key, value in node.items():
        path = f"{prefix}.{key}" if prefix else str(key)
        if isinstance(value, dict):
            out.update(flatten(value, path))
        else:
            out[path] = value
    return out


def defaults() -> dict:
    schema = json.loads((ROOT / "schema/bigdft-input.schema.json").read_text())
    out = {}
    for namespace, body in schema["namespaces"].items():
        for section in body["sections"]:
            for var in section["variables"]:
                out[("" if namespace == "bigdft" else namespace + ".") + f"{section['name']}.{var['name']}"] = canon(var.get("default"))
    return out


def fnv(text: str) -> str:
    h = 0x811C9DC5
    for byte in text.encode("utf-8"):
        h = ((h ^ byte) * 0x01000193) & 0xFFFFFFFF
    return "%08x" % h


def identity(system: str, inp: dict, geometry: str, default: dict) -> str:
    flat = {p: canon(v) for p, v in flatten(inp).items() if not p.startswith(IGNORED)}
    kept = sorted(f"{p}={v}" for p, v in flat.items() if default.get(p) != v)
    return f"{system}|{';'.join(kept)}|geo={geometry}"


def read_run(directory: Path, name: str) -> dict | None:
    log = directory / f"log-{name}.yaml"
    run = single_point(log) if log.is_file() else None
    if run is None:
        return None
    keep = ("energy", "iters", "gnrm", "gnrm_cv", "converged", "warnings", "wall", "mem", "nc", "nf", "dof", "dipole", "fmax", "version", "omp", "mpi")
    out = {k: run.get(k) for k in keep}
    out["scf"] = [[r[0], r[1]] for r in run["scf"]]
    if "orbitals" in run:
        out["levels"] = run["orbitals"]
    text = log.read_text()
    walls = re.findall(r"Walltime since initialization\s*:\s*(\d+):(\d+):([\d.]+)", text)
    if walls:
        out["wall"] = round(int(walls[-1][0]) * 3600 + int(walls[-1][1]) * 60 + float(walls[-1][2]), 2)
    out["warnings"] = [re.sub(r"\s+", " ", re.sub(r"[{}'\"]", "", w)).replace("XC is XC: ", "XC is ") for w in out["warnings"]]
    rel = relaxation(log)
    final = directory / f"final_{name}.yaml"
    if rel and len(rel["steps"]) > 1 and final.is_file():
        positions = yaml.safe_load(final.read_text())["positions"]
        said = re.search(r"Iterations when (\w+) converged\s*:\s*(\d+)", text)
        out.update(energy=rel["energy"], fmax=rel["fmax"])
        out["relax"] = {"steps": rel["steps"], "said_converged": bool(said), "forcemax": rel["forcemax"],
                        "final": [[el, *[round(float(c), 5) for c in xyz]] for at in positions for el, xyz in at.items() if el != "force"]}
    return out


def main() -> int:
    if len(sys.argv) < 2:
        print(__doc__)
        return 2
    default, runs, system = defaults(), {}, "h2o"
    for directory in map(Path, sys.argv[1:]):
        manifest = directory / "manifest.json"
        if manifest.is_file():
            entries = [r for r in json.loads(manifest.read_text())["runs"] if not r["alias"]]
        else:
            entries = [{"name": p.stem, "geometry_from": None, "input": {k: v for k, v in yaml.safe_load(p.read_text()).items() if k != "posinp"}}
                       for p in sorted(directory.glob("*.yaml")) if (directory / f"log-{p.stem}.yaml").is_file() and not p.name.startswith(("log-", "final_"))]
        keys = {}
        for entry in entries:                                    # relaxations first: their identity names the geometry of others
            if not entry["geometry_from"]:
                keys[entry["name"]] = identity(system, entry["input"], "start", default)
        for entry in entries:
            if entry["geometry_from"]:
                keys[entry["name"]] = identity(system, entry["input"], "@" + fnv(keys[entry["geometry_from"]]), default)
        for entry in entries:
            result = read_run(directory, entry["name"])
            if result is None:
                print(f"  no finished log for {entry['name']} in {directory}")
                continue
            result["name"] = entry["name"]
            runs.setdefault(keys[entry["name"]], result)
    out = ROOT / "workshop/js/library.js"
    out.write_text("// Generated by tools/build_library.py from real BigDFT runs - do not edit.\n"
                   "window.OND = window.OND || {};\n"
                   f"OND.library = {json.dumps({'system': system, 'image': IMAGE, 'runs': runs}, ensure_ascii=False, separators=(',', ':'))};\n")
    relaxations = sum(1 for r in runs.values() if "relax" in r)
    print(f"{out.relative_to(ROOT)}: {len(runs)} calculations ({relaxations} relaxations), {out.stat().st_size // 1024} kB")
    for key in list(runs)[:3] + [k for k in runs if "geo=@" in k][:2]:
        print("  ", key)
    return 0


if __name__ == "__main__":
    sys.exit(main())
