"""The tar.gz that carries a working directory through an ephemeral buffer.

A buffer is one stream of bytes with no name and no structure, so a set of
files travels as one archive. Both ends use this module: the bridge packs the
agent's directory and unpacks the results, the runtime does the reverse. The
HAPS holds a copy (../bigdft_haps_service/pybigdft_haps/archive.py): keep the two the same.

Unpacking refuses anything that could land outside the target — an absolute
name, a `..`, a link, a device. The archive comes from the other side of a
network service: it is data, and data does not get to choose where it is
written.
"""

from __future__ import annotations

import hashlib
import io
import tarfile
from pathlib import Path, PurePosixPath


class ArchiveError(ValueError):
    pass


def file_digest(path: Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as f:
        for chunk in iter(lambda: f.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()


def snapshot(root: Path) -> dict[str, str]:
    """relative path → sha256, for every regular file under *root*."""
    return {p.relative_to(root).as_posix(): file_digest(p)
            for p in sorted(root.rglob("*")) if p.is_file() and not p.is_symlink()}


def pack(entries: dict[str, Path]) -> bytes:
    """A tar.gz holding each file of *entries* (archive name → file on disk)."""
    buf = io.BytesIO()
    with tarfile.open(fileobj=buf, mode="w:gz") as tar:
        for name, path in sorted(entries.items()):
            info = tar.gettarinfo(str(path), arcname=name)
            info.uid = info.gid = 0
            info.uname = info.gname = ""
            with path.open("rb") as f:
                tar.addfile(info, f)
    return buf.getvalue()


def _safe_name(name: str) -> PurePosixPath:
    pure = PurePosixPath(name)
    if pure.is_absolute() or ".." in pure.parts or not pure.parts:
        raise ArchiveError(f"refused archive member {name!r}: outside the target")
    return pure


def members(data: bytes) -> list[str]:
    with tarfile.open(fileobj=io.BytesIO(data), mode="r:gz") as tar:
        return [m.name for m in tar.getmembers() if m.isfile()]


def unpack(data: bytes, target: Path, *, route=None) -> list[Path]:
    """Extract the regular files of a tar.gz under *target*; return what was written.

    *route*, when given, maps a member name to ``(root, relative path)`` or to
    None to skip it — the MCP server sends ``files/…`` to the working directory
    and ``logs/…`` beside it. Every destination must resolve inside its root
    (a symlinked directory does not get to redirect a write). Anything that is
    not a regular file is refused, not skipped, so a hostile archive fails
    loudly.
    """
    written: list[Path] = []
    with tarfile.open(fileobj=io.BytesIO(data), mode="r:gz") as tar:
        for member in tar.getmembers():
            if member.isdir():
                continue
            if not member.isfile():
                raise ArchiveError(f"refused archive member {member.name!r}: not a regular file")
            name = _safe_name(member.name)
            placed = route(name) if route else (target, name)
            if placed is None:
                continue
            root, relative = Path(placed[0]).resolve(), placed[1]
            dest = (root / relative).resolve()
            if not dest.is_relative_to(root):
                raise ArchiveError(f"refused archive member {member.name!r}: outside {root}")
            dest.parent.mkdir(parents=True, exist_ok=True)
            source = tar.extractfile(member)
            if source is None:
                continue
            with dest.open("wb") as out:
                while chunk := source.read(1 << 20):
                    out.write(chunk)
            written.append(dest)
    return written
