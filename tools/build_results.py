#!/usr/bin/env python3
"""Extract a compact, typed result set from a real BigDFT campaign.

The prototype shows results that were actually computed: the dSCF triplet
energy study of the tetrapeptide 6a, run with BigDFT 1.9.5 on TSUBAME4.0 and
published with its logs in BigDFT-group/capsule-maker (MIT licence), under
``Open-Scientific-Intelligence-Hackathon-2026/knowledge-capsule-artefacts-claude-opus-5.5/
phase-2-growth/bigdft-6a-tsubame``.

This tool reads the BigDFT logfiles of that directory (plain YAML, no PyBigDFT
needed) and writes ``prototype/js/results.js``. Every number in the Results
space comes from here; nothing is typed by hand. It is also the shape of what
an *extractor* returns in production: small, typed tables, never the raw log.

    python tools/build_results.py /path/to/bigdft-6a-tsubame
"""
from __future__ import annotations

import json
import re
import sys
from pathlib import Path

import yaml

ROOT = Path(__file__).resolve().parent.parent
LOADER = getattr(yaml, "CSafeLoader", yaml.SafeLoader)
HA_EV = 27.211386245988

STAGES = [  # directory, label, what links it to the previous ones
    ("00_phase2_grid_pbe", "Grid study, S0", "series"),
    ("01_t1_scf_rerun", "Grid study, T1", "series"),
    ("02_pbe_s1_wavefunctions", "PBE at the S1 geometry", "handover"),
    ("03_pbe0_s1_vertical", "PBE0 vertical, S1 geometry", "handover"),
    ("04_geopt_free", "Relaxation, all atoms", "handover"),
    ("05_geopt_constrained", "Relaxation, chromophore only", "handover"),
    ("06_pbe_cg_wavefunctions", "PBE at the relaxed geometries", "handover"),
    ("07_pbe0_cg", "PBE0 at the relaxed geometries", "handover"),
]


def documents(path: Path) -> list[dict]:
    with path.open() as handle:
        return [doc for doc in yaml.load_all(handle, Loader=LOADER) if isinstance(doc, dict)]


def seconds(doc: dict) -> float | None:
    return (doc.get("Timings for root process") or {}).get("Elapsed time (s)")


def scf(doc: dict) -> tuple[list, list | None]:
    """All wavefunction iterations of a run, and the orbitals of its last cycle."""
    rows, orbitals, n = [], None, 0
    for block in doc.get("Ground State Optimization") or []:
        for cycle in block.get("Hamiltonian Optimization") or []:
            sub = cycle.get("Subspace Optimization") or {}
            for it in sub.get("Wavefunctions Iterations") or []:
                if "gnrm" in it:
                    n += 1
                    rows.append([n, float(it["gnrm"]), round(float(it["EKS"]), 7)])
            orbitals = sub.get("Orbitals", orbitals)
    return rows, orbitals


def single_point(directory: Path) -> dict | None:
    logs = sorted(directory.glob("log-*.yaml"))
    if not logs:
        return None
    doc = documents(logs[0])[0]
    if "Energy (Hartree)" not in doc:
        return None
    dft = doc["dft"]
    rows, orbitals = scf(doc)
    grid = doc["Wavefunctions Descriptors, full simulation domain"]
    nc, nf = grid["Coarse resolution grid"]["No. of points"], grid["Fine resolution grid"]["No. of points"]
    hgrid = dft["hgrids"] if not isinstance(dft["hgrids"], list) else dft["hgrids"][0]
    run = {
        "id": doc["radical"],
        "xc": {"-101130": "PBE", "-406": "PBE0", "11": "PBE", "1": "LDA"}.get(str(dft["ixc"]), str(dft["ixc"])),
        "nspin": dft.get("nspin", 1), "mpol": dft.get("mpol", 0),
        "h": float(hgrid), "rmult": [float(x) for x in dft["rmult"]],
        "gnrm_cv": float(dft["gnrm_cv"]),
        "energy": doc["Energy (Hartree)"],
        "fmax": (doc.get("Clean forces norm (Ha/Bohr)") or {}).get("maxval"),
        "iters": len(rows), "gnrm": rows[-1][1] if rows else None,
        "converged": bool(rows) and rows[-1][1] <= float(dft["gnrm_cv"]),
        "warnings": [str(w) for w in doc.get("WARNINGS") or []],
        "wall": seconds(doc), "cores": doc["Number of MPI tasks"] * doc["Maximal OpenMP threads per MPI task"],
        "mpi": doc["Number of MPI tasks"], "omp": doc["Maximal OpenMP threads per MPI task"],
        "mem": doc.get("Estimated Memory Peak (MB)"),
        "nc": nc, "nf": nf, "dof": nc + 7 * nf,
        "dipole": (doc.get("Electric Dipole Moment (Debye)") or {}).get("norm(P)"),
        "version": doc.get("Version Number"), "date": str(doc.get("Timestamp of this run", ""))[:10],
        "scf": rows,
    }
    if orbitals:
        run["orbitals"] = {
            "up": [round(o["e"] * HA_EV, 4) for o in orbitals if o.get("s", 1) == 1],
            "down": [round(o["e"] * HA_EV, 4) for o in orbitals if o.get("s", 1) == -1],
        }
    forces = doc.get("Atomic Forces (Ha/Bohr)")
    if forces:
        run["forces"] = [round(sum(c * c for c in next(iter(f.values()))) ** 0.5, 5) for f in forces]
    return run


