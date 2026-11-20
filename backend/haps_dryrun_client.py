"""The pack's `bigdft-tool`: PyBigDFT's dry run, sent to the dry-run HAPS.

    bigdft-tool -a memory-estimation [-l] --name=NAME [-n NPROC]

PyBigDFT's ``SystemCalculator(dry_run=True)`` writes NAME.yaml in its run
directory, runs ``$BIGDFT_ROOT/bigdft-tool -a memory-estimation -l --name=NAME``
there, and reads the log-NAME.yaml (and debug/, when BigDFT refused the input)
that appears. BigDFT itself is not installed here: ``run_pybigdft`` points
BIGDFT_ROOT at tools/bigdft_bin/, whose ``bigdft-tool`` runs this file.

This file holds no credentials and moves no file. It asks the HAPS MCP bridge
(``haps_dryrun``) to dry-run NAME.yaml of the current directory; the bridge,
which shares the agent's working directory, sends the inputs to the dry-run
HAPS (``memguess NPROC NAME dd l`` there) and writes what comes back beside
NAME.yaml — exactly where PyBigDFT looks.

Environment (set by run_pybigdft):
    PYBIGDFT_WORKDIR         the agent's working directory = the bridge's [mcp] workdir
    PYBIGDFT_HAPS_MCP_URL    the bridge (default http://127.0.0.1:8790/mcp)
    PYBIGDFT_DRYRUN_TIMEOUT  seconds to wait for an answer (default 300)

Exit codes: 0 valid, 1 refused by BigDFT, 2 not run (bridge, HAPS, arguments),
3 an action other than memory-estimation.
"""

from __future__ import annotations

import argparse
import asyncio
import os
import re
import sys
import time
from collections.abc import Mapping
from pathlib import Path

DEFAULT_URL = "http://127.0.0.1:8790/mcp"
DEFAULT_TIMEOUT_S = 300
_RUNNING = re.compile(r"^\[RUNNING\] still running after [^:]+: (?P<ids>[^—]+?) —", re.M)

VALID, INVALID, NOT_RUN, REFUSED = 0, 1, 2, 3


class DryRunError(RuntimeError):
    pass


def parse(argv: list[str]) -> argparse.Namespace:
    """bigdft-tool's own options, as PyBigDFT passes them; anything else is an error."""
    parser = argparse.ArgumentParser(
        prog="bigdft-tool", add_help=False,
        description="The pack's bigdft-tool: memory-estimation only, on the dry-run HAPS.")
    parser.add_argument("-a", "--action", default="memory-estimation")
    parser.add_argument("-l", "--logging", action="store_true")
    parser.add_argument("--name", default="")
    parser.add_argument("-n", "--mpi", dest="nproc", type=int, default=1)
    args, unknown = parser.parse_known_args(argv)
    args.unknown = unknown
    return args


def relative_directory(cwd: Path, workdir: str | None) -> str:
    """The current directory, relative to the agent's working directory."""
    if not workdir:
        raise DryRunError("PYBIGDFT_WORKDIR is not set: run your script with run_pybigdft")
    root, here = Path(workdir).resolve(), cwd.resolve()
    if not here.is_relative_to(root):
        raise DryRunError(f"{here} is outside the working directory {root}: the dry-run HAPS "
                          "only sees files under it")
    return here.relative_to(root).as_posix() or "."


def running_ids(answer: str) -> list[str]:
    """The job ids the bridge lists as still running."""
    match = _RUNNING.search(answer)
    return [i.strip() for i in match.group("ids").split(",") if i.strip()] if match else []


async def _call(url: str, tool: str, arguments: dict) -> str:
    from mcp import ClientSession
    from mcp.client.streamable_http import streamable_http_client

    async with streamable_http_client(url) as streams:
        read, write = streams[0], streams[1]
        async with ClientSession(read, write) as session:
            await session.initialize()
            result = await session.call_tool(tool, arguments)
    text = "\n".join(getattr(c, "text", "") for c in result.content).strip()
    if getattr(result, "is_error", None) or getattr(result, "isError", False):
        raise DryRunError(f"the bridge refused {tool}: {text}")
    return text


def dry_run(name: str, directory: str, nproc: int, url: str, timeout_s: float,
            call=_call) -> str:
    """Ask the bridge for the dry run of NAME; wait for it if it outlasts one call."""
    deadline = time.monotonic() + timeout_s
    answer = asyncio.run(call(url, "haps_dryrun",
                              {"names": [name], "directory": directory, "nproc": nproc}))
    parts = []
    while ids := running_ids(answer):
        parts.append(_RUNNING.sub("", answer).strip())
        if time.monotonic() >= deadline:
            parts.append(f"[TIMEOUT] the dry run of {name} did not finish within {timeout_s:g}s "
                         f"(job {', '.join(ids)})")
            return "\n".join(p for p in parts if p)
        answer = asyncio.run(call(url, "haps_result", {"job_id": ids[0]}))
    parts.append(answer)
    return "\n".join(p for p in parts if p)


def verdict(answer: str) -> int:
    if "[VALID]" in answer:
        return VALID
    if "[INVALID]" in answer:
        return INVALID
    return NOT_RUN


def main(argv: list[str] | None = None, environ: Mapping[str, str] | None = None,
         cwd: Path | None = None, call=_call) -> int:
    env: Mapping[str, str] = os.environ if environ is None else environ
    args = parse(sys.argv[1:] if argv is None else argv)
    if args.action != "memory-estimation":
        print(f"[REFUSED] bigdft-tool -a {args.action}: only `-a memory-estimation` (the dry "
              "run) exists here, and it runs on the dry-run HAPS.", file=sys.stderr)
        return REFUSED
    if args.unknown:
        print(f"[ERROR] bigdft-tool: unexpected arguments {' '.join(args.unknown)}",
              file=sys.stderr)
        return NOT_RUN
    if not args.name:
        print("[ERROR] bigdft-tool: --name=NAME is required (NAME.yaml is the input)",
              file=sys.stderr)
        return NOT_RUN
    try:
        directory = relative_directory(cwd or Path.cwd(), env.get("PYBIGDFT_WORKDIR"))
        timeout_s = float(env.get("PYBIGDFT_DRYRUN_TIMEOUT") or DEFAULT_TIMEOUT_S)
        answer = dry_run(args.name, directory, args.nproc,
                         env.get("PYBIGDFT_HAPS_MCP_URL") or DEFAULT_URL, timeout_s, call)
    except (DryRunError, ValueError) as exc:
        print(f"[ERROR] bigdft-tool: {exc}", file=sys.stderr)
        return NOT_RUN
    except Exception as exc:                      # the bridge is down, the network…
        print(f"[ERROR] bigdft-tool: the HAPS bridge at "
              f"{env.get('PYBIGDFT_HAPS_MCP_URL') or DEFAULT_URL} did not answer "
              f"({type(exc).__name__}: {exc}). Is ../haps/serve_local.sh running?",
              file=sys.stderr)
        return NOT_RUN
    print(answer)
    return verdict(answer)


if __name__ == "__main__":
    sys.exit(main())
