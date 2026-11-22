"""Asymille plugged into the accounts of this server: its projects belong to who made them, and its API is behind the same guards."""
from __future__ import annotations

import json
import math
from pathlib import Path
from typing import Any

from conftest import ORIGIN, Browser

BACKEND = Path(__file__).resolve().parent.parent
ROOT = BACKEND.parent
X = [i / 10 for i in range(200)]
Y = [4 * 2.718281828 ** (-((x - 7) ** 2) / 1.28) + 0.3 + 0.02 * x + 0.01 * ((i * 37) % 11 - 5) for i, x in enumerate(X)]
MODEL = {"components": [{"id": "p1", "fn": "gaussian", "params": {}}, {"id": "b1", "fn": "linear", "params": {}}]}


def document(name: str = "Spectra") -> dict[str, Any]:
    return {"version": 1, "name": name, "seq": 3, "graphs": [], "fits": [], "series": [], "log": [], "view": {"main": "sheet", "sheet": "s1"},
            "sheets": [{"id": "s1", "name": "Sheet 1", "source": "", "columns": [
                {"id": "c2", "name": "A", "title": "Energy", "unit": "eV", "role": "x", "formula": "", "comment": "", "made": None, "values": [1, 2, None, 4]},
                {"id": "c3", "name": "B", "title": "", "unit": "", "role": "y", "formula": "A*2", "comment": "", "made": None, "values": [2, 4, None, "n/a"]}]}]}


def test_nobody_signed_in_gets_nothing(browser: Browser) -> None:
    for path in ("/asymille/catalogue", "/asymille/projects", "/asymille/projects/1"):
        assert browser.get(path).status_code == 401, path
    browser.token()
    assert browser.post("/asymille/fit", {"x": X, "y": Y, "model": MODEL}).status_code == 401
    assert browser.post("/asymille/projects", {"document": document()}).status_code == 401


def test_a_project_is_kept_under_its_owner_and_nobody_else_sees_it(alice: Browser, bob: Browser) -> None:
    made = alice.post("/asymille/projects", {"document": document()})
    assert made.status_code == 201, made.text
    project = made.json()
    assert project["document"] == document() and (project["name"], project["sheet_count"], project["revision"]) == ("Spectra", 1, 1)
    assert [p["id"] for p in alice.get("/asymille/projects").json()] == [project["id"]]
    # for another account it does not exist: not to read, not to change, not to copy, not to delete
    assert bob.get("/asymille/projects").json() == []
    assert bob.get(f"/asymille/projects/{project['id']}").status_code == 404
    assert bob.put(f"/asymille/projects/{project['id']}", {"document": document("Mine now"), "revision": 1}).status_code == 404
    assert bob.post(f"/asymille/projects/{project['id']}/duplicate").status_code == 404
    assert bob.delete(f"/asymille/projects/{project['id']}").status_code == 404
    assert alice.get(f"/asymille/projects/{project['id']}").json()["name"] == "Spectra"
    saved = alice.put(f"/asymille/projects/{project['id']}", {"document": document("Renamed"), "revision": 1})
    assert saved.status_code == 200 and saved.json()["revision"] == 2
    stale = alice.put(f"/asymille/projects/{project['id']}", {"document": document(), "revision": 1})
    assert stale.status_code == 409 and stale.json()["error"]["code"] == "stale_revision"
    assert alice.delete(f"/asymille/projects/{project['id']}").status_code == 204 and alice.get("/asymille/projects").json() == []


def test_an_account_that_is_deleted_takes_its_projects_with_it(alice: Browser, admin: Browser) -> None:
    from sqlalchemy import func, select

    from app.asymille import Project
    from app.db import get_sessionmaker

    assert alice.post("/asymille/projects", {"document": document()}).status_code == 201
    assert admin.delete(f"/admin/users/{alice.user['id']}").status_code == 204
    with get_sessionmaker()() as db:
        assert db.scalar(select(func.count()).select_from(Project)) == 0


