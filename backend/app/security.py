"""Passwords and tokens.

A password is kept as an Argon2id hash, never otherwise. A session is a random
token in a cookie the page cannot read; the database keeps its SHA-256 only, so
that a copy of the database signs nobody in.
"""
from __future__ import annotations

import hashlib
import hmac
import secrets

from argon2 import PasswordHasher
from argon2.exceptions import InvalidHashError, VerificationError

_hasher = PasswordHasher()                                   # Argon2id, the library's parameters (RFC 9106, low memory)
# Checked when no account has the e-mail given, so that the answer takes as long as for a wrong password.
_DUMMY = _hasher.hash(secrets.token_urlsafe(16))


def hash_password(password: str) -> str:
    return str(_hasher.hash(password))


def verify_password(password: str, known: str | None) -> bool:
    try:
        return bool(_hasher.verify(known or _DUMMY, password)) and known is not None
    except (VerificationError, InvalidHashError):
        return False


def needs_rehash(known: str) -> bool:
    """True when the hash was made with weaker parameters than today's: it is made again at the next sign-in."""
    return bool(_hasher.check_needs_rehash(known))


def new_token() -> str:
    return secrets.token_urlsafe(32)


def digest(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()


def same(a: str, b: str) -> bool:
    """Compared in constant time: the time it takes says nothing of where two tokens differ."""
    return hmac.compare_digest(a.encode(), b.encode())
