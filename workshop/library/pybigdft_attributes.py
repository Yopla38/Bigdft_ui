"""In the image: what PyBigDFT's Logfile gives for each attribute of its registry, for every log of a directory."""
import glob, json, os, sys
from BigDFT import Logfiles
out = {}
for path in sorted(glob.glob(os.path.join(sys.argv[1], "log-*.yaml"))):
    log = Logfiles.Logfile(path)
    last = log if len(log) == 0 else log[len(log) - 1]
    got = {}
    for name in Logfiles.BUILTIN:
        value = getattr(last, name, None)
        if value is None and Logfiles.BUILTIN[name].get("global"):
            value = getattr(log, name, None)
        if value is None and name in ("memory_run", "memory_quantities"):
            value = last.memory.get(Logfiles.BUILTIN[name]["path"][0][0])
        if value is None:
            continue
        if name == "evals":
            value = [[float(e) for e in spin if e == e] for spin in value[0].tolist()]
        got[name] = value
    out[os.path.basename(path)[4:-5]] = got
json.dump(out, open(sys.argv[2], "w"), default=str)
print(len(out), "logs")
