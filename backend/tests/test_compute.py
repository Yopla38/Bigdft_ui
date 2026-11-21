"""A wave: started for a study of one's own, followed, its results kept. The runner is a stand-in (fake_runner.py)."""
from __future__ import annotations

import time
from pathlib import Path
from typing import Any

from conftest import SEED, Browser


def plan(*names: str) -> dict[str, Any]:
    return {"plan": {"name": "a_study", "system": "h2o", "structure": {"units": "angstroem", "positions": [{"O": [0, 0, 0]}]},
                     "steps": [{"fn": "calculation", "name": n, "args": [], "kwargs": {}} for n in names]},
            "names": list(names), "keys": {n: f"h2o|key-of-{n}|geo=start" for n in names}, "script": "# never run\n"}


def test_a_wave_is_computed_and_its_results_are_kept(alice: Browser, server: Any) -> None:
    study = alice.post("/studies", {"document": SEED[1]}).json()
    started = alice.post(f"/studies/{study['id']}/compute", plan("water", "bad_one"))
    assert started.status_code == 200, started.text
    status = alice.wait(started.json()["job"])
    assert status["state"] == "done" and status["runs"]["water"]["state"] == "done" and status["runs"]["bad_one"]["state"] == "refused"
    kept = alice.get(f"/studies/{study['id']}").json()
    assert list(kept["results"]) == ["h2o|key-of-water|geo=start"] and kept["results"]["h2o|key-of-water|geo=start"]["name"] == "water"
    assert kept["job"] is None

    work = Path(server.state.compute.workdir)
    where = work / f"u{alice.user['id']}" / f"s{study['id']}"
    assert (where / "runs" / "log-water.yaml").is_file() and (where / "study.py").read_text() == "# never run\n"
    assert alice.delete(f"/studies/{study['id']}").status_code == 204
    assert not where.exists()                                       # the runs leave with the study


def test_a_wave_of_someone_else_does_not_exist(alice: Browser, bob: Browser) -> None:
    study = alice.post("/studies", {"document": SEED[1]}).json()
    job = alice.post(f"/studies/{study['id']}/compute", plan("slow_one")).json()["job"]
    assert bob.get(f"/jobs/{job}").status_code == 404
    assert bob.post(f"/jobs/{job}/cancel").status_code == 404
    assert alice.get(f"/jobs/{job}").json()["state"] == "running"
    assert alice.get(f"/studies/{study['id']}").json()["job"] == job
    again = alice.post(f"/studies/{study['id']}/compute", plan("water"))
    assert again.status_code == 409 and again.json()["error"]["code"] == "already_computing" and again.json()["error"]["job"] == job
    assert alice.delete(f"/studies/{study['id']}").status_code == 409                 # not while it computes
    for _ in range(100):                                            # the stand-in says "running" once it listens
        if alice.get(f"/jobs/{job}").json()["runs"].get("slow_one", {}).get("state") == "running":
            break
        time.sleep(0.05)
    assert alice.post(f"/jobs/{job}/cancel").status_code == 200
    status = alice.wait(job)
    assert status["state"] == "done" and status["runs"]["slow_one"]["state"] == "stopped"
    assert alice.get(f"/studies/{study['id']}").json()["results"] == {}


def test_results_are_kept_even_when_no_page_asks(alice: Browser, server: Any) -> None:
    from sqlalchemy import select

    from app.db import get_sessionmaker
    from app.models import Job

    study = alice.post("/studies", {"document": SEED[1]}).json()
    job = alice.post(f"/studies/{study['id']}/compute", plan("water")).json()["job"]
    for _ in range(100):                                            # nobody reads /jobs: the server follows the wave itself
        with get_sessionmaker()() as db:
            server.state.compute.sweep(db)
            row = db.scalar(select(Job).where(Job.id == job))
            if row is not None and row.state == "done":
                break
        time.sleep(0.05)
    assert row is not None and row.state == "done" and row.finished_at is not None
    assert "h2o|key-of-water|geo=start" in alice.get(f"/studies/{study['id']}").json()["results"]


def test_a_user_computes_a_bounded_number_of_studies_at_once(alice: Browser) -> None:
    ids = [alice.post("/studies", {"document": SEED[1]}).json()["id"] for _ in range(3)]
    jobs = [alice.post(f"/studies/{i}/compute", plan("slow_one")) for i in ids]
    assert [j.status_code for j in jobs] == [200, 200, 429] and jobs[2].json()["error"]["code"] == "too_many_jobs"
    for j in jobs[:2]:
        alice.post(f"/jobs/{j.json()['job']}/cancel")
        alice.wait(j.json()["job"])


def test_what_is_not_a_plan_is_refused(alice: Browser) -> None:
    study = alice.post("/studies", {"document": SEED[1]}).json()
    path = f"/studies/{study['id']}/compute"
    body = plan("water")
    body["names"] = ["../../etc/passwd"]
    assert alice.post(path, body).status_code == 422
    body = plan("water")
    body["plan"]["name"] = "../escape"
    assert alice.post(path, body).status_code == 422
    body = plan("water")
    body["plan"]["steps"][0]["fn"] = "__import__('os').system"
    assert alice.post(path, body).status_code == 422
    body = plan("water")
    body["code"] = "print(1)"
    assert alice.post(path, body).status_code == 422                # nothing to execute is accepted, under any name


def test_the_haps_is_described_to_whom_it_concerns(alice: Browser, admin: Browser, server: Any, browser: Browser) -> None:
    assert browser.get("/info").status_code == 401
    mine = alice.get("/info").json()
    assert mine["live"] is True and mine["haps"]["ok"] is True and mine["bridge"] is None and mine["workdir"] is None
    theirs = admin.get("/info").json()
    assert theirs["bridge"] and theirs["workdir"] == str(server.state.compute.workdir)

    server.state.bridge.update(ok=False, text="ebservice: connection refused at http://10.0.0.5:8100")
    server.state.compute._info = (0.0, {})
    study = alice.post("/studies", {"document": SEED[1]}).json()
    down = alice.post(f"/studies/{study['id']}/compute", plan("water"))
    assert down.status_code == 503 and down.json()["error"]["code"] == "haps_not_ready" and "10.0.0.5" not in down.text
    assert "10.0.0.5" not in alice.get("/info").text and "10.0.0.5" in admin.get("/info").text
