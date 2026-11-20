#!/usr/bin/env bash
# Move the whole repository to another version of BigDFT and PyBigDFT. One command.
#
#   tools/update_version.sh --image docker://bigdft/runtime@sha256:<digest> --source /path/to/bigdft-suite
#
#   --image IMAGE     the image the pack will run (where PyBigDFT and bigdft are installed)
#   --source DIR      a bigdft-suite checkout of the SAME version: the input variables are declared
#                     in its source, not in the image. Without it the variables are left as they are.
#   --revision LABEL  what to call that source in the generated files, e.g. "tag 1.9.5"
#                     (default: the git description of the checkout)
#   --runtime docker|apptainer    default: apptainer if installed, else docker
#   --docs DIR        tutorial pages to check against the new version (optional)
#
# Everything that describes the code is read again from the code:
#   the input variables      schema/, prototype/js/schema.js, ontology/instances/, ontology/corpus/
#   PyBigDFT as installed    for_pybigdft_pack/build/<version>/, data/pybigdft-api.ttl
#   the action controls      prototype/js/actions.js
# and everything written by hand is CHECKED against it. The command ends with the list of what
# a person has to look at; when that list is empty the application follows the new version as it is.
set -uo pipefail
cd "$(dirname "$0")/.."

image="" source="" runtime="" docs="" revision=""
while [ $# -gt 0 ]; do
  case "$1" in
    --image) image="$2"; shift 2 ;;
    --source) source="$2"; shift 2 ;;
    --runtime) runtime="$2"; shift 2 ;;
    --revision) revision="$2"; shift 2 ;;
    --docs) docs="$2"; shift 2 ;;
    -h|--help) sed -n '2,19p' "$0" | sed 's/^# \{0,1\}//'; exit 0 ;;
    *) echo "unknown option: $1" >&2; exit 2 ;;
  esac
done
[ -n "$image" ] || { echo "give the image with --image (see --help)" >&2; exit 2; }

todo=()
note() { todo+=("$1"); }

if [ -n "$source" ]; then
  echo "── input variables, from the source tree"
  cp schema/bigdft-input.schema.json /tmp/schema.before.$$.json
  python3 tools/extract_schema.py "$source" -o schema/bigdft-input.schema.json ${revision:+--revision "$revision"} || { echo "extraction failed" >&2; exit 1; }
  python3 tools/diff_schema.py /tmp/schema.before.$$.json schema/bigdft-input.schema.json \
    || note "a variable shown as a control (schema/ui-tiers.yaml) no longer exists: see the comparison above"
  rm -f /tmp/schema.before.$$.json
  python3 tools/build_prototype_schema.py || note "schema/ui-tiers.yaml names a variable this version does not have"
  python3 tools/build_parameter_instances.py || note "the parameter graph could not be rebuilt"
else
  note "no --source given: the input variables (schema/) still describe the previous version"
fi

echo "── PyBigDFT as installed, and the snippets, in the image"
( cd for_pybigdft_pack && ./repopulate.sh --image "$image" ${runtime:+--runtime "$runtime"} \
    --definitions ../schema/bigdft-input.schema.json ${docs:+--docs "$docs"} ) || { echo "the extraction in the image failed" >&2; exit 1; }
latest="$(ls -d for_pybigdft_pack/build/pybigdft-* | sort -V | tail -1)"
failed="$(python3 -c "import json,sys; print(', '.join(s['file'] for s in json.load(open('$latest/snippets.json')) if s['status'] != 'passed'))")"
[ -z "$failed" ] || note "snippets that no longer pass (a behaviour changed; see for_pybigdft_pack/data/CHANGES.md): $failed"

echo "── the controls drawn from the registry, and the hand-written part checked against it"
python3 tools/build_actions.py "$latest"; status=$?
if [ "$status" -eq 3 ]; then
  note "the workshop writes a call or a key this version does not have: see the message above, fix prototype/js/blueprint.js or builder.js, then run  python tools/build_actions.py"
elif [ "$status" -ne 0 ]; then
  echo "tools/build_actions.py failed" >&2; exit 1
fi

echo "── workshop 2: the result views drawn from the registry of log attributes, the steps, and the page against its real run"
python3 tools/build_logviews.py "$latest" || { echo "tools/build_logviews.py failed" >&2; exit 1; }
python3 tools/build_steps.py || { echo "tools/build_steps.py failed" >&2; exit 1; }
if command -v node >/dev/null 2>&1; then
  node tools/check_workshop.js > /tmp/check_workshop.$$ 2>&1 || note "workshop 2 no longer writes the script that was run, or no longer finds its results: run  node tools/check_workshop.js  (the recorded results are those of the previous version until workshop/library is run again)"
  tail -1 /tmp/check_workshop.$$
fi
note "the results workshop 2 shows were computed with the previous image: run workshop/library/lattice.py and lattice2.py in the new one, then tools/build_library.py, to renew them"

echo
if [ ${#todo[@]} -eq 0 ]; then
  echo "Done. Nothing to do by hand: the application follows $(basename "$latest")."
else
  echo "Done, with ${#todo[@]} thing(s) for a person to look at:"
  for t in "${todo[@]}"; do echo "  - $t"; done
fi
[ ! -f for_pybigdft_pack/data/CHANGES.md ] || echo "What changed in PyBigDFT: for_pybigdft_pack/data/CHANGES.md"
