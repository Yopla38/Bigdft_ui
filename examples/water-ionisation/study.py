"""Ionisation energy of water: a study written by the workshop, step by step."""
from Studies import Study

STRUCTURE = {"units": "angstroem", "positions": [
    {"O": [0.0000, 0.0000, 0.0000]},
    {"H": [0.7570, 0.5859, 0.0000]},
    {"H": [-0.7570, 0.5859, 0.0000]},
]}

study = Study(STRUCTURE, name="ionisation_energy_of_water")
experiment = study.target("experiment", 12.62, within=0.3, unit="eV", source="first ionisation energy of water, photoelectron spectroscopy")
ground_state = study.calculation("ground_state", set_hgrid=0.4, set_rmult={"coarse": 5, "fine": 8}, set_xc="PBE")
cation = study.ionised("cation", after=ground_state)
grid_convergence = study.converge("grid_convergence", of=cation, relative_to=ground_state, action="set_hgrid", values=(0.5, 0.45, 0.4, 0.35), within=0.01)
grid_kept = study.choose("grid_kept", among=grid_convergence, retained=0.4, because="The energy difference is converged at 0.45, but the geometry is not: relaxed there, the H–O–H angle comes out at 99.7° for 105.0° at 0.40 and 104.5° at 0.35.")
relaxed = study.relax("relaxed", after=ground_state)
cation_vertical = study.ionised("cation_vertical", after=relaxed)
ionisation_energy = study.difference("ionisation_energy", cation_vertical, relaxed, against=experiment)
cation_relaxed = study.relax("cation_relaxed", after=cation_vertical)
ionisation_adiabatic = study.difference("ionisation_adiabatic", cation_relaxed, relaxed)