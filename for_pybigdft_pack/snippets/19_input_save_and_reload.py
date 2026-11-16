"""Save an Inputfile to YAML and load it back.

An Inputfile is a dictionary: yaml.dump writes it, Inputfile(dictionary) reads
it. The file NAME.yaml that a calculator writes is the same thing plus `posinp`.

task: Write an input file
stage: prepare
"""
import yaml
from BigDFT.Inputfiles import Inputfile

inp = Inputfile()
inp.set_xc("PBE")
inp.set_hgrid(0.4)
with open("settings.yaml", "w") as f:
    yaml.dump(dict(inp), f, default_flow_style=False)

with open("settings.yaml") as f:
    again = Inputfile(yaml.safe_load(f))
again.spin_polarize(mpol=2)                      # the actions are there on the reloaded object

assert again["dft"]["ixc"] == "PBE" and again["dft"]["nspin"] == 2
print(open("settings.yaml").read().strip())
