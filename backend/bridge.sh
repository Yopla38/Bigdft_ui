#!/usr/bin/env bash
# The workshop's own MCP bridge to the HAPS, beside the agent's.
#
#   ./bridge.sh /path/to/haps                                  # the local stack (serve_local.sh)
#   ./bridge.sh /path/to/haps ~/.config/haps/aqmo-test.env     # a remote ebservice (serve_remote.sh)
#
# /path/to/haps is the HAPS directory of the pack (the one holding haps.toml and
# pybigdft_haps/): the bridge is ITS code, run a second time with two settings
# changed. Nothing of it is copied here, so the rule on what a run may receive
# stays the one the runtime applies.
#
#   port      the one of `mcp_url` in ../config/haps.yaml (8791; the agent's is 8790)
#   workdir   ./work, where serve.py writes the studies (ONDELETTE_WORKDIR to change both)
#
# It publishes nothing and runs no BigDFT: it submits to the two HAPS that are
# already served (serve_local.sh or serve_remote.sh, started by whoever operates
# them), with the USER account of the settings. The credentials file, when one
# is given, is the same as theirs and stays where it is.
#
# The bridge answers after 10 s with the id of a job still running, instead of
# 240 s: serve.py then follows the job, and can stop it.
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"

HAPS_DIR="${1:-${ONDELETTE_HAPS_DIR:-}}"
ENV_FILE="${2:-}"
[[ -n "$HAPS_DIR" && -f "$HAPS_DIR/haps.toml" ]] || {
    echo "usage: $0 /path/to/haps [credentials.env]   (the directory holding haps.toml)" >&2; exit 2; }
if [[ -n "$ENV_FILE" ]]; then
    [[ -f "$ENV_FILE" ]] || { echo "[ERROR] no credentials file $ENV_FILE" >&2; exit 2; }
    set -a; source "$ENV_FILE"; set +a
fi

PORT="$(sed -n 's|^ *mcp_url: *http://127\.0\.0\.1:\([0-9]*\)/mcp.*|\1|p' "$HERE/../config/haps.yaml" | head -1)"
[[ -n "$PORT" ]] || { echo "[ERROR] no local mcp_url in config/haps.yaml" >&2; exit 2; }
export HAPS_MCP_HOST=127.0.0.1
export HAPS_MCP_PORT="$PORT"
export HAPS_MCP_WORKDIR="${ONDELETTE_WORKDIR:-$HERE/work}"
export HAPS_MCP_WAIT_S="${HAPS_MCP_WAIT_S:-10}"
mkdir -p "$HAPS_MCP_WORKDIR"

echo "bridge   http://127.0.0.1:$PORT/mcp"
echo "workdir  $HAPS_MCP_WORKDIR"
echo "HAPS     ${HAPS_SERVERS_EBSERVICE_URL:-as $HAPS_DIR/haps.toml says}"
cd "$HAPS_DIR"
exec uv run python -m pybigdft_haps.mcp_server