def test_the_same_guards_as_every_address_of_the_api(alice: Browser) -> None:
    body = {"document": document()}
    assert alice.http.post("/api/asymille/projects", json=body, headers={"X-CSRF-Token": alice.csrf}).json()["error"]["code"] == "bad_origin"
    assert alice.http.post("/api/asymille/projects", json=body, headers={"Origin": "http://evil.example", "X-CSRF-Token": alice.csrf}).json()["error"]["code"] == "bad_origin"
    assert alice.http.post("/api/asymille/projects", json=body, headers={"Origin": ORIGIN, "X-CSRF-Token": "guess"}).json()["error"]["code"] == "bad_csrf"
    unknown = alice.post("/asymille/projects", {"document": dict(document(), script="import os")})
    assert unknown.status_code == 422 and unknown.json()["error"]["code"] == "validation_error" and "document.script" in unknown.json()["error"]["fields"]
    assert alice.get("/asymille/projects").json() == []


def test_a_fit_an_operation_and_a_figure_for_who_is_signed_in(alice: Browser) -> None:
    catalogue = alice.get("/asymille/catalogue").json()
    assert len(catalogue["functions"]) == 56 and len(catalogue["operations"]) == 18
    assert catalogue["limits"]["document_bytes"] == 4 * 1024 * 1024                # ONDELETTE_MAX_BODY_BYTES: the page says how much room a project has left
    started = alice.post("/asymille/model/guess", {"x": X, "y": Y, "model": MODEL}).json()["model"]
    result = alice.post("/asymille/fit", {"x": X, "y": Y, "model": started}).json()
    params = {p["name"]: p for p in result["params"]}
    assert result["success"] and abs(params["p1_center"]["value"] - 7) < 0.01 and abs(params["p1_sigma"]["value"] - 0.8) < 0.01
    smooth = alice.post("/asymille/analyse", {"operation": "smooth_savgol", "args": {"window": 7, "order": 2}, "x": X, "y": Y}).json()
    assert len(smooth["columns"][0]["values"]) == len(X)
    figure = {"width": 80, "height": 60, "font": "Arial", "background": "#ffffff", "items": [{"t": "line", "paths": [[10, 10, 200, 150]], "stroke": "#000000", "width": 1}]}
    assert alice.post("/asymille/figure", {"figure": figure, "format": "pdf"}).json()["mime"] == "application/pdf"
    # errors on both axes, a decay through a measured response, and which of two models: the same answers as in Asymille's own tests
    line = {"components": [{"id": "b", "fn": "linear", "params": {}}]}
    px, py = [0.0, 0.9, 1.8, 2.6, 3.3, 4.4, 5.2, 6.1, 6.5, 7.4], [5.9, 5.4, 4.4, 4.6, 3.5, 3.7, 2.8, 2.8, 2.4, 1.5]
    sx, sy = [w ** -0.5 for w in (1000, 1000, 500, 800, 200, 80, 60, 20, 1.8, 1.0)], [w ** -0.5 for w in (1.0, 1.8, 4.0, 8.0, 20, 20, 70, 70, 100, 500)]
    york = alice.post("/asymille/fit", {"x": px, "y": py, "sigma": sy, "sigma_x": sx, "model": line, "options": {"weights": "instrumental"}}).json()
    assert york["x_errors"] and {p["name"]: round(p["value"], 6) for p in york["params"]} == {"b_slope": -0.480533, "b_intercept": 5.47991}
    t = [0.1 * i for i in range(300)]
    pulse = [math.exp(-((v - 3) ** 2) / 0.08) for v in t]
    total = sum(pulse)
    decay = [sum(pulse[k] / total * 500 * math.exp(-(t[j] - t[k]) / 4.0) for k in range(j + 1)) + 2 for j in range(300)]
    through = {"components": [{"id": "r1", "fn": "response", "params": {}}, {"id": "e1", "fn": "exp_decay", "params": {"y0": {"value": 0, "vary": False}}},
                              {"id": "b1", "fn": "constant", "params": {}}]}
    begun = alice.post("/asymille/model/guess", {"x": t, "y": decay, "model": through}).json()["model"]
    seen = alice.post("/asymille/fit", {"x": t, "y": decay, "response": pulse, "model": begun}).json()
    assert seen["response"] and {p["name"]: round(p["value"], 4) for p in seen["params"] if p["vary"]} == {"r1_shift": 0, "e1_A": 500, "e1_tau": 4, "b1_c": 2}
    two = [{"name": "one", "ndata": 300, "nvarys": 3, "chisqr": 52.0}, {"name": "two", "ndata": 300, "nvarys": 5, "chisqr": 40.0}]
    which = alice.post("/asymille/fit/compare", {"fits": two}).json()
    assert which["best"] == "two" and which["tests"][0]["df"] == [2, 295]
    # what cannot be computed is said in the error shape of this server; an expression is never run as code
    refused = alice.post("/asymille/fit", {"x": X, "y": Y, "model": {"components": [{"id": "u", "fn": "expression", "expr": "__import__('os').getcwd()"}]}})
    said = refused.json()["error"]
    assert refused.status_code == 422 and set(said) == {"code", "message"} and said["code"] == "refused" and "is not a known function" in said["message"]


