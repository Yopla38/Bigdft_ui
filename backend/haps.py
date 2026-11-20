"""The client of the HAPS MCP bridge: what the backend asks it, and how it reads the answers.

The bridge (`pybigdft_haps.mcp_server`, in the HAPS repository) is the only
process that holds the HAPS credentials. It shares a working directory with the
backend: a run is named by a directory relative to it, never by file content.
The bridge answers in text written for an agent; this module turns that text
into an outcome.

    [OK] bigdft -n NAME  (job ID), 12.3s on the HAPS
    [FAILED (exit 1)] bigdft -n NAME …       BigDFT refused the input or stopped
    [TIMEOUT] bigdft -n NAME …               stopped by the HAPS after the timeout
    [HAPS FAILED] NAME  (job ID): …          the HAPS did not run it
    [RUNNING] still running after 10s: ID — call haps_result with each id.
    [ERROR] … / [HAPS ERROR] …               the bridge or the service refused
"""
from __future__ import annotations

import asyncio
import re
import time

RUNNING = re.compile(r"^\[RUNNING\] still running after [^:]+: (?P<ids>[^—]+?) —", re.M)
ELAPSED = re.compile(r"\), ([0-9.]+)s on the HAPS")
JOB = re.compile(r"\(job ([0-9a-f-]{8,})\)")


class BridgeError(RuntimeError):
    pass


async def call(url: str, tool: str, arguments: dict) -> str:
    """One tool of the bridge, over streamable HTTP; its answer as text."""
    from mcp import ClientSession
    from mcp.client.streamable_http import streamable_http_client

    async with streamable_http_client(url) as streams:
        read, write = streams[0], streams[1]
        async with ClientSession(read, write) as session:
            await session.initialize()
            result = await session.call_tool(tool, arguments)
    text = "\n".join(getattr(c, "text", "") for c in result.content).strip()
    if getattr(result, "is_error", None) or getattr(result, "isError", False):
        raise BridgeError(f"the bridge refused {tool}: {text}")
    return text


def unreachable(url: str, exc: BaseException) -> str:
    inner = exc
    while isinstance(inner, BaseExceptionGroup) and inner.exceptions:
        inner = inner.exceptions[0]
    return (f"the HAPS bridge at {url} did not answer ({type(inner).__name__}: {inner}). "
            "Start it with backend/bridge.sh")


def running_ids(answer: str) -> list[str]:
    match = RUNNING.search(answer)
    return [i.strip() for i in match.group("ids").split(",") if i.strip()] if match else []


def outcome(answer: str) -> dict:
    """What a finished haps_bigdft answer says of its run: done, or failed and why."""
    head = answer.lstrip().split("\n", 1)[0]
    job = JOB.search(head)
    out = {"job": job.group(1) if job else None}
    if head.startswith("[OK]"):
        elapsed = ELAPSED.search(head)
        return dict(out, state="done", seconds=float(elapsed.group(1)) if elapsed else None)
    tail = answer.split("--- end of stderr ---", 1)[1].strip() if "--- end of stderr ---" in answer else ""
    if head.startswith("[TIMEOUT]"):
        return dict(out, state="failed", text="stopped by the HAPS: it ran longer than the time it was given")
    if head.startswith("[FAILED"):
        code = re.match(r"\[FAILED \(exit ([^)]*)\)\]", head)
        return dict(out, state="failed", text=f"BigDFT stopped (exit {code.group(1) if code else '?'})"
                    + (": " + tail[-600:] if tail else ""))
    if head.startswith("[HAPS ERROR]") or head.startswith("[ERROR]"):
        return dict(out, state="failed", text=head.split("]", 1)[1].strip())
    if head.startswith("[HAPS "):
        return dict(out, state="failed", text="the HAPS did not run it: " + head.split("):", 1)[-1].strip(" —"))
    return dict(out, state="failed", text="the bridge answered something unexpected: " + head[:200])


async def compute(url: str, name: str, directory: str, timeout: int, *, patience: float, on_job=None) -> dict:
    """Run `bigdft -n NAME` on the HAPS and wait for it.

    *patience* bounds the whole wait, queue included: a job nobody serves stays
    pending for ever. Cancelling this coroutine asks the HAPS to stop the job.
    """
    deadline = time.monotonic() + patience
    ids: list[str] = []
    try:
        answer = await call(url, "haps_bigdft", {"names": [name], "directory": directory, "timeout": int(timeout)})
        while ids := running_ids(answer):
            if on_job:
                on_job(ids[0])
            if time.monotonic() >= deadline:
                await call(url, "haps_cancel", {"job_id": ids[0]})
                return {"state": "failed", "job": ids[0],
                        "text": f"no answer after {patience:.0f}s (job {ids[0]}): is the compute runtime serving?"}
            answer = await call(url, "haps_result", {"job_id": ids[0]})
        return outcome(answer)
    except asyncio.CancelledError:
        for job in ids:
            try:
                await asyncio.shield(call(url, "haps_cancel", {"job_id": job}))
            except Exception:
                pass
        return {"state": "stopped", "job": ids[0] if ids else None,
                "text": "stopped" if ids else "stopped here; the HAPS had not named its job yet, so it may go on computing there"}
    except BridgeError as exc:
        return {"state": "failed", "job": None, "text": str(exc)}
    except Exception as exc:                                  # the bridge is down, the network…
        return {"state": "failed", "job": None, "text": unreachable(url, exc)}


async def info(url: str) -> dict:
    """Whether the bridge answers, what it serves, and whether wavefunctions travel through it."""
    try:
        text = await asyncio.wait_for(call(url, "haps_info", {}), timeout=20)
    except Exception as exc:
        return {"ok": False, "text": unreachable(url, exc), "wavefunctions": False, "workdir": None, "targets": {}}
    targets, current = {}, None
    for line in text.splitlines():
        head = re.match(r"^\[(compute|dryrun)\]$", line.strip())
        if head:
            current = head.group(1)
            targets[current] = {"published": False, "detail": ""}
        elif current and line.startswith("application"):
            targets[current] = {"published": True, "detail": line.split(None, 1)[1].strip()}
        elif current and "ERROR]" in line:
            targets[current]["detail"] = line.strip()
    said = {line.split(None, 1)[0]: line.split(None, 1)[1].strip() for line in text.splitlines()
            if re.match(r"^(accepts|workdir)\s+\S", line)}
    ok = all(targets.get(t, {}).get("published") for t in ("compute", "dryrun"))
    return {"ok": ok, "text": text, "wavefunctions": "wavefunction" in said.get("accepts", ""),
            "workdir": said.get("workdir"), "targets": targets}
