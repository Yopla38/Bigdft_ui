"""Build the density of states of a run, as a table and as a figure.

log.get_dos() returns a DoS built from the orbital energies, in eV. dump()
gives two columns of text (energy, density); plot() draws on a matplotlib
axis. Use the Agg backend where there is no display.

task: Read a result
stage: analysis
"""
import matplotlib

matplotlib.use("Agg")
import matplotlib.pyplot as plt
from BigDFT.Logfiles import Logfile

dos = Logfile("log-h2o.yaml").get_dos(label="water")

table = dos.dump(sigma=0.2)                              # gaussian broadening, in eV
rows = [line.split() for line in table.strip().splitlines()]
assert len(rows) > 100 and len(rows[0]) == 2
with open("dos.dat", "w") as f:
    f.write(table)

fig, ax = plt.subplots()
dos.plot(sigma=0.2, ax=ax)
fig.savefig("dos.png", dpi=150)

print("points:", len(rows), "| from %.1f to %.1f eV" % (float(rows[0][0]), float(rows[-1][0])))
print("written: dos.dat, dos.png")
