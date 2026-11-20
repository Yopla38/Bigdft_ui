#!/usr/bin/env bash
# The workshop's MCP bridge to the HAPS.
#
#   ./bridge.sh                                 # haps.toml as is: a local demo HAPS
#   ./bridge.sh ~/.config/haps/aqmo-test.env    # a remote HAPS, your credentials
#
# The bridge (haps_bridge/) is here, in this directory, and runs with this
# directory's environment (uv sync). It talks to the HAPS over HTTP(S) only:
# no path to the HAPS or to the PyBigDFT pack is needed, wherever they are and
# however they are named.
#
#   settings  ./haps.toml, each value overridable by HAPS_<SECTION>_<KEY>
#   port      the one of `mcp_url` in ../config/haps.yaml (8791; the pack's own bridge is on 8790)
#             (ONDELETTE_BRIDGE_PORT for a second stack to test on, with serve.py --bridge)
#   workdir   ./work, where serve.py writes the studies (ONDELETTE_WORKDIR to change both)
#
# The credentials file sets HAPS_* variables and stays where it is, outside the
# repository. It is the file the pack's own bridge takes: the bridge submits
# with the USER account (HAPS_USER_USERNAME, HAPS_USER_PASSWORD).
#
# It publishes nothing and runs no BigDFT: it submits to the two HAPS that are
# already served, by whoever operates them.
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
usage() { echo "usage: $0 [credentials.env]" >&2; exit 2; }

# Until 2026-11-20 the first argument was the directory of the HAPS or of the pack. It is not needed any more.
if [[ $# -ge 2 || ( $# -eq 1 && -d "$1" ) ]]; then
    echo "[NOTE] '$1' is not needed any more: the bridge is in $HERE/haps_bridge. Next time: $0 ${2:-}" >&2
    shift
fi
[[ $# -le 1 ]] || usage
ENV_FILE="${1:-}"

PY="$HERE/.venv/bin/python"
[[ -x "$PY" ]] || { echo "[ERROR] no .venv in $HERE: run 'uv sync' there" >&2; exit 2; }
"$PY" -c 'import haps_client' 2>/dev/null || { echo "[ERROR] the environment of $HERE is not up to date: run 'uv sync' there" >&2; exit 2; }

if [[ -n "$ENV_FILE" ]]; then
    [[ -f "$ENV_FILE" ]] || { echo "[ERROR] no credentials file $ENV_FILE (the only argument is that file: the directory of the HAPS is not needed)" >&2; exit 2; }
    [[ "$(stat -c %a "$ENV_FILE")" == 600 ]] || echo "[WARNING] $ENV_FILE is readable by others: chmod 600 $ENV_FILE" >&2
    set -a; source "$ENV_FILE"; set +a
    # The bridge submits with the USER account; a file written for the service (serve_remote.sh) may hold the maintainer's only.
    [[ -n "${HAPS_USER_USERNAME:-}" && -n "${HAPS_USER_PASSWORD:-}" ]] || echo "[WARNING] $ENV_FILE sets no HAPS_USER_USERNAME / HAPS_USER_PASSWORD:" \
        "the bridge will submit with the account of $HERE/haps.toml, the local demo's" >&2
fi

PORT="${ONDELETTE_BRIDGE_PORT:-$(sed -n 's|^ *mcp_url: *http://127\.0\.0\.1:\([0-9]*\)/mcp.*|\1|p' "$HERE/../config/haps.yaml" | head -1)}"
[[ -n "$PORT" ]] || { echo "[ERROR] no local mcp_url in config/haps.yaml" >&2; exit 2; }
export HAPS_CONFIG="$HERE/haps.toml"
export HAPS_MCP_HOST=127.0.0.1
export HAPS_MCP_PORT="$PORT"
export HAPS_MCP_WORKDIR="${ONDELETTE_WORKDIR:-$HERE/work}"
mkdir -p "$HAPS_MCP_WORKDIR"

echo "bridge   http://127.0.0.1:$PORT/mcp"
echo "workdir  $HAPS_MCP_WORKDIR"
echo "HAPS     ${HAPS_SERVERS_EBSERVICE_URL:-as haps.toml says (a local demo HAPS)}"
cd "$HERE"
exec "$PY" -m haps_bridge