def test_the_page_is_served_as_the_workshops_are(browser: Browser) -> None:
    page = browser.http.get("/asymille/")
    assert page.status_code == 200 and page.text.startswith("<!doctype html>") and "<title>Asymille</title>" in page.text
    policy = page.headers["content-security-policy"]
    nonce = policy.split("'nonce-")[1].split("'")[0]
    assert f'<script nonce="{nonce}">' in page.text and "<script>" not in page.text
    assert browser.http.get("/asymille", follow_redirects=False).status_code == 308
    scripts = [line.split('"')[1] for line in page.text.splitlines() if line.startswith('<script src="') and "://" not in line]
    assert len(scripts) == 15 and scripts[:2] == ["shared/api.js", "shared/account.js"]
    for script in scripts:
        assert browser.http.get("/asymille/" + script).status_code == 200, script
    # signing in is this server's: the page loads the account script of the workshops, not Asymille's stand-in
    assert browser.http.get("/asymille/shared/account.js").text == (ROOT / "prototype" / "js" / "account.js").read_text()
    assert browser.http.get("/asymille/examples/NW1051-NW1.txt").status_code == 200


def test_the_project_the_page_writes_is_accepted(alice: Browser) -> None:
    """asymille/js/model.js and backend/asymille/web/schemas.py describe the same document: a project built by the page's own model is posted."""
    import shutil
    import subprocess

    import pytest

    if shutil.which("node") is None:
        pytest.skip("node is not installed")
    script = """
    global.window = {}; for (const f of ['util', 'expr', 'importer', 'plot', 'model']) require('./asymille/js/' + f + '.js');
    const A = window.ASY, M = A.model; A.fnLabel = (c) => c.fn;
    M.blank('From the page');
    const columns = [{ title: 'Energy', unit: 'eV', values: [1, 2, 3, 4] }, { title: 'Counts', values: [10, 'n/a', 30, 40] }, { title: 'err', values: [1, 1, 1, 2], role: 'yerr' }];
    const s = M.sheetFrom('Peaks', columns);
    M.addColumn(s, { formula: 'B*2 + i' }); M.changed(s);
    const g = M.plot(s, [s.columns[1]], 'scatter'), f = M.addFit(s, s.columns[0], s.columns[1]);
    f.model.components = [{ id: 'p1', fn: 'gaussian', params: {} }]; M.showFit(f, g);
    const other = M.sheetFrom('Peaks 180K', columns), sr = M.addSeries(f);               // a series of two files, with its table of results and its graph
    sr.variable = { name: 'Temperature', unit: 'K' }; sr.members[0].value = 160; sr.members.push({ sheet: other.id, value: 180, state: 'todo', message: '', result: null });
    M.seriesTable(sr); M.reviewGraph(sr); M.log('Built in Node.'); M.commit();
    process.stdout.write(JSON.stringify(M.serialize()));
    """
    written = json.loads(subprocess.run(["node", "-e", script], cwd=ROOT, capture_output=True, text=True, timeout=60, check=True).stdout)
    made = alice.post("/asymille/projects", {"document": written})
    assert made.status_code == 201, made.text
    assert made.json()["document"] == written and (made.json()["sheet_count"], made.json()["graph_count"], made.json()["fit_count"]) == (4, 2, 1)
    assert [m["value"] for m in made.json()["document"]["series"][0]["members"]] == [160, 180]
