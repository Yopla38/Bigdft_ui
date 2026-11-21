"""The studies of a user: kept whole, changed with a revision, and nobody else's."""
from __future__ import annotations

import copy
from typing import Any

from conftest import SEED, Browser


def test_a_study_written_by_the_page_comes_back_as_it_was_sent(alice: Browser) -> None:
    for document in SEED:
        made = alice.post("/studies", {"document": document})
        assert made.status_code == 201, made.text
        study = made.json()
        whole = dict(document, layout={})                           # where its boxes were dragged: nowhere yet
        assert study["document"] == whole                           # nothing else added, nothing dropped: not even a null
        assert (study["name"], study["step_count"], study["revision"]) == (document["name"], len(document["steps"]), 1)
        assert alice.get(f"/studies/{study['id']}").json()["document"] == whole
    listed = alice.get("/studies").json()
    assert [s["name"] for s in listed] == [SEED[1]["name"], SEED[0]["name"]]       # the most recently changed first
    assert "document" not in listed[0]


def test_saving_needs_the_revision_the_change_was_made_from(alice: Browser) -> None:
    study = alice.post("/studies", {"document": SEED[1]}).json()
    document = copy.deepcopy(SEED[1])
    document["name"] = "Renamed"
    saved = alice.put(f"/studies/{study['id']}", {"document": document, "revision": 1})
    assert saved.status_code == 200 and saved.json()["revision"] == 2 and saved.json()["name"] == "Renamed"
    document["name"] = "From a tab that did not see the change"
    stale = alice.put(f"/studies/{study['id']}", {"document": document, "revision": 1})
    assert stale.status_code == 409 and stale.json()["error"]["code"] == "stale_revision" and stale.json()["error"]["revision"] == 2
    assert alice.get(f"/studies/{study['id']}").json()["name"] == "Renamed"
    assert alice.put(f"/studies/{study['id']}", {"document": document, "revision": 2}).json()["revision"] == 3


def test_a_study_of_someone_else_does_not_exist(alice: Browser, bob: Browser, browser: Browser) -> None:
    study = alice.post("/studies", {"document": SEED[0]}).json()
    path = f"/studies/{study['id']}"
    plan = {"plan": {"name": "x", "structure": {}, "steps": [{"fn": "calculation", "name": "a"}]}, "names": ["a"]}
    assert bob.get("/studies").json() == []
    for answer in (bob.get(path), bob.put(path, {"document": SEED[1], "revision": 1}), bob.delete(path), bob.post(path + "/duplicate"),
                   bob.post(path + "/compute", plan)):
        assert answer.status_code == 404 and answer.json()["error"]["code"] == "not_found"
    assert alice.get(path).json()["document"] == dict(SEED[0], layout={})          # and nothing of it was changed
    browser.token()
    for answer in (browser.get("/studies"), browser.get(path), browser.post("/studies", {"document": SEED[0]}), browser.delete(path)):
        assert answer.status_code == 401 and answer.json()["error"]["code"] == "not_authenticated"


def test_what_is_not_a_study_is_refused(alice: Browser) -> None:
    def refused(change: Any) -> dict[str, str]:
        document = copy.deepcopy(SEED[0])
        change(document)
        answer = alice.post("/studies", {"document": document})
        assert answer.status_code == 422 and answer.json()["error"]["code"] == "validation_error", answer.text
        fields: dict[str, str] = answer.json()["error"]["fields"]
        return fields

    assert "document.version" in refused(lambda d: d.update(version=7))
    assert "document.owner_id" in refused(lambda d: d.update(owner_id=1))                     # a field nobody described
    assert "document.name" in refused(lambda d: d.update(name="x" * 61))
    assert any("links" in f or "steps" in f for f in refused(lambda d: d["steps"][2]["links"].update(after="s999")))
    assert "document.steps.0.id" in refused(lambda d: d["steps"][0].update(id="../../etc"))
    assert any(f.startswith("document.steps") for f in refused(lambda d: d["steps"].append(copy.deepcopy(d["steps"][0]))))
    assert alice.post("/studies", {"document": SEED[0], "owner_id": 2}).status_code == 422
    assert alice.get("/studies").json() == []


def test_duplicate_and_delete(alice: Browser) -> None:
    study = alice.post("/studies", {"document": SEED[0]}).json()
    twin = alice.post(f"/studies/{study['id']}/duplicate")
    assert twin.status_code == 201 and twin.json()["name"] == SEED[0]["name"] + " (copy)" and twin.json()["id"] != study["id"]
    assert twin.json()["document"]["steps"] == SEED[0]["steps"] and twin.json()["document"]["log"] == []
    assert alice.delete(f"/studies/{study['id']}").status_code == 204
    assert alice.get(f"/studies/{study['id']}").status_code == 404
    assert [s["id"] for s in alice.get("/studies").json()] == [twin.json()["id"]]


def test_an_account_holds_a_bounded_number_of_studies(alice: Browser) -> None:
    from app.config import get_settings

    get_settings().max_studies_per_user = 2
    assert alice.post("/studies", {"document": SEED[0]}).status_code == 201
    assert alice.post("/studies", {"document": SEED[1]}).status_code == 201
    full = alice.post("/studies", {"document": SEED[1]})
    assert full.status_code == 409 and full.json()["error"]["code"] == "too_many_studies"
