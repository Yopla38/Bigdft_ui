"""Group runs in a Dataset and collect one quantity from all of them.

A Dataset holds runs identified by a dictionary (`id`). `run()` executes them
with the calculator given to append_run, `fetch_results(attribute=...)` returns
the attribute of every log, in order. The run names are built from the ids
("h:0.5"): they contain ':' and '.', which the HAPS does not accept. Use a
Dataset for dry runs and local runs; name the runs yourself for the HAPS.

task: Converge a parameter
stage: dry-run
"""
from BigDFT.Calculators import SystemCalculator
from BigDFT.Datasets import Dataset
from BigDFT.Inputfiles import Inputfile

code = SystemCalculator(omp="1", dry_run=True, verbose=False)
study = Dataset(label="grid", run_dir="grid")
for hgrid in (0.50, 0.45, 0.40):
    inp = Inputfile()
    inp.set_xc("PBE")
    inp.set_hgrid(hgrid)
    study.append_run(id={"h": hgrid}, runner=code, input=inp, posinp="h2o.xyz")

study.run()
memory = study.fetch_results(attribute="memory_peak")

assert study.names == ["h:0.5", "h:0.45", "h:0.4"] and len(memory) == 3
print("names :", study.names)
print("memory:", memory, "MB")
