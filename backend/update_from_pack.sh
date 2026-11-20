#!/usr/bin/env bash
# Take again what this directory copies from the PyBigDFT pack.
#
#   ./update_from_pack.sh /path/to/Pack_pybigdft          # show what differs, change nothing
#   ./update_from_pack.sh /path/to/Pack_pybigdft --apply  # copy
#
# Nothing here runs the pack or reads it at run time: these files are copies,
# unchanged, and this script is the only moment the pack's location matters.
# Run it when the pack changes what a run may receive or how it talks to the
# HAPS; then `uv sync` if haps_bridge/ needs a new library (the pack's
# pyproject.toml names them).
#
#   haps_bridge/            the MCP bridge to the HAPS (bridge.sh starts it)
#   bigdft_bin/, bigdft_refused.sh, haps_dryrun_client.py
#                           the stand-in bigdft-tool that sends PyBigDFT's dry run to the bridge
#   xyz_downloader.py       a molecule by its name, from PubChem
#
# haps.toml is NOT copied: it is this directory's own (its port, its working
# directory). Compare it by hand when the pack's haps.toml gains a key.
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
PACK="${1:-}"
[[ -n "$PACK" && -d "$PACK/haps_bridge" && -d "$PACK/tools" ]] || { echo "usage: $0 /path/to/Pack_pybigdft [--apply]" >&2; exit 2; }
APPLY="${2:-}"

# source in the pack -> copy here
PAIRS=(
    "haps_bridge/__init__.py:haps_bridge/__init__.py"
    "haps_bridge/__main__.py:haps_bridge/__main__.py"
    "haps_bridge/archive.py:haps_bridge/archive.py"
    "haps_bridge/inputs.py:haps_bridge/inputs.py"
    "haps_bridge/server.py:haps_bridge/server.py"
    "haps_bridge/settings.py:haps_bridge/settings.py"
    "tools/bigdft_bin/bigdft-tool:bigdft_bin/bigdft-tool"
    "tools/bigdft_bin/bigdft:bigdft_bin/bigdft"
    "tools/bigdft_bin/abscalc:bigdft_bin/abscalc"
    "tools/bigdft_bin/frequencies:bigdft_bin/frequencies"
    "tools/bigdft_refused.sh:bigdft_refused.sh"
    "tools/haps_dryrun_client.py:haps_dryrun_client.py"
    "tools/xyz_downloader.py:xyz_downloader.py"
)
changed=0
for pair in "${PAIRS[@]}"; do
    from="$PACK/${pair%%:*}"; to="$HERE/${pair##*:}"
    [[ -e "$from" ]] || { echo "gone      ${pair%%:*}   (the pack no longer has it: look at where it went)"; changed=1; continue; }
    if cmp -s "$from" "$to"; then continue; fi
    changed=1
    if [[ "$APPLY" == --apply ]]; then cp -p "$from" "$to"; echo "copied    ${pair##*:}"; else echo "differs   ${pair##*:}"; fi
done
new="$(cd "$PACK/haps_bridge" && ls *.py | while read -r f; do [[ -e "$HERE/haps_bridge/$f" ]] || echo "$f"; done)"
[[ -z "$new" ]] || { echo "new in the pack's haps_bridge/, not listed here: $new"; changed=1; }
if [[ "$changed" == 0 ]]; then echo "the copies are the pack's"; elif [[ "$APPLY" != --apply ]]; then echo "run again with --apply to copy"; fi
