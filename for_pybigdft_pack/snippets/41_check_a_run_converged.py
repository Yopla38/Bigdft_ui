"""Check that a finished run converged, and collect what BigDFT warned about.

Three things to look at: the last wavefunction residue against the criterion
(dft.gnrm_cv), the warnings (log.log["WARNINGS"], absent or None when there are
none), and that an energy is there at all. A run can end normally, report
convergence, and still carry warnings worth reading.

task: Read a result
stage: analysis
"""
from BigDFT.Logfiles import Logfile, find_iterations


def verdict(path):
    log = Logfile(path)
    residues = find_iterations(log.log)            # one row per SCF cycle, the residue at each iteration
    last, iterations = float(residues[-1][-1]), int(sum(len(row) for row in residues))
    warnings = [w if isinstance(w, str) else " ".join("%s: %s" % kv for kv in w.items())
                for w in (log.log.get("WARNINGS") or [])]
    return {"energy": getattr(log, "energy", None), "iterations": iterations, "last_residue": last,
            "criterion": log.gnrm_cv, "converged": last <= log.gnrm_cv, "warnings": warnings}


clean = verdict("log-h2o.yaml")
assert clean["converged"] and clean["warnings"] == []
print("h2o          :", clean["iterations"], "iterations, residue %.1e <= %.1e" % (clean["last_residue"], clean["criterion"]))

warned = verdict("log-pbe0_restart.yaml")
assert warned["converged"] and len(warned["warnings"]) == 1
print("pbe0_restart :", warned["iterations"], "iterations, warnings:", warned["warnings"])
