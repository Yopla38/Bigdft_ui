"""Tool to download 3D structures from PubChem and save them as BigDFT .xyz files.
Requires: ase, requests

The file is written in BigDFT's own XYZ format, not the standard one:

    2 angstroem          <- number of atoms AND the unit
    free                 <- boundary conditions (an isolated molecule)
    H  0.0  0.0  0.0
    H  0.0  0.0  0.74

A standard XYZ (what ASE writes: "2", then an empty comment line) has no unit:
BigDFT then reads the coordinates in BOHR, silently. Measured on H2 at 0.74 Å:
the run "succeeds" at 0.74 bohr (0.39 Å), E = -0.954 Ha instead of -1.17, with
a force of 1.02 Ha/bohr — a wrong result nothing flags.
"""

import json
import re
from io import StringIO
from pathlib import Path
from typing import Optional, Union

import requests
from ase.io import read

SUPPORTS_EXPLICIT_ROOT = True
_RootArg = Optional[Union[str, Path]]


def run_name(identifier: str) -> str:
    """A name usable as a BigDFT run name (log-<name>.yaml): lowercase, no space."""
    name = re.sub(r"[^a-z0-9_-]+", "_", identifier.strip().lower()).strip("_")
    return name or "molecule"


def bigdft_xyz(symbols: list[str], positions_angstrom) -> str:
    """The text of a BigDFT .xyz for an isolated molecule, coordinates in Å."""
    lines = [f"{len(symbols)} angstroem", "free"]
    lines += [f"{s:<3} {x: .10f} {y: .10f} {z: .10f}" for s, (x, y, z) in zip(symbols, positions_angstrom)]
    return "\n".join(lines) + "\n"


def download_xyz_for_bigdft(identifier: str, folder: str, *, _root: _RootArg = None) -> str:
    """Download a molecule's 3D structure from PubChem and save it as a BigDFT .xyz file.

    Use this to obtain the initial geometry of a molecule for BigDFT. The file
    is in BigDFT's format (line 1 "N angstroem", line 2 "free"), named after the
    molecule: for "Hydrogen chloride" it is hydrogen_chloride.xyz.

    Args:
        identifier: The PubChem name or CID of the compound.
        folder: The directory where the .xyz file should be saved, relative to the root.
    """
    root = Path(_root).resolve() if _root else Path.cwd().resolve()

    target_folder = (root / str(folder)).resolve()
    if not target_folder.is_relative_to(root):
        return json.dumps({"error": f"Folder {folder} is outside the working directory"})
    try:
        target_folder.mkdir(parents=True, exist_ok=True)
    except Exception as e:
        return json.dumps({"error": f"Could not create folder {folder}: {str(e)}"})

    url = f"https://pubchem.ncbi.nlm.nih.gov/rest/pug/compound/name/{identifier}/record/SDF?record_type=3d"
    try:
        response = requests.get(url, timeout=30)
        if response.status_code == 404:
            return json.dumps({"error": f"Compound '{identifier}' not found in PubChem 3D records"})
        response.raise_for_status()
        atoms = read(StringIO(response.text), format="sdf")
    except requests.exceptions.RequestException as e:
        return json.dumps({"error": f"Network error while fetching from PubChem: {str(e)}"})
    except Exception as e:
        return json.dumps({"error": f"Could not read PubChem's structure: {str(e)}"})

    name = run_name(identifier)
    file_path = (target_folder / f"{name}.xyz").resolve()
    try:
        file_path.write_text(bigdft_xyz(atoms.get_chemical_symbols(), atoms.get_positions()))
    except OSError as e:
        return json.dumps({"error": f"Could not write {file_path.name}: {str(e)}"})

    return json.dumps({
        "file": str(file_path),
        "run_name": name,
        "atoms": len(atoms),
        "formula": atoms.get_chemical_formula(),
        "format": "BigDFT xyz: line 1 'N angstroem', line 2 'free'",
        "next": "the coordinates are in Å; give this file as the posinp of the calculation",
    })
