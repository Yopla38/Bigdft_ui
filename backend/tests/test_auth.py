"""Signing up, in and out; what protects a session."""
from __future__ import annotations

from typing import Any

from conftest import ORIGIN, PASSWORD, Browser


def test_register_signs_in_and_keeps_the_password_secret(browser: Browser, server: Any) -> None:
    answer = browser.register("New.User@Example.org", "New user")
    assert answer.status_code == 201
    user = answer.json()["user"]
    assert user["email"] == "new.user@example.org" and user["role"] == "USER" and "password" not in str(answer.json()).lower()
    cookie = answer.headers["set-cookie"].lower()
    assert "ond_session=" in cookie and "httponly" in cookie and "samesite=lax" in cookie
    assert browser.get("/auth/me").json()["user"]["email"] == "new.user@example.org"

    from sqlalchemy import select

    from app.db import get_sessionmaker
    from app.models import AuthSession, User

    with get_sessionmaker()() as db:
        row = db.scalar(select(User))
        assert row is not None and row.password_hash.startswith("$argon2id$") and PASSWORD not in row.password_hash
        token = browser.http.cookies.get("ond_session")
        assert token and db.scalar(select(AuthSession).where(AuthSession.token_hash == token)) is None      # only its digest is kept


def test_register_refuses_what_is_not_valid(browser: Browser, alice: Browser) -> None:
    browser.token()
    taken = browser.post("/auth/register", {"email": "ALICE@example.org", "name": "Other", "password": PASSWORD})
    assert taken.status_code == 409 and taken.json()["error"]["code"] == "email_taken"
    short = browser.post("/auth/register", {"email": "c@example.org", "name": "C", "password": "short"})
    assert short.status_code == 422 and "password" in short.json()["error"]["fields"]
    bad = browser.post("/auth/register", {"email": "not-an-email", "name": "C", "password": PASSWORD})
    assert bad.status_code == 422 and "email" in bad.json()["error"]["fields"]
    extra = browser.post("/auth/register", {"email": "c@example.org", "name": "C", "password": PASSWORD, "role": "ADMIN"})
    assert extra.status_code == 422 and "role" in extra.json()["error"]["fields"]                          # nobody names their own role
    assert browser.get("/auth/me").status_code == 401


def test_login_logout_me(alice: Browser, server: Any) -> None:
    other = Browser(server)
    assert other.get("/auth/me").status_code == 401
    wrong = other.login("alice@example.org", "not the password")
    unknown = other.login("nobody@example.org", "not the password")
    assert wrong.status_code == unknown.status_code == 401
    assert wrong.json()["error"] == unknown.json()["error"]                 # nothing says which accounts exist
    assert other.login("alice@example.org").status_code == 200
    assert other.get("/auth/me").json()["user"]["name"] == "Alice"
    assert other.post("/auth/logout").status_code == 204
    assert other.get("/auth/me").status_code == 401
    assert alice.get("/auth/me").status_code == 200                          # the other browser is still signed in


def test_a_new_sign_in_never_keeps_the_session_it_came_with(alice: Browser) -> None:
    before = alice.http.cookies.get("ond_session")
    assert alice.login("alice@example.org").status_code == 200
    after = alice.http.cookies.get("ond_session")
    assert before and after and before != after
    alice.http.cookies.clear()
    alice.http.cookies.set("ond_session", before)
    assert alice.get("/auth/me").status_code == 401                          # the session it replaced signs nobody in


def test_requests_that_change_something_need_the_origin_and_the_token(alice: Browser) -> None:
    body = {"name": "Changed"}
    assert alice.http.patch("/api/account", json=body, headers={"Origin": ORIGIN}).json()["error"]["code"] == "bad_csrf"
    assert alice.http.patch("/api/account", json=body, headers={"Origin": ORIGIN, "X-CSRF-Token": "guess"}).status_code == 403
    elsewhere = alice.http.patch("/api/account", json=body, headers={"Origin": "https://evil.example", "X-CSRF-Token": alice.csrf})
    assert elsewhere.status_code == 403 and elsewhere.json()["error"]["code"] == "bad_origin"
    assert alice.http.patch("/api/account", json=body, headers={"X-CSRF-Token": alice.csrf}).status_code == 403     # no Origin at all
    form = alice.http.post("/api/auth/logout", content="a=b", headers={"Origin": ORIGIN, "X-CSRF-Token": alice.csrf,
                                                                      "Content-Type": "application/x-www-form-urlencoded"})
    assert form.status_code == 415
    assert alice.get("/auth/me").json()["user"]["name"] == "Alice"
    assert alice.patch("/account", body).json()["name"] == "Changed"


