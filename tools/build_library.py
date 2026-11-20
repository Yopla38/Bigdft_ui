#!/usr/bin/env python3
"""Bundle the real calculations the workshop shows (workshop/js/library.js).

    python tools/build_library.py RUNS_DIR [MORE_RUNS_DIR ...]

RUNS_DIR is the `runs/` directory of a study executed with the registry of
steps (for_pybigdft_pack/study): its manifest.json says which run is which and
what its input was. A directory without manifest is read from its NAME.yaml
inputs, all taken to start from the structure of the study.

A calculation is identified by what BigDFT was asked, not by a name: the input
with every key that equals BigDFT's default removed, plus the geometry it
started from, and the run whose wavefunctions it read if any. The workshop
computes the same identity for a step of a study and looks it up here.
`identity()` below and `identity` in workshop/js/model.js must stay the same
function.

Besides what the figures need, each run keeps every attribute PyBigDFT's
Logfile gives for its log (tools/build_logviews.py): the workshop draws its
result views from that registry.
"""
from __future__ import annotations

import json
import re
import sys
from pathlib import Path

import yaml

sys.path.insert(0, str(Path(__file__).resolve().parent))
from build_logviews import attribute_values, attributes, latest_build  # noqa: E402
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


HA_EV = 27.211386245988
GAP = "HOMO LUMO gap (AU, eV)"


def tidy(value):
    """A value of the log, light enough to bundle: ten significant digits are more than a log prints reliably."""
    if isinstance(value, float):
        return float("%.10g" % value)
    if isinstance(value, dict):
        return {str(k): tidy(v) for k, v in value.items()}
    if isinstance(value, (list, tuple)):
        return [tidy(v) for v in value]
    return value


def empty_states(doc: dict) -> dict:
    """Empty levels and gap, in eV, as BigDFT prints them after the occupied ones."""
    listed = doc.get("Complete list of energy eigenvalues") or []
    spins = lambda v: v if isinstance(v, list) else [v]                       # noqa: E731
    empty, gap = [[], []], None
    for item in listed:
        if "e_vrt" in item:
            for spin, e in enumerate(spins(item["e_vrt"])):
                empty[spin].append(round(e * HA_EV, 4))
        if GAP in item:
            gap = [round(g, 4) for g in item[GAP][len(item[GAP]) // 2:]]
    return {"empty": {"up": sorted(empty[0]), "down": sorted(empty[1])}, "gap": gap} if gap else {}


def read_run(directory: Path, name: str, registry: list[dict]) -> dict | None:
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
    documents = [d for d in yaml.load_all(text, Loader=getattr(yaml, "CSafeLoader", yaml.SafeLoader)) if isinstance(d, dict)]
    out["log"] = tidy(attribute_values(documents, registry))
    out.update(empty_states(documents[-1]))
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
    default, runs, system, registry = defaults(), {}, "h2o", attributes(latest_build())
    for directory in map(Path, sys.argv[1:]):
        manifest = directory / "manifest.json"
        if manifest.is_file():
            entries = [r for r in json.loads(manifest.read_text())["runs"] if not r["alias"]]
        else:
            entries = [{"name": p.stem, "geometry_from": None, "input": {k: v for k, v in yaml.safe_load(p.read_text()).items() if k != "posinp"}}
                       for p in sorted(directory.glob("*.yaml")) if (directory / f"log-{p.stem}.yaml").is_file() and not p.name.startswith(("log-", "final_"))]
        keys, by_name = {}, {e["name"]: e for e in entries}

        def key(name):                                           # the identity of a run names the runs it starts from
            if name not in keys:
                entry = by_name[name]
                geometry = "@" + fnv(key(entry["geometry_from"])) if entry["geometry_from"] else "start"
                orbitals = "|wf=@" + fnv(key(entry["wavefunctions_from"])) if entry.get("wavefunctions_from") else ""
                keys[name] = identity(system, entry["input"], geometry, default) + orbitals
            return keys[name]

        for entry in entries:
            key(entry["name"])
            result = read_run(directory, entry["name"], registry)
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
