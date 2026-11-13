#!/usr/bin/env python3
"""Write the text corpus that ``aom_ingest`` turns into an AOM memory.

One self-contained passage per BigDFT variable and per profile, generated from
the extracted schema and the UI curation. Each passage states the facts the
ontology (``ontology/atelier.ttl``) has a slot for: section, block, level,
default, range, activation condition. Regenerate after a BigDFT upgrade.
"""
from __future__ import annotations

import json
from pathlib import Path

import yaml

ROOT = Path(__file__).resolve().parent.parent
LEVEL = {0: "essentiel", 1: "avancé", 2: "expert"}


def main() -> int:
    schema = json.loads((ROOT / "schema/bigdft-input.schema.json").read_text())
    tiers = yaml.safe_load((ROOT / "schema/ui-tiers.yaml").read_text())
    override = {p: b for b, ps in tiers["overrides"].items() for p in ps}
    out = [
        "# Variables d'entrée de BigDFT",
        "",
        f"Source : bigdft-suite, révision {schema['source_revision']}. Fichier généré par tools/build_aom_corpus.py.",
        "",
    ]
    count = 0
    for namespace, entry in schema["namespaces"].items():
        for section in entry["sections"]:
            for var in section["variables"]:
                path = f"{namespace}.{section['name']}.{var['name']}"
                shown = path.removeprefix("bigdft.")
                brique = tiers["briques"][override.get(path, tiers["sections"][f"{namespace}.{section['name']}"])]["label"]
                level = LEVEL[0 if path in tiers["essential"] else 1 if path in tiers["advanced"] else 2]
                lines = [
                    f"## {shown}",
                    "",
                    f"Le paramètre `{var['name']}` appartient à la section `{shown.rsplit('.', 1)[0]}` du fichier d'entrée "
                    f"({entry['source']}). Il est exposé dans la brique {brique}, au niveau {level}.",
                    f"Rôle : {var['comment']}." if var["comment"] else "",
                    f"Valeur par défaut : `{json.dumps(var['default'], ensure_ascii=False)}`.",
                ]
                if "range" in var:
                    lines.append(f"Valeurs admises : de {var['range'][0]} à {var['range'][1]}.")
                if "enum" in var:
                    lines.append("Valeurs possibles : " + "; ".join(
                        f"`{e['value']}`" + (f" ({e['label']})" if e["label"] else "") for e in var["enum"]) + ".")
                if "profiles" in var:
                    lines.append("Valeurs nommées : " + "; ".join(
                        f"`{k}` = `{json.dumps(v, ensure_ascii=False)}`" for k, v in var["profiles"].items()) + ".")
                if cond := var.get("condition"):
                    when = cond.get("when", cond.get("when_not"))
                    lines.append(f"N'a de sens que selon `{cond['master_key']}`" + (f" (valeurs : {when})." if when else "."))
                if "description" in var:
                    lines += ["", var["description"]]
                out += [line for line in lines if line != ""] + [""]
                count += 1
        for name, profile in entry.get("import_profiles", {}).items():
            out += [
                f"## Profil {name}",
                "",
                f"Le profil `{name}` s'appelle avec `import: {name}`. {profile['comment']}. {profile['description']}".strip(),
                f"Il fixe : `{json.dumps(profile['overrides'], ensure_ascii=False)}`.",
                "",
            ]
    target = ROOT / "ontology/corpus/bigdft-variables.md"
    target.write_text("\n".join(out))
    print(f"{target.relative_to(ROOT)}: {count} variables")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