def test_sign_in_before_any_session_needs_a_token_too(browser: Browser, alice: Browser) -> None:
    refused = browser.http.post("/api/auth/login", json={"email": "alice@example.org", "password": PASSWORD}, headers={"Origin": ORIGIN})
    assert refused.status_code == 403 and refused.json()["error"]["code"] == "bad_csrf"


def test_guessing_a_password_is_slowed_down(browser: Browser, alice: Browser) -> None:
    for _ in range(4):
        assert browser.login("alice@example.org", "a guess").status_code == 401
    blocked = browser.login("alice@example.org")
    assert blocked.status_code == 429 and blocked.json()["error"]["code"] == "too_many_attempts" and "retry-after" in blocked.headers
    assert browser.login("bob@example.org", "a guess").status_code == 401   # counted per e-mail


def test_changing_the_password_signs_out_everywhere_else(alice: Browser, server: Any) -> None:
    phone = Browser(server)
    assert phone.login("alice@example.org").status_code == 200
    assert len(alice.get("/account/sessions").json()) == 2
    wrong = alice.put("/account/password", {"current_password": "not it", "new_password": "another long password"})
    assert wrong.status_code == 403 and wrong.json()["error"]["code"] == "wrong_password"
    weak = alice.put("/account/password", {"current_password": PASSWORD, "new_password": "short"})
    assert weak.status_code == 422
    done = alice.put("/account/password", {"current_password": PASSWORD, "new_password": "another long password"})
    assert done.status_code == 200
    alice.csrf = done.json()["csrf"]
    assert phone.get("/auth/me").status_code == 401
    assert alice.get("/auth/me").status_code == 200
    assert Browser(server).login("alice@example.org").status_code == 401
    assert Browser(server).login("alice@example.org", "another long password").status_code == 200


def test_profile_and_sessions(alice: Browser, bob: Browser, server: Any) -> None:
    assert alice.patch("/account", {"email": "alice2@example.org"}).status_code == 403          # the e-mail changes with the password only
    assert alice.patch("/account", {"email": "bob@example.org", "current_password": PASSWORD}).status_code == 409
    changed = alice.patch("/account", {"email": "Alice2@example.org", "name": "Alice B.", "current_password": PASSWORD})
    assert changed.status_code == 200 and changed.json()["email"] == "alice2@example.org"
    phone = Browser(server)
    assert phone.login("alice2@example.org").status_code == 200
    devices = alice.get("/account/sessions").json()
    assert [d["current"] for d in devices].count(True) == 1
    elsewhere = next(d for d in devices if not d["current"])
    assert bob.delete(f"/account/sessions/{elsewhere['id']}").status_code == 404                # not his
    assert alice.delete(f"/account/sessions/{elsewhere['id']}").status_code == 204
    assert phone.get("/auth/me").status_code == 401


def test_deleting_an_account_removes_what_it_created(alice: Browser, server: Any) -> None:
    from conftest import SEED

    assert alice.post("/studies", {"document": SEED[0]}).status_code == 201
    assert alice.delete("/account", {"password": "not it"}).status_code == 403
    assert alice.delete("/account", {"password": PASSWORD}).status_code == 204
    assert alice.get("/auth/me").status_code == 401
    assert Browser(server).login("alice@example.org").status_code == 401

    from sqlalchemy import func, select

    from app.db import get_sessionmaker
    from app.models import Study

    with get_sessionmaker()() as db:
        assert db.scalar(select(func.count()).select_from(Study)) == 0


def test_registration_can_be_closed(server: Any, browser: Browser) -> None:
    from app.config import get_settings

    get_settings().registration = "closed"
    assert browser.token() and browser.get("/auth/csrf").json()["registration"] == "closed"
    refused = browser.post("/auth/register", {"email": "late@example.org", "name": "Late", "password": PASSWORD})
    assert refused.status_code == 403 and refused.json()["error"]["code"] == "registration_closed"
