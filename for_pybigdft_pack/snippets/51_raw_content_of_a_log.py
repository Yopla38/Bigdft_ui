"""Reach what no attribute gives: the log as a dictionary.

log.log is the whole YAML document. Useful keys: the input as BigDFT read it
(log.log["dft"], ...), the grid, the wall time, the version, the last SCF
iteration. For a relaxation, each step has its own: log[i].log.

task: Read a result
stage: analysis
"""
from BigDFT.Logfiles import Logfile

log = Logfile("log-h2o.yaml")
doc = log.log

grid = doc["Wavefunctions Descriptors, full simulation domain"]
print("BigDFT version  :", doc["Version Number"])
print("functional read :", doc["dft"]["ixc"], "(libxc code of PBE)")
print("box (angstroem) :", doc["Sizes of the simulation domain"]["Angstroem"])
print("grid points     :", grid["Coarse resolution grid"]["No. of points"], "coarse,",
      grid["Fine resolution grid"]["No. of points"], "fine")
print("last iteration  :", doc["Last Iteration"]["iter"], "| residue", doc["Last Iteration"]["gnrm"])
print("wall time       : %.1f s" % doc["Walltime since initialization"])

assert doc["dft"]["hgrids"] == 0.45 and doc["Last Iteration"]["EKS"] == log.energy
