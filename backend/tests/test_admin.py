"""Roles: what an administrator may do, and what a member may not. Guided paths. The seed. The pages."""
from __future__ import annotations

from typing import Any

from conftest import ORIGIN, PASSWORD, SEED, Browser

NOTEBOOK = {"nbformat": 4, "nbformat_minor": 5, "metadata": {}, "cells": [{"cell_type": "markdown", "source": "# A path"},
                                                                         {"cell_type": "code", "source": "inp.set_xc('PBE')"}]}
GUIDE = {"title": "A path", "level": "Discovery", "minutes": 10, "summary": "", "origin": "Added by an administrator", "notebook": NOTEBOOK}


def test_the_seed_makes_an_administrator_and_a_demonstration(admin: Browser, server: Any) -> None:
    assert admin.user["role"] == "ADMIN"
    demo = Browser(server)
    assert demo.login("demo@example.org", "demonstration-pw").status_code == 200 and demo.user["role"] == "USER"
    assert sorted(s["name"] for s in demo.get("/studies").json()) == sorted(d["name"] for d in SEED)
    assert admin.get("/studies").json() == []                       # an administrator has no study of someone else in hand

    from app import seed

    assert seed.main() == 0                                         # run again: nothing twice
    assert len(demo.get("/studies").json()) == len(SEED)
    assert len(admin.get("/admin/users").json()) == 2


def test_administration_is_for_administrators(alice: Browser, admin: Browser, browser: Browser) -> None:
    for answer in (alice.get("/admin/users"), alice.get("/admin/jobs"), alice.patch(f"/admin/users/{alice.user['id']}", {"role": "ADMIN"}),
                   alice.post("/admin/users", {"email": "x@example.org", "name": "X", "password": PASSWORD}),
                   alice.delete(f"/admin/users/{admin.user['id']}")):
        assert answer.status_code == 403 and answer.json()["error"]["code"] == "forbidden"
    assert browser.get("/admin/users").status_code == 401
    assert alice.get("/auth/me").json()["user"]["role"] == "USER"

    users = {u["email"]: u for u in admin.get("/admin/users").json()}
    assert set(users) == {"root@example.org", "demo@example.org", "alice@example.org"} and users["demo@example.org"]["study_count"] == 2
    assert "password_hash" not in str(users)


def test_an_administrator_manages_accounts(alice: Browser, admin: Browser, server: Any) -> None:
    promoted = admin.patch(f"/admin/users/{alice.user['id']}", {"role": "ADMIN"})
    assert promoted.status_code == 200 and promoted.json()["role"] == "ADMIN"
    assert alice.get("/admin/users").status_code == 200             # the role is read at each request, not kept in the cookie
    assert admin.patch(f"/admin/users/{alice.user['id']}", {"role": "USER"}).json()["role"] == "USER"
    assert alice.get("/admin/users").status_code == 403

    only = admin.patch(f"/admin/users/{admin.user['id']}", {"role": "USER"})
    assert only.status_code == 409 and only.json()["error"]["code"] == "last_admin"
    assert admin.patch(f"/admin/users/{admin.user['id']}", {"is_active": False}).status_code == 409
    assert admin.delete(f"/admin/users/{admin.user['id']}").status_code == 409

    assert admin.patch(f"/admin/users/{alice.user['id']}", {"is_active": False}).json()["is_active"] is False
    assert alice.get("/auth/me").status_code == 401                 # signed out at once
    assert Browser(server).login("alice@example.org").status_code == 401
    assert admin.patch(f"/admin/users/{alice.user['id']}", {"is_active": True, "new_password": "set by the administrator"}).status_code == 200
    assert Browser(server).login("alice@example.org", "set by the administrator").status_code == 200

    made = admin.post("/admin/users", {"email": "carol@example.org", "name": "Carol", "password": PASSWORD, "role": "USER"})
    assert made.status_code == 201
    carol = Browser(server)
    assert carol.login("carol@example.org").status_code == 200
    assert carol.post("/studies", {"document": SEED[0]}).status_code == 201
    assert admin.delete(f"/admin/users/{made.json()['id']}").status_code == 204
    assert carol.get("/auth/me").status_code == 401
    assert admin.get("/admin/users/999").status_code in (404, 405)


def test_guided_paths_are_read_by_members_and_published_by_administrators(alice: Browser, admin: Browser, browser: Browser) -> None:
    assert browser.get("/guides").status_code == 401
    assert alice.get("/guides").json() == []
    assert alice.post("/guides", GUIDE).status_code == 403
    made = admin.post("/guides", GUIDE)
    assert made.status_code == 201 and made.json()["notebook"] == NOTEBOOK
    assert [g["title"] for g in alice.get("/guides").json()] == ["A path"]
    with_outputs = dict(GUIDE, notebook=dict(NOTEBOOK, cells=[{"cell_type": "code", "source": "1", "outputs": [{"data": "…"}]}]))
    assert admin.post("/guides", with_outputs).status_code == 422
    assert admin.post("/guides", dict(GUIDE, level="Wizard")).status_code == 422
    assert alice.delete(f"/guides/{made.json()['id']}").status_code == 403
    assert admin.delete(f"/guides/{made.json()['id']}").status_code == 204
    assert alice.get("/guides").json() == []


def test_the_pages_and_what_surrounds_every_answer(browser: Browser, server: Any) -> None:
    page = browser.http.get("/")
    assert page.status_code == 200 and "<!doctype html>" in page.text and 'id="study-name"' in page.text
    policy = page.headers["content-security-policy"]
    nonce = policy.split("'nonce-")[1].split("'")[0]
    assert f'<script nonce="{nonce}">' in page.text and "<script>" not in page.text and "frame-ancestors 'none'" in policy
    assert nonce not in browser.http.get("/").text                 # another one each time
    assert page.headers["x-content-type-options"] == "nosniff" and page.headers["x-frame-options"] == "DENY"
    first = browser.http.get("/first/")
    assert first.status_code == 200 and "the matter workshop" in first.text
    assert browser.http.get("/js/model.js").status_code == 200 and browser.http.get("/shared/chem.js").status_code == 200
    assert browser.http.get("/first/js/app.js").status_code == 200
    assert browser.http.get("/js/../../backend/.env").status_code in (400, 404)
    assert browser.http.get("/api/health").json() == {"status": "ok"}
    missing = browser.http.get("/api/nothing-here")
    assert missing.status_code == 404 and missing.json()["error"]["code"] == "not_found" and missing.headers["cache-control"] == "no-store"
    assert browser.http.get("/api/health", headers={"Host": "evil.example"}).status_code == 400      # another site that resolves here
    browser.token()
    large = browser.http.post("/api/auth/login", content=b'{"email": "' + b"a" * (5 * 1024 * 1024) + b'"}',
                              headers={"Origin": ORIGIN, "X-CSRF-Token": browser.csrf, "Content-Type": "application/json"})
    assert large.status_code == 413 and large.json()["error"]["code"] == "too_large"