def relaxation(directory: Path) -> dict | None:
    logs = sorted(directory.glob("log-*.yaml"))
    if not logs:
        return None
    docs = documents(logs[0])
    steps = [
        [d["Energy (Hartree)"], (d.get("Clean forces norm (Ha/Bohr)") or {}).get("maxval")]
        for d in docs if "Energy (Hartree)" in d
    ]
    if not steps:
        return None
    head = docs[0]
    frozen = sum(1 for at in head["posinp"]["positions"] if "Frozen" in at)
    return {
        "id": head["radical"], "method": head["geopt"]["method"], "forcemax": float(head["geopt"]["forcemax"]),
        "nspin": head["dft"].get("nspin", 1), "frozen": frozen,
        "steps": [[round(e, 7), f] for e, f in steps],
        "energy": steps[-1][0], "fmax": steps[-1][1],
        "done": steps[-1][1] is not None and steps[-1][1] <= float(head["geopt"]["forcemax"]),
        "wall": sum(seconds(d) or 0 for d in docs[-1:]) or None,
    }


def bibliography(root: Path) -> list[dict]:
    """The references BigDFT itself asks to cite, from the .bib written beside each log."""
    seen: dict[str, dict] = {}
    for bib in sorted(root.rglob("log-*.bib")):
        for key, body in re.findall(r"@\w+\{(\w+),(.*?)\n\}", bib.read_text(), re.S):
            field = lambda name: (re.search(name + r"\s*=\s*[{\"](.*?)[}\"],?\s*\n", body, re.S | re.I) or [None, ""])[1]
            clean = lambda s: re.sub(r"[{}]", "", " ".join(s.split()))
            authors = [a.split(",")[0].strip() for a in clean(field("author")).split(" and ") if a.strip()]
            seen.setdefault(key, {
                "key": key, "title": clean(field("title")), "journal": clean(field("journal")),
                "volume": clean(field("volume")), "pages": clean(field("pages")), "year": clean(field("year")),
                "doi": clean(field("doi")), "author": (authors[0] + " et al." if len(authors) > 2 else " and ".join(authors)),
            })
    return list(seen.values())


def capsule(directory: Path) -> dict | None:
    """What the Study space shows of the research capsule that carries this work.

    Reviewer identifiers are not copied: the page says that the capsule was
    approved and when, not by whom.
    """
    manifest = directory / "manifest.json"
    if not manifest.exists():
        return None
    m = json.loads(manifest.read_text())
    parent = m.get("parent") or {}
    new = set(parent.get("new_record_ids", []))
    count = lambda items, key: {k: sum(1 for i in items if i[key] == k) for k in sorted({i[key] for i in items})}
    records = []
    for r in m["records"]:
        text = " ".join(r["content"].split())
        who = re.match(r"\[([^\]]+)\]\s*", text)
        records.append({
            "id": r["id"], "kind": r["kind"], "status": r["status"], "new": r["id"] in new,
            "by": who.group(1) if who else "", "text": (text[who.end():] if who else text)[:260],
            "supersedes": r.get("supersedes") or [],
        })
    return {
        "schema": m["schema_version"], "id": m.get("capsule_id", "")[:19], "goal": m["goal"]["objective"], "tags": m["goal"]["tags"],
        "parent": {"id": parent.get("capsule_id", "")[:19], "inherited": len(parent.get("inherited_record_ids", [])),
                   "new": len(new), "revised": len(parent.get("revised_record_ids", []))} if parent else None,
        "approved": (m.get("review") or {}).get("approved_at", "")[:10],
        "kinds": count(m["records"], "kind"), "statuses": count(m["records"], "status"),
        "inventory": {"files": len(m["inventory"]), "bytes": sum(i["size"] for i in m["inventory"]), "roles": count(m["inventory"], "role")},
        "packages": m.get("dependencies", {}).get("packages", []),
        "records": records,
    }


