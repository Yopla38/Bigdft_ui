#!/usr/bin/env python3
"""The server of the application: accounts, the studies of each user, and computing on the HAPS.

    cd backend
    uv sync                                  # once: the environment
    cp .env.example .env                     # once: the settings (every one has a default for a local start)
    uv run alembic upgrade head              # create the database, or bring it up to date
    uv run python -m app.seed                # once: an administrator and a demonstration account
    uv run python serve.py                   # http://localhost:8766

    uv run python serve.py --port 8770 --bridge http://127.0.0.1:8791/mcp --workdir /tmp/studies

A web page cannot start BigDFT, and must not hold the credentials of a HAPS:

    page ──► serve.py ──► runner.py ──► MCP bridge ──► dry-run HAPS / HAPS
              app/         one wave     (bridge.sh)     memguess / bigdft -n NAME
              accounts, studies in a database

`app/` is the application (FastAPI); this file reads the settings, says what it
found and starts it. The addresses it answers are listed in `app/routers/` and,
outside production, shown at /api/docs.

The page sends a study as data: the calls of the registry of steps. The script
it also sends is kept beside the runs for whoever reads the directory; it is
never executed. A request that changes something is answered only when it comes
from the page of this server, signed in, with the token of its session.

One process: it follows the waves it started. Put a reverse proxy in front of it
for HTTPS (see the README), not several workers.
"""
from __future__ import annotations

import argparse
import logging
import os
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path[:0] = [str(HERE)]


def main() -> int:
    parser = argparse.ArgumentParser(description="The workshop, with accounts, computing on the HAPS. Settings: backend/.env (see .env.example).")
    parser.add_argument("--host", help="the address listened on (default: 127.0.0.1; a reverse proxy stands in front of it)")
    parser.add_argument("--port", type=int, help="default: 8766")
    parser.add_argument("--bridge", help="the MCP bridge (default: mcp_url of the default HAPS in config/haps.yaml)")
    parser.add_argument("--workdir", help="where the studies are written: it must be the bridge's working directory")
    parser.add_argument("--timeout", type=int, help="seconds a run may take on the HAPS")
    args = parser.parse_args()
    for name in ("host", "port", "bridge", "workdir", "timeout"):          # what the command line says wins over the environment
        if getattr(args, name) is not None:
            os.environ["ONDELETTE_" + name.upper()] = str(getattr(args, name))

    import uvicorn
    from pydantic import ValidationError

    from app.compute import Compute
    from app.config import get_settings
    from app.main import check_schema, create_app

    try:
        settings = get_settings()
    except ValidationError as exc:
        print("the settings are not valid (backend/.env, or the ONDELETTE_* variables):", file=sys.stderr)
        for problem in exc.errors():
            print("  " + ".".join(str(p) for p in problem["loc"]) + ": " + problem["msg"], file=sys.stderr)
        return 2
    try:
        check_schema(settings)
    except Exception as exc:
        print(f"database  {exc}", file=sys.stderr)
        return 2

    known = Compute(settings).info()
    print(settings.public_url or f"http://localhost:{settings.port}" + ("" if settings.host in ("127.0.0.1", "localhost") else f"  (listening on {settings.host})"))
    print(f"mode      {settings.env}, registration {settings.registration}, cookies " + ("for HTTPS only" if settings.secure else "sent over HTTP too (not for production)"))
    print(f"database  {settings.database_url.split('@')[-1] if '@' in settings.database_url else settings.database_url}")
    print(f"bridge    {settings.bridge}: " + ("ready" + ("" if known["wavefunctions"] else ", wavefunctions do not travel")
                                              if known["ok"] else "NOT READY (the page shows recorded results until it is)"))
    if not known["ok"]:
        print("  " + known["text"].replace("\n", "\n  "))
    elif Path(known["workdir"] or settings.workdir).resolve() != settings.workdir:
        print(f"  WARNING: the bridge works in {known['workdir']}, not in the directory below: nothing can be computed")
    print(f"studies   {settings.workdir}")

    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)-7s %(name)s  %(message)s", datefmt="%H:%M:%S")
    uvicorn.run(create_app(settings), host=settings.host, port=settings.port, proxy_headers=True,
                forwarded_allow_ips=settings.forwarded_allow_ips, server_header=False, log_level="info" if settings.env != "test" else "warning",
                access_log=settings.env != "production")
    return 0


if __name__ == "__main__":
    try:
        sys.exit(main())
    except KeyboardInterrupt:
        sys.exit(130)
