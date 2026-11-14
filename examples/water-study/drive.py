#!/usr/bin/env python3
"""Stand-in for the HAPS, for this example.

It does to each prepared run what the HAPS of the PyBigDFT pack does, with the
pack's own modules for everything but the service: select the files of the run,
pack them, check the archive, unpack it in a fresh directory, run the one
command `bigdft -n NAME` there in the pinned image, and copy back what the run
created or changed. `study.py` runs in the same image, for `prepare` and
`analyse`. No ebservice, no buffer: the transport is not exercised.

    python drive.py attempt-2 --pack /path/to/Pack_pybigdft_HAPS/haps

With the pack as published, wavefunction files are not selected: a run that
restarts from them starts from scratch and BigDFT says so in its log. With
docs/patches/haps-wavefunctions.patch applied, they travel.
"""
from __future__ import annotations

import argparse
import ast
import shutil
import subprocess
import sys
import time
from pathlib import Path

IMAGE = "bigdft/runtime@sha256:6f16f65f5b33ffe83e53d3c228c21a1e8eb97d0b426f4fad0c805d0bc0540336"
ENV = "source /usr/local/bigdft/bin/bigdftvars.sh >/dev/null 2>&1; export OMP_NUM_THREADS={threads}; "


def in_image(image: str, directory: Path, command: str, threads: int) -> subprocess.CompletedProcess:
    subprocess.run(["chmod", "-R", "a+rwX", str(directory)], check=True)
    return subprocess.run(["docker", "run", "--rm", "-v", f"{directory.resolve()}:/work", "-w", "/work", image,
                           "bash", "-c", ENV.format(threads=threads) + command], capture_output=True, text=True)


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("study", type=Path, help="directory holding study.py and structure.yaml")
    ap.add_argument("--pack", type=Path, required=True, help="the haps/ directory of the PyBigDFT pack")
    ap.add_argument("--image", default=IMAGE)
    ap.add_argument("--threads", type=int, default=4)
    args = ap.parse_args()
    sys.path.insert(0, str(args.pack.resolve()))
    from pybigdft_haps import archive, inputs  # the rule both sides of the HAPS apply

    study, runs = args.study.resolve(), args.study.resolve() / "runs"
    runs.mkdir(exist_ok=True)
    journal = (study / "haps.txt").open("a")

    def say(line: str) -> None:
        print(line)
        journal.write(line + "\n")
        journal.flush()

    for wave in range(1, 8):
        out = in_image(args.image, study, "python3 study.py prepare", args.threads)
        lists = {k: ast.literal_eval(v.strip()) for k, v in
                 (line.split(":", 1) for line in out.stdout.splitlines() if line.startswith(("ready", "waiting", "refused")))}
        if "ready for the HAPS" not in lists:
            print(out.stdout[-2000:], out.stderr[-2000:])
            return 1
        say(f"wave {wave}: ready {lists['ready for the HAPS']}, waiting {lists.get('waiting for an earlier run', [])}, "
            f"refused {lists.get('refused by the dry run', [])}")
        if lists.get("refused by the dry run") or not lists["ready for the HAPS"]:
            break
        for name in lists["ready for the HAPS"]:
            selected = inputs.select(runs, name)
            data = archive.pack(selected)
            inputs.check(archive.members(data), name)
            work = study / ".haps" / name
            shutil.rmtree(work, ignore_errors=True)
            work.mkdir(parents=True)
            archive.unpack(data, work)
            before = archive.snapshot(work)
            start = time.monotonic()
            done = in_image(args.image, work, f"bigdft -n {name} > stdout.log 2> stderr.log; echo exit=$?", args.threads)
            code = done.stdout.strip().rsplit("exit=", 1)[-1]
            changed = [rel for rel, digest in archive.snapshot(work).items() if before.get(rel) != digest]
            for rel in changed:
                if rel in ("stdout.log", "stderr.log"):
                    continue
                (runs / rel).parent.mkdir(parents=True, exist_ok=True)
                shutil.copy2(work / rel, runs / rel)
            back = sum((work / rel).stat().st_size for rel in changed)
            say(f"[{'OK' if code == '0' else 'FAILED (exit ' + code + ')'}] bigdft -n {name}, {time.monotonic() - start:.0f}s | "
                f"sent {len(selected)} files, {len(data)} bytes packed | back {len(changed)} files, {back} bytes")
            shutil.rmtree(work, ignore_errors=True)
    shutil.rmtree(study / ".haps", ignore_errors=True)
    out = in_image(args.image, study, "python3 study.py analyse", args.threads)
    (study / "analyse.txt").write_text(out.stdout)
    print(out.stdout)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
