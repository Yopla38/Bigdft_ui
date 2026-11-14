#!/usr/bin/env python3
"""Compare two extracted schemas: what an upgrade of the pinned BigDFT changes.

Usage:  python tools/diff_schema.py schema/bigdft-input.schema.json schema/bigdft-input.devel.schema.json

Exit status is 1 when a variable curated as essential or advanced in
``schema/ui-tiers.yaml`` is missing from the second schema: the interface would
lose a control.
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

import yaml

ROOT = Path(__file__).resolve().parent.parent


def load(path: str) -> tuple[str, dict, set]:
    schema = json.loads(Path(path).read_text())
    variables = {
        f"{ns}.{section['name']}.{var['name']}": var
        for ns, entry in schema["namespaces"].items() for section in entry["sections"] for var in section["variables"]
    }
    profiles = {f"{ns}:{name}" for ns, entry in schema["namespaces"].items() for name in entry.get("import_profiles", {})}
    return schema["source_revision"], variables, profiles


def main() -> int:
    if len(sys.argv) != 3:
        print(__doc__, file=sys.stderr)
        return 2
    (rev_a, a, prof_a), (rev_b, b, prof_b) = load(sys.argv[1]), load(sys.argv[2])
    print(f"from {rev_a} ({len(a)} variables)\n  to {rev_b} ({len(b)} variables)\n")
    for title, items in (
        ("added", sorted(set(b) - set(a))),
        ("removed", sorted(set(a) - set(b))),
        ("default changed", [f"{k}: {a[k]['default']!r} -> {b[k]['default']!r}" for k in sorted(set(a) & set(b)) if a[k]["default"] != b[k]["default"]]),
        ("profiles added", sorted(prof_b - prof_a)),
        ("profiles removed", sorted(prof_a - prof_b)),
    ):
        print(f"{title} ({len(items)})" + "".join(f"\n  {item}" for item in items))
    tiers = yaml.safe_load((ROOT / "schema/ui-tiers.yaml").read_text())
    lost = sorted((set(tiers["essential"]) | set(tiers["advanced"])) - set(b))
    if lost:
        print("\ncurated controls missing from the target:" + "".join(f"\n  {item}" for item in lost))
    return 1 if lost else 0


if __name__ == "__main__":
    raise SystemExit(main())
