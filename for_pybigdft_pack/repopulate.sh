#!/usr/bin/env bash
# Rebuild the PyBigDFT API graph from an image. One command per new version.
#
#   ./repopulate.sh --image docker://bigdft/runtime@sha256:...        (apptainer)
#   ./repopulate.sh --image /path/to/bigdft.sif                        (apptainer)
#   ./repopulate.sh --runtime docker --image bigdft/runtime@sha256:... (docker)
#
# Options
#   --runtime apptainer|docker   default: apptainer if installed, else docker
#   --setup "COMMAND"            run in the image before anything, to put PyBigDFT and bigdft on the path
#                                default: source /usr/local/bigdft/bin/bigdftvars.sh
#   --threads N                  OpenMP threads for the few real calculations (default 4)
#   --definitions FILE           schema of the input variables of that version, from
#                                ../tools/extract_schema.py on a BigDFT source tree. Without it the
#                                graph holds the variables a default log prints (about 240 of 311)
#   --docs DIR                   tutorial pages to check against the installed version
#
# What it does, in the image: runs a few small real calculations (the fixtures), reads the
# installed PyBigDFT, calls every input action, and executes every snippet of snippets/.
# Then, here: writes data/pybigdft-api.ttl, data/REPORT.md, and data/CHANGES.md against the
# previous build. It needs an image in which `bigdft` runs: not the pack's container, where
# it is disabled on purpose.
set -euo pipefail
cd "$(dirname "$0")"

runtime="" image="" setup="source /usr/local/bigdft/bin/bigdftvars.sh" threads=4 definitions="" docs=""
while [ $# -gt 0 ]; do
  case "$1" in
    --runtime) runtime="$2"; shift 2 ;;
    --image) image="$2"; shift 2 ;;
    --setup) setup="$2"; shift 2 ;;
    --threads) threads="$2"; shift 2 ;;
    --definitions) definitions="$2"; shift 2 ;;
    --docs) docs="$2"; shift 2 ;;
    -h|--help) sed -n '2,24p' "$0" | sed 's/^# \{0,1\}//'; exit 0 ;;
    *) echo "unknown option: $1" >&2; exit 2 ;;
  esac
done
[ -n "$image" ] || { echo "give the image with --image (see --help)" >&2; exit 2; }
if [ -z "$runtime" ]; then
  if command -v apptainer >/dev/null 2>&1; then runtime=apptainer
  elif command -v docker >/dev/null 2>&1; then runtime=docker
  else echo "neither apptainer nor docker is installed" >&2; exit 1; fi
fi

rm -rf build/work && mkdir -p build/work
inside="$setup >/dev/null 2>&1; export OMP_NUM_THREADS=$threads; cd /pack && python3 extract/extract.py all build/work snippets"
echo "── in the image ($runtime): fixtures, API, input actions, input variables, snippets"
status=0
case "$runtime" in
  apptainer) apptainer exec --bind "$PWD:/pack" --pwd /pack "$image" bash -c "$inside" || status=$? ;;
  docker)    chmod -R a+rwX . && docker run --rm -v "$PWD:/pack" -w /pack "${image#docker://}" bash -c "$inside" || status=$? ;;
  *) echo "unknown runtime: $runtime" >&2; exit 2 ;;
esac
[ -f build/work/versions.json ] || { echo "the extraction did not finish: nothing was written" >&2; exit 1; }
[ "$status" -eq 0 ] || echo "!! some snippets failed with this version: they are left out of the graph and listed in data/REPORT.md"

name="$(python3 -c "import json; v=json.load(open('build/work/versions.json')); print('pybigdft-%s_bigdft-%s' % (v['pybigdft'], v['bigdft']))")"
previous="$(ls -d build/pybigdft-* 2>/dev/null | grep -v "/$name\$" | sort -V | tail -1 || true)"
rm -rf "build/$name" && mkdir -p "build/$name"
cp build/work/{api,actions,parameters,snippets,versions}.json "build/$name/"
rm -rf build/work

echo "── here: the graph"
python3 tools/build_ttl.py "build/$name" ${definitions:+--definitions "$definitions"}
if [ -n "$previous" ]; then python3 tools/compare_builds.py "$previous" "build/$name"; fi
if [ -n "$docs" ]; then python3 tools/audit_tutorials.py "build/$name" "$docs"; fi
echo
echo "Done: data/pybigdft-api.ttl is the graph of $name."
echo "Next: copy it to the pack's data/, then  python fetchers/pybigdft_api.py --prune  in the pack."
