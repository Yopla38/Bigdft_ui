"""What a BigDFT job may receive: the rule both sides of the HAPS apply.

The HAPS runs ONE fixed command, `bigdft -n <name>`, on input DATA. Nothing the
submitter sends is ever executed as code: the name is checked against a strict
pattern and passed as an argv element (never through a shell), and the input
archive may only hold the files BigDFT reads — no scripts, and no directory
but the one BigDFT itself reads wavefunctions from, `data-<name>/`. What
remains reachable is BigDFT's own readers: of its input, and of wavefunctions
it wrote in an earlier run.

The bridge uses :func:`select` to decide what to send; the runtime uses
:func:`check` to refuse what does not belong. The bridge (this pack) and the
HAPS (../bigdft_haps_service/pybigdft_haps/inputs.py, on the service's machine) each hold a
COPY of this module: change one, change the other, or the bridge will send
files the runtime refuses.
"""

from __future__ import annotations

import re
from pathlib import Path

NAME_RE = re.compile(r"^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$")

# Beside <name>.yaml (which PyBigDFT writes with the geometry inside, under
# `posinp`): a separate geometry, and pseudopotentials.
_SIDE_FILES = re.compile(r"^(posinp\.(xyz|ascii|yaml)|psppar\.[A-Za-z]{1,3}|[A-Za-z0-9_-]+\.(xyz|ascii))$")

# The wavefunctions of an earlier run, to restart from (`inputpsiid: 2`). BigDFT
# reads them from data-<name>/ and nowhere else, one file per orbital, under the
# names it writes them: wavefunction-k001-NR.bin.b000001 (binary) or
# wavefunction-k001-NR.b000001 (text); N, U or D for the spin, R or I for the
# real and imaginary parts.
_WAVEFUNCTION = re.compile(r"^wavefunction-(k\d{3}-[NUD][RI]\.(bin\.)?b\d{6}|rhoij(\.bin)?)$")

#: What a run may receive, in words: said by `check` when it refuses, and by the
#: bridge's haps_info, so that a client knows whether wavefunctions travel.
ACCEPTED = "NAME.yaml, posinp.*, <x>.xyz, psppar.*, data-NAME/wavefunction-*"


class InputError(ValueError):
    pass


def check_name(name: str) -> str:
    if not NAME_RE.match(name or ""):
        raise InputError(f"{name!r} is not a valid run name: letters, digits, '_' and '-' "
                         "only, as in `bigdft -n <name>`")
    return name


def allowed(member: str, name: str) -> bool:
    """Whether an archive member may be an input of the run *name*."""
    folder, _, base = member.rpartition("/")
    if folder:
        return folder == f"data-{name}" and bool(_WAVEFUNCTION.match(base))
    if member.startswith("."):
        return False
    return member == f"{name}.yaml" or bool(_SIDE_FILES.match(member))


def check(members: list[str], name: str) -> None:
    """Refuse an input archive that holds anything but BigDFT's inputs for *name*."""
    check_name(name)
    refused = [m for m in members if not allowed(m, name)]
    if refused:
        raise InputError(f"not a BigDFT input of {name!r}: {', '.join(sorted(refused))} "
                         f"(accepted: {ACCEPTED.replace('NAME', name)})")
    if f"{name}.yaml" not in members:
        raise InputError(f"{name}.yaml is missing: it is the input `bigdft -n {name}` reads")


# A top-level `posinp: <file>` line: the geometry read from a file, not inline.
_POSINP_FILE = re.compile(r"^posinp:[ \t]*([^\s{\[#'\"][^\s#]*|'[^']+'|\"[^\"]+\")[ \t]*(#.*)?$",
                          re.M)

_INLINE_HINT = ("Give the geometry to PyBigDFT instead, which writes it INSIDE the input: "
                "SystemCalculator(dry_run=True).run(name=NAME, run_dir=DIR, input=inp, "
                "posinp={'units': 'angstroem', 'positions': [{'C': [0.0, 0.0, 0.0]}, ...]})")


def geometry_file(text: str) -> str | None:
    """The file a NAME.yaml reads its geometry from (`posinp: file`), or None when inline."""
    match = _POSINP_FILE.search(text)
    return match.group(1).strip("'\"") if match else None


def select(directory: Path, name: str, *, wavefunctions: bool = True) -> dict[str, Path]:
    """The files of *directory* to send for the run *name*: <name>.yaml and its side files.

    And, when data-<name>/ holds some, the wavefunctions the run restarts from
    (*wavefunctions*; a dry run reads none, and leaves them behind).

    A geometry that <name>.yaml names (`posinp: file`) and that would not travel
    is refused HERE, with the reason: silently left behind, it makes BigDFT
    answer "No given atoms" on the HAPS while the file sits in the agent's
    directory — an error nobody can fix from what it says.
    """
    check_name(name)
    if not (directory / f"{name}.yaml").is_file():
        raise InputError(f"{name}.yaml not found in {directory}: prepare it first "
                         "(PyBigDFT with dry_run=True writes it)")
    selected = {}
    for path in sorted(directory.iterdir()):
        if path.is_file() and not path.is_symlink() and allowed(path.name, name) \
                and (path.name == f"{name}.yaml" or not path.name.endswith(".yaml")
                     or path.name.startswith("posinp.")):
            selected[path.name] = path
    referenced = geometry_file((directory / f"{name}.yaml").read_text(errors="replace"))
    if referenced and not allowed(referenced, name):
        raise InputError(
            f"{name}.yaml reads its geometry from {referenced!r}, which is never sent to the "
            f"HAPS: only posinp.xyz|ascii|yaml or <x>.xyz|ascii files beside {name}.yaml travel "
            f"(and BigDFT reads only those formats). {_INLINE_HINT}")
    if referenced and referenced not in selected:
        raise InputError(f"{name}.yaml reads its geometry from {referenced!r}, which is not in "
                         f"{directory.name}/. {_INLINE_HINT}")
    data = directory / f"data-{name}"
    if wavefunctions and data.is_dir() and not data.is_symlink():
        for path in sorted(data.iterdir()):
            member = f"{data.name}/{path.name}"
            if path.is_file() and not path.is_symlink() and allowed(member, name):
                selected[member] = path
    return selected
