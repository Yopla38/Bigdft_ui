#!/usr/bin/env python3
"""Ask the memory the questions of eval/questions.yaml and count the right answers.

    python eval/retrieval.py /path/to/pack            (the Python the pack runs under)
    python eval/retrieval.py --db memory.db --snippets /path/to/snippets

For each question it calls `query_memory`, the tool the agent itself calls, and
looks for the expected snippet among the verbatim artifacts of the context
returned: is it there, and in which position. No model answers anything: this
measures what the agent is GIVEN to answer from, which is what the graph decides.

Run it before and after loading the API graph to see what the graph changes.
"""
from __future__ import annotations

import argparse
import asyncio
import hashlib
import importlib.util
import os
import re
import sys
from pathlib import Path

import yaml

HERE = Path(__file__).resolve().parent


def memory_tools():
    import aom_ingest

    path = Path(aom_ingest.__file__).parent.parent / "memory_tools.py"
    spec = importlib.util.spec_from_file_location("pack_memory_tools", path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("pack", nargs="?", help="the pack directory: its config.yaml names the database")
    parser.add_argument("--db")
    parser.add_argument("--snippets", default=str(HERE.parent / "snippets"))
    args = parser.parse_args()

    db = args.db
    if not db:
        config = yaml.safe_load((Path(args.pack) / "config.yaml").read_text())
        for agent in (config.get("agents") or {}).values():
            for entry in ((agent.get("tools") or {}).get("native") or []):
                env = {k: str(v).replace("{here}", str(Path(args.pack).resolve())) for k, v in (entry.get("env") or {}).items()}
                if env.get("MEMORY_DB"):
                    os.environ.update(env)
                    db = env["MEMORY_DB"]
    if not db or not Path(db).exists():
        raise SystemExit(f"memory database not found: {db}")

    tools = memory_tools()
    questions = yaml.safe_load((HERE / "questions.yaml").read_text())
    found, first, lines = 0, 0, []
    for item in questions:
        code = (Path(args.snippets) / item["expects"]).read_text()
        wanted = "sha256_" + hashlib.sha256(code.encode()).hexdigest()[:12]
        context = asyncio.run(tools.query_memory(item["question"], db_path=db))
        artifacts = re.findall(r"^\[code (sha256_[0-9a-f]+)\]", context, re.M)
        rank = artifacts.index(wanted) + 1 if wanted in artifacts else 0
        found += rank > 0
        first += rank == 1
        lines.append(f"{'first' if rank == 1 else ('#%d' % rank if rank else 'ABSENT'):6s} {item['expects']:44s} {item['question'][:70]}")
    print("\n".join(lines))
    print(f"\n{found} of {len(questions)} questions bring back the expected snippet, {first} of them in first position.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
