#!/usr/bin/env python3
"""Extract a machine-readable parameter schema from the BigDFT source tree.

BigDFT declares every input variable in YAML files that the Fortran code
itself loads at start-up (``input_variables_definition.yaml`` and friends).
These files are therefore the single source of truth for names, defaults,
ranges, allowed values, activation conditions and named profiles.

This tool normalises them into one JSON document that the web platform
consumes to generate forms, validate inputs and feed the ontological memory.
Nothing is hand-copied: re-run it against a new BigDFT release to refresh.

Usage:
    python tools/extract_schema.py /path/to/bigdft-suite -o schema/bigdft-input.schema.json
"""
from __future__ import annotations

import argparse
import json
import subprocess
import sys
from pathlib import Path
from typing import Any

import yaml

#: Source files, relative to the bigdft-suite root, and the namespace they define.
SOURCES = {
    "bigdft": "bigdft/src/input_variables_definition.yaml",
    "psolver": "psolver/src/PS_input_variables_definition.yaml",
    "chess": "chess/src/chess_input_variables_definition.yaml",
}

#: Keys reserved by the definition grammar (see the header of the BigDFT file).
META = {"COMMENT", "DESCRIPTION", "RANGE", "EXCLUSIVE", "CONDITION", "PROFILE_FROM"}


def infer_type(default: Any, exclusive: dict | None) -> str:
    """Infer a UI-level type from the declared default and allowed values."""
    if exclusive:
        return "enum"
    if isinstance(default, bool):
        return "boolean"
    if isinstance(default, int):
        return "integer"
    if isinstance(default, float):
        return "number"
    if isinstance(default, list):
        return "array"
    if isinstance(default, dict):
        return "object"
    if default is None:
        return "null"
    return "string"


def coerce(value: Any) -> Any:
    """YAML 1.1 reads ``1.e-4`` as a string; recover the intended number."""
    if isinstance(value, str):
        try:
            return float(value.lower().replace("d", "e")) if any(c.isdigit() for c in value) else value
        except ValueError:
            return value
    if isinstance(value, list):
        return [coerce(v) for v in value]
    return value


def is_variable(node: Any) -> bool:
    return isinstance(node, dict) and "default" in node


def parse_variable(name: str, node: dict) -> dict:
    exclusive = node.get("EXCLUSIVE")
    default = coerce(node["default"])
    var: dict[str, Any] = {
        "name": name,
        "type": infer_type(default, exclusive),
        "default": default,
        "comment": " ".join(str(node.get("COMMENT", "")).split()),
    }
    if description := " ".join(str(node.get("DESCRIPTION", "")).split()):
        var["description"] = description
    if "RANGE" in node:
        var["range"] = coerce(node["RANGE"])
    if exclusive:
        items = exclusive.items() if isinstance(exclusive, dict) else ((v, "") for v in exclusive)
        var["enum"] = [{"value": k, "label": " ".join(str(v).split())} for k, v in items]
    if cond := node.get("CONDITION"):
        var["condition"] = {
            "master_key": cond.get("MASTER_KEY"),
            **({"when": cond["WHEN"]} if "WHEN" in cond else {}),
            **({"when_not": cond["WHEN_NOT"]} if "WHEN_NOT" in cond else {}),
        }
    if "PROFILE_FROM" in node:
        var["profile_from"] = node["PROFILE_FROM"]
    # Anything that is neither grammar nor ``default`` is a named profile value.
    # Upstream has a few stray lower/upper-case grammar keys; never expose them as profiles.
    profiles = {
        k: coerce(v) for k, v in node.items()
        if str(k).upper() not in META | {"MASTER_KEY", "WHEN", "WHEN_NOT"} and k != "default"
    }
    if profiles:
        var["profiles"] = profiles
    return var


def parse_section(name: str, node: dict) -> dict:
    section: dict[str, Any] = {"name": name, "variables": []}
    if description := " ".join(str(node.get("DESCRIPTION", "")).split()):
        section["description"] = description
    if comment := " ".join(str(node.get("COMMENT", "")).split()):
        section["comment"] = comment
    for key, child in node.items():
        if key in META:
            continue
        if is_variable(child):
            section["variables"].append(parse_variable(str(key), child))
        elif isinstance(child, dict):
            # Nested group (e.g. psolver.environment): flatten with a dotted name.
            for sub, grandchild in child.items():
                if is_variable(grandchild):
                    section["variables"].append(parse_variable(f"{key}.{sub}", grandchild))
    return section


def git_revision(root: Path) -> str | None:
    try:
        out = subprocess.run(
            ["git", "-C", str(root), "log", "-1", "--format=%H %ad", "--date=short"],
            capture_output=True, text=True, check=True,
        )
        return out.stdout.strip()
    except (subprocess.CalledProcessError, FileNotFoundError):
        return None


def build(root: Path) -> dict:
    schema: dict[str, Any] = {
        "$comment": "Generated by tools/extract_schema.py - do not edit by hand.",
        "source_revision": git_revision(root),
        "namespaces": {},
    }
    for namespace, relative in SOURCES.items():
        path = root / relative
        if not path.exists():
            print(f"warning: {relative} not found, skipping", file=sys.stderr)
            continue
        documents = [d for d in yaml.safe_load_all(path.read_text()) if d]
        definitions = documents[0]
        sections = [parse_section(k, v) for k, v in definitions.items() if isinstance(v, dict)]
        entry: dict[str, Any] = {"source": relative, "sections": [s for s in sections if s["variables"]]}
        if len(documents) > 1:
            # Second document = named profiles callable with the ``import`` keyword.
            entry["import_profiles"] = {
                name: {
                    "comment": " ".join(str(body.get("COMMENT", "")).split()),
                    "description": " ".join(str(body.get("DESCRIPTION", "")).split()),
                    "overrides": {k: coerce(v) for k, v in body.items() if k not in META},
                }
                for name, body in documents[1].items() if isinstance(body, dict)
            }
        schema["namespaces"][namespace] = entry
    return schema


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("root", type=Path, help="path to a bigdft-suite checkout")
    parser.add_argument("-o", "--output", type=Path, default=Path("schema/bigdft-input.schema.json"))
    args = parser.parse_args()
    schema = build(args.root)
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(schema, indent=1, ensure_ascii=False, default=str) + "\n")
    total = sum(len(s["variables"]) for ns in schema["namespaces"].values() for s in ns["sections"])
    print(f"{args.output}: {total} variables in {len(schema['namespaces'])} namespaces")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
