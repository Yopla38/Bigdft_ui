#!/usr/bin/env bash
# Take again what this repository copies from Asymille (fit, analysis, figures).
#
#   ./update_from_asymille.sh /path/to/Asymille          # show what differs, change nothing
#   ./update_from_asymille.sh /path/to/Asymille --apply  # copy
#
# Asymille is developed in its own repository and tested there (its engine
# against NIST certified values, its page in Node). Here it is a copy, unchanged,
# plugged into the accounts of this server by app/asymille.py:
#
#   backend/asymille/       the engine and its API          <- Asymille/asymille/
#   asymille/index.html     the page                        <- Asymille/page/index.html
#   asymille/js/            its scripts                     <- Asymille/page/js/
#   asymille/examples/      the spectrum its example loads  <- Asymille/examples/NW1051-NW1.txt
#
# Asymille's page/shared/ is NOT copied: here the page loads this repository's
# own shared/api.js and shared/account.js (prototype/js), which sign people in.
#
# After a copy: `uv sync` if Asymille's pyproject.toml names a new library, and
# `uv run alembic revision --autogenerate` if asymille/web/tables.py changed
# (then read the migration). `uv run pytest tests/test_asymille.py` says whether
# the copy and this server still agree.
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
ROOT="$(dirname "$HERE")"
SOURCE="${1:-}"
[[ -n "$SOURCE" && -d "$SOURCE/asymille/web" && -f "$SOURCE/page/index.html" ]] || { echo "usage: $0 /path/to/Asymille [--apply]" >&2; exit 2; }
APPLY="${2:-}"

# directory in Asymille : directory here : what is taken from it
TREES=(
    "asymille:$HERE/asymille:*.py"
    "asymille/web:$HERE/asymille/web:*.py"
    "page/js:$ROOT/asymille/js:*.js"
)
FILES=(
    "page/index.html:$ROOT/asymille/index.html"
    "examples/NW1051-NW1.txt:$ROOT/asymille/examples/NW1051-NW1.txt"
)
changed=0
one() {  # one FROM TO NAME
    if [[ -e "$2" ]] && cmp -s "$1" "$2"; then return; fi
    changed=1
    if [[ "$APPLY" == --apply ]]; then mkdir -p "$(dirname "$2")"; cp -p "$1" "$2"; echo "copied    $3"; elif [[ -e "$2" ]]; then echo "differs   $3"; else echo "new       $3"; fi
}
for tree in "${TREES[@]}"; do
    IFS=: read -r from to pattern <<< "$tree"
    for file in "$SOURCE/$from"/$pattern; do
        [[ -e "$file" ]] && one "$file" "$to/$(basename "$file")" "${to#"$ROOT"/}/$(basename "$file")"
    done
    if [[ -d "$to" ]]; then
        for file in "$to"/$pattern; do
            [[ -e "$file" && ! -e "$SOURCE/$from/$(basename "$file")" ]] || continue
            changed=1
            if [[ "$APPLY" == --apply ]]; then rm "$file"; echo "removed   ${file#"$ROOT"/}   (Asymille no longer has it)"; else echo "gone      ${file#"$ROOT"/}   (Asymille no longer has it)"; fi
        done
    fi
done
for pair in "${FILES[@]}"; do
    from="$SOURCE/${pair%%:*}"; to="${pair#*:}"
    [[ -e "$from" ]] || { echo "gone      ${pair%%:*}   (Asymille no longer has it: look at where it went)"; changed=1; continue; }
    one "$from" "$to" "${to#"$ROOT"/}"
done
if [[ "$changed" == 0 ]]; then echo "the copies are Asymille's"; elif [[ "$APPLY" != --apply ]]; then echo "run again with --apply to copy"; fi
