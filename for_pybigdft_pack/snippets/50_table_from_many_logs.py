"""Collect the same quantities from many logs into a table.

Loop over the log files, keep the finished runs, and print or save rows.
pandas is not installed in the BigDFT 1.9.1 image: use plain lists and csv.

task: Read a result
stage: analysis
"""
import csv
import glob

from BigDFT.Logfiles import Logfile

try:
    import pandas  # noqa: F401
    raise AssertionError("pandas is installed here: this snippet can use it")
except ImportError:
    pass

rows = []
for path in sorted(glob.glob("log-*.yaml")):
    log = Logfile(path)
    last = log if len(log) == 0 else log[len(log) - 1]
    energy = getattr(last, "energy", None)
    if energy is None:
        continue                                           # a dry run or a refused input
    name = path[len("log-"):-len(".yaml")]
    rows.append([name, last.nat, last.grid_spacing, "%.8f" % energy, max(len(log), 1)])

with open("results.csv", "w") as f:
    writer = csv.writer(f)
    writer.writerow(["run", "atoms", "hgrid", "energy_Ha", "force_evaluations"])
    writer.writerows(rows)

for row in rows:
    print("%-14s %2d atoms  h=%.2f  E=%s Ha  %2d evaluation(s)" % tuple(row))
assert "refused" not in [r[0] for r in rows] and len(rows) >= 4
