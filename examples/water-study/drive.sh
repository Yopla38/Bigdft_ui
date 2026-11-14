#!/bin/bash
# Stand-in for the HAPS in this test: runs its one fixed command, `bigdft -n NAME`, on each prepared input.
source /usr/local/bigdft/bin/bigdftvars.sh >/dev/null 2>&1
export OMP_NUM_THREADS=4
mkdir -p runs
for wave in 1 2 3 4; do
  python3 study.py prepare > prepare_$wave.txt 2>&1 || { echo "prepare failed (wave $wave)"; tail -15 prepare_$wave.txt; exit 1; }
  grep -E "dry run passed|ready for|waiting for" prepare_$wave.txt
  names=$(grep "ready for the HAPS" prepare_$wave.txt | sed "s/.*\[//; s/\].*//; s/[',]/ /g")
  [ -z "$(echo $names | tr -d ' ')" ] && break
  for n in $names; do
    t0=$SECONDS; (cd runs && bigdft -n $n > stdout-$n.txt 2> stderr-$n.txt); code=$?
    echo "HAPS-like run $n: exit $code in $((SECONDS - t0)) s" | tee -a runs.txt
  done
done
python3 study.py analyse > analyse.txt 2>&1; echo "analyse exit $?"; cat analyse.txt
echo DONE