def main() -> int:
    if len(sys.argv) != 2:
        print(__doc__, file=sys.stderr)
        return 2
    root = Path(sys.argv[1]).resolve()
    results, inputs = root / "results", root / "inputs"

    stages, runs, relax = [], {}, {}
    for name, label, link in STAGES:
        done = sorted(p for p in (results / name).iterdir() if p.is_dir()) if (results / name).is_dir() else []
        planned = len(list((inputs / name).glob("*.yaml"))) if (inputs / name).is_dir() else 0
        ids = []
        for directory in done:
            item = relaxation(directory) if "geopt" in name else single_point(directory)
            if not item:
                continue
            item["stage"] = name
            key = f"{name}/{item['id']}"  # the same radical is re-run in a later stage
            if name.startswith(("00_", "01_")):
                # a grid study is read as a table: keep the totals, not every iteration
                for heavy in ("scf", "orbitals", "forces"):
                    item.pop(heavy, None)
            (relax if "geopt" in name else runs)[key] = item
            ids.append(key)
            print(f"  {name}/{item['id']}: E = {item['energy']:.6f} Ha", file=sys.stderr)
        stages.append({"id": name, "label": label, "link": link, "planned": max(planned, len(ids)), "done": len(ids), "runs": ids})

    any_log = documents(next((results / "02_pbe_s1_wavefunctions").rglob("log-*.yaml")))[0]
    radii = {
        key.split(".")[1]: {"coarse": round(v["Radii of active regions (AU)"]["Coarse"], 4), "fine": round(v["Radii of active regions (AU)"]["Fine"], 4)}
        for key, v in any_log.items() if key.startswith("psppar.")
    }
    xyz = (root.parent / "capsule-C2/C2/bigdft/6a_S1.xyz")
    xyz = xyz if xyz.exists() else next(root.parent.parent.rglob("6a_S1.xyz"))
    lines = xyz.read_text().splitlines()
    atoms = [[parts[0]] + [round(float(x), 4) for x in parts[1:4]] for parts in (l.split() for l in lines[2:2 + int(lines[0])])]
    summary = json.loads((root / "analysis/summary.json").read_text())

    study = {
        "source": {
            "repository": "BigDFT-group/capsule-maker",
            "path": "Open-Scientific-Intelligence-Hackathon-2026/knowledge-capsule-artefacts-claude-opus-5.5/phase-2-growth/bigdft-6a-tsubame",
            "licence": "MIT", "machine": "TSUBAME4.0", "code": any_log.get("Version Number"),
        },
        "title": "Triplet energy of the tetrapeptide 6a by ΔSCF",
        "system": {"name": "6a", "formula": "C31H34N4O7S", "electrons": any_log["Total Number of Electrons"], "atoms": atoms,
                   "box": any_log["Sizes of the simulation domain"]["Angstroem"]},
        "target": {"eV": summary["target_eV"], "window": summary["window_eV"]},
        "radii": radii, "stages": stages, "runs": runs, "relax": relax,
        "references": bibliography(results),
        "capsule": capsule(root.parent / "capsule-C2/C2"),
    }
    out = ROOT / "prototype/js/results.js"
    out.write_text(
        "// Generated by tools/build_results.py from real BigDFT logs - do not edit.\n"
        "// Source: BigDFT-group/capsule-maker (MIT licence), dSCF triplet energy of 6a on TSUBAME4.0.\n"
        "window.OND = window.OND || {};\n"
        f"OND.study = {json.dumps(study, ensure_ascii=False, separators=(',', ':'))};\n"
    )
    print(f"{out.relative_to(ROOT)}: {len(runs)} single points, {len(relax)} relaxations, "
          f"{len(study['references'])} references, {out.stat().st_size // 1024} kB")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
