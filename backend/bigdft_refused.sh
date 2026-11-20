#!/bin/sh
# Stands in for BigDFT's computing executables (bigdft, abscalc, frequencies)
# in tools/bigdft_bin/: here the agent prepares and dry-runs, the HAPS computes.
cat >&2 <<MSG
[REFUSED] ${1:-$(basename "$0")} does not compute on this machine.
Prepare and check the input here with a dry run (PyBigDFT:
SystemCalculator(dry_run=True), which sends it to the dry-run HAPS), then
send the prepared NAME.yaml to the HAPS with haps_bigdft.
MSG
exit 3
