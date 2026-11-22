# Backend: the server of the application

The application is the two pages and this server. The server holds what a page cannot: the accounts, the studies of each user in a database, and the way to BigDFT. A web page cannot start BigDFT and must not hold the account of a HAPS; when a step is computed the server prepares the runs with the registry of steps, has BigDFT check each input on the dry-run HAPS, sends the calculation to the HAPS, reads the logs that come back and keeps the results with the study.

```
page ──► serve.py ─────────► runner.py ──► MCP bridge ──► dry-run HAPS : memguess NPROC NAME dd l
 :8766   app/ (FastAPI)      one wave       :8791          HAPS         : bigdft -n NAME
         accounts, studies   PyBigDFT       (bridge.sh)    (ebservice, ebuffer, the two runtimes)
         SQLite / PostgreSQL
```

No BigDFT here, no container, no image: PyBigDFT is installed without BigDFT (`pybigdft==1.9.6.1`, the version the pack runs). The server and `runner.py` hold no account on the HAPS: the bridge does, a separate process.

## Run it

```bash
cd backend
uv sync                                  # once: the environment (add --extra postgres for PostgreSQL)
cp .env.example .env                     # once: the settings; every one has a default that suits a local start
uv run alembic upgrade head              # create the database, or bring it up to date
uv run python -m app.seed                # once: an administrator and a demonstration account (their passwords are printed once)
uv run python serve.py                   # http://localhost:8766
```

That is enough to sign in, build studies and find them again: without a HAPS the page works on the recorded results, as the mock-up does. To compute, two more things must be up. The first is the HAPS operator's; the second is this directory's.

```bash
# 1. The two HAPS, served: by whoever operates them, on whatever machine (serve_remote.sh or serve_local.sh of the service)

# 2. The workshop's bridge, on 8791, with this directory's work/ as its working directory
./bridge.sh ~/.config/haps/aqmo-test.env # a remote HAPS: the file that holds your account on it
./bridge.sh                              # a local demo HAPS (serve_local.sh): no file
```

`serve.py` says at start what it found: the mode, the database, whether the bridge answers and whether wavefunctions travel through it. It refuses to start on a database the migrations have not brought up to date. Signed in, the page shows a switch, "Recorded | Compute": on "Compute" every step is computed now; on "Recorded" it shows the library of recorded results. Opened with `tools/preview.py`, no server answers: no account, and the page is the mock-up.

Check it:

```bash
uv run pytest                            # the API: accounts, sessions, roles, isolation between users, studies, waves, Asymille's projects (38 tests, no HAPS needed)
uv run mypy                              # the types of app/ (strict)
uv run ruff check app tests serve.py migrations
ONDELETTE_EMAIL=… ONDELETTE_PASSWORD=… node ../tools/check_live.js    # the whole chain, computing: 18 BigDFT runs, a few minutes
```

## Accounts, sessions, roles

| | |
|---|---|
| Passwords | Argon2id (`argon2-cffi`). Ten characters at least. Never logged, never answered |
| Session | A random token in a cookie the page cannot read (`HttpOnly`, `SameSite=Lax`, and in production `Secure` under the name `__Host-ond_session`). The database keeps its SHA-256 only. A new one at each sign-in; all of them end when the password changes. It ends after `ONDELETTE_SESSION_DAYS` without a request |
| CSRF | A request that changes something must come from the server's own origin (`Origin` header) and carry the token of its session in `X-CSRF-Token`. The page receives that token when it signs in; another site cannot read it. Signing in itself needs a token (`/api/auth/csrf`) |
| CORS | None by default: the API is same-origin. `ONDELETTE_CORS_ORIGINS` names the other origins allowed to call it with the cookie |
| Guessing | After `ONDELETTE_LOGIN_MAX_ATTEMPTS` failed sign-ins for one address and one e-mail, the next are refused for `ONDELETTE_LOGIN_WINDOW_MINUTES`. An unknown e-mail and a wrong password get the same answer, in the same time |
| Roles | `USER` and `ADMIN`, read from the database at each request (`deps.py`: `current_user`, `require_admin`). An administrator manages accounts, publishes guided paths and sees which waves were sent; not the content of a study |
| Isolation | Every study, result and wave carries the id of its owner and is looked up **with** it: somebody else's answers 404, as if it did not exist. On disk, `work/u<user>/s<study>/` |
| Registration | `ONDELETTE_REGISTRATION=open` or `closed`. Every account computes with the one HAPS account of the bridge: on a shared HAPS, close it and create the accounts from "Users and computing" |
| Around every answer | `X-Content-Type-Options`, `X-Frame-Options: DENY`, `Referrer-Policy`, a content security policy (the pages: their own scripts, a nonce for the inline one, the three hosts their libraries come from), HSTS in production, a 4 MB limit on what is read, and only the expected `Host` |

Not there: e-mail verification and "forgot my password" by e-mail (no mail is sent by this server; an administrator sets a new password), and second factors.

## The API

Everything is under `/api`, JSON in and out, and described at `/api/docs` outside production. An error always has the same shape: `{"error": {"code", "message", "detail"?, "fields"?}}`.

| Address | |
|---|---|
| `GET auth/csrf` · `POST auth/register` · `POST auth/login` · `POST auth/logout` · `GET auth/me` | signing up, in and out; who is signed in |
| `PATCH account` · `PUT account/password` · `GET account/sessions` · `DELETE account/sessions/ID` · `DELETE account` | the profile, the password, where the account is signed in, deleting it with everything it created |
| `GET studies` · `POST studies` · `GET studies/ID` · `PUT studies/ID` · `DELETE studies/ID` · `POST studies/ID/duplicate` | the studies of whoever is signed in. A save carries the revision it was made from: 409 when the study was changed elsewhere |
| `POST studies/ID/compute` · `GET jobs/ID` · `POST jobs/ID/cancel` | one wave: started, followed, stopped |
| `GET info` · `POST structure` | is the HAPS ready; a molecule by its name, from PubChem |
| `GET guides` · `POST guides` · `DELETE guides/ID` | guided paths of the first workshop: read by members, published by administrators |
| `GET admin/users` · `POST admin/users` · `PATCH admin/users/ID` · `DELETE admin/users/ID` · `GET admin/jobs` | administrators only |
| `asymille/catalogue` · `asymille/projects…` · `asymille/model/…` · `asymille/fit` · `asymille/fit/global` · `asymille/fit/compare` · `asymille/analyse` · `asymille/figure` | Asymille: the projects of whoever is signed in, fits, operations on a curve, a figure as a file. Listed in `asymille/web/api.py` |
| `GET health` | for whatever watches the service |

What is sent is validated by Pydantic models that refuse any field they do not describe (`app/schemas.py`).

## The database

SQLite by default (`backend/data/ondelette.db`), PostgreSQL with `ONDELETTE_DATABASE_URL=postgresql+psycopg://…` and `uv sync --extra postgres`. The schema belongs to the migrations (`migrations/`, Alembic): `app/models.py` describes it, `uv run alembic revision --autogenerate -m "…"` writes the next migration, `uv run alembic upgrade head` applies it. The tests create their database with the migrations, so a migration that does not match the models fails them.

```
users ─┬─ sessions          where they are signed in
       ├─ studies ─┬─ run_results     what BigDFT gave for a calculation of that study, by its identity
       │           └─ jobs            the waves sent to the HAPS for it
       └─ guides            guided paths an administrator published
login_attempts              failed sign-ins, to slow down guessing
```

A study is kept as the page writes it (`serialize` in `workshop/js/model.js`): its structure, its steps, what was decided. Its results are not in it: they belong to calculations, by their identity, and come back with the study when it is opened. `python -m app.seed` reads its two demonstration studies from `app/seed_data/studies.json`, which the model of the page writes (`node tools/build_seed.js`); `tools/check_workshop.js` fails when that file is no longer what the model writes.

Back up the database and `work/` together: the first holds the studies and the results shown, the second the runs they were read from, with the wavefunctions later steps start from.

## In production

- `ONDELETTE_ENV=production` and `ONDELETTE_PUBLIC_URL=https://…` (required; the server refuses to start without). Cookies are then `Secure`, HSTS is sent, `/api/docs` is closed, and only that origin may change anything.
- Put a reverse proxy in front for HTTPS and leave the server on `127.0.0.1`; `ONDELETTE_FORWARDED_ALLOW_IPS` names the proxy so that addresses in the logs and in the sign-in limit are the visitors'.
- **One process.** The server follows the waves it started (and finds them again after a restart, by their status files). Several workers would each follow their own; this is not built for that.
- `ONDELETTE_REGISTRATION=closed` unless the HAPS account is meant for anyone who finds the page. Leave `ONDELETTE_DEMO_EMAIL` empty when seeding.
- The bridge keeps the HAPS credentials (`./bridge.sh credentials.env`); they are in no setting of this server, and the runner's environment holds neither them nor the address of the database.

### What the bridge is, and what it depends on

The bridge is the user side of a HAPS: it logs in to ebservice, submits a job to a published application, moves its files through ebuffer. `haps_bridge/` is the PyBigDFT pack's bridge, copied here unchanged, and it runs with this directory's environment. It depends on three things, none of which is a path on this machine:

- **the addresses of ebservice and ebuffer**, and **an account** on them: `haps.toml`, or the `HAPS_*` variables of the credentials file;
- **the two applications as they are published**: their names, mime types and instance (`[application]` of `haps.toml`), and the publisher's email (`[maintainer]`);
- **what the runtime accepts as input**, which `haps_bridge/inputs.py` states and the runtime holds a copy of.

So the HAPS service and the pack can be renamed, moved, or on another machine: `bridge.sh` takes no directory. (Until 2026-11-20 it started the pack's bridge from the pack's directory, and broke each time that directory moved; a first argument that is a directory is now ignored, with a note.)

`haps.toml` is this directory's own: the settings of the pack's bridge with the workshop's port (8791, so that the pack's bridge keeps 8790 and its sandbox), its working directory (`work/`) and a 10 s wait, after which `serve.py` follows the job itself and can stop it. The credentials file is the one the pack's bridge takes (its `haps_remote.env.example` lists the variables); the bridge submits with the **user** account, `HAPS_USER_USERNAME` and `HAPS_USER_PASSWORD`, and `bridge.sh` warns when the file names none. Nothing is published by `bridge.sh` and nothing computes in it.

When the pack changes its bridge (a new rule on what a run may receive, a new tool), the copy is taken again:

```bash
./update_from_pack.sh /path/to/Pack_pybigdft            # says what differs
./update_from_pack.sh /path/to/Pack_pybigdft --apply    # copies; then uv sync if the bridge needs a new library
```

Check the whole chain, from the model of the page to BigDFT and back (it computes: 18 runs, a few minutes). It signs in as a browser would, with an account of the server, saves the example as a study of that account, computes it, and reads it back:

```bash
ONDELETTE_EMAIL=demo@example.org ONDELETTE_PASSWORD=… node tools/check_live.js http://127.0.0.1:8766
```

Where no HAPS is at hand, everything around the calculation can still be checked: `tests/replay_runner.py` stands in for `runner.py` and answers each run with the recorded log of that name (`examples/water-ionisation/runs`), read by the same reader. Started with `ONDELETTE_RUNNER=tests/replay_runner.py` in front of a bridge that only says it is ready, the server passes `check_live.js`: page, `live.js`, API, what the server keeps. It replays; it computes nothing, and is never the runner of a server people use.

## What happens when a step is computed

1. The page saves the study, then decides what the wave is, as it does on recorded results: every run that waits for nothing (`workshop/js/model.js`). It sends the study as **data** — the structure and the calls of the registry of steps, the same list its script is written from — with the names of those runs and the identity of the calculation behind each (`workshop/js/live.js`).
2. The server (`app/compute.py`) checks that the study is the caller's, that the bridge is ready and works in the same directory, and starts `runner.py` for that wave in `work/u<user>/s<study>/`.
3. `runner.py` rebuilds the study with `for_pybigdft_pack/study` and prepares the runs asked for. `SystemCalculator(dry_run=True)` calls `bigdft_bin/bigdft-tool`, which asks the bridge for a dry run (`haps_dryrun`): BigDFT's own input check, a few seconds. A refused input stops there, with BigDFT's message.
4. Each run that passed is sent with `haps_bigdft` and followed with `haps_result` until it ends. The files BigDFT wrote come back into `work/u<user>/s<study>/runs/`.
5. The log is read as `tools/build_library.py` reads the recorded ones (`read_run`): the page receives a result of the same shape as an entry of its library, and shows it with the same views.
6. The server records each result in the database, for that study, under the identity of its calculation, whether or not a page is still there to ask (a wave is followed to its end even when the page was closed; a page opened meanwhile takes it up).
7. The page hands the results to its model under the same identities, and asks again: what was waiting for a relaxed geometry or for wavefunctions is now ready. That is the next wave.

## What is kept, and when it is computed again

`work/u<user>/s<study>/` holds the runs of a study: `runs/NAME.yaml`, `runs/log-NAME.yaml`, the relaxed geometries, the wavefunctions that are read by another step, `runs/manifest.json`, and `study.py`, the script of the page as it stood at the last wave (kept for the reader; never executed). The directory is named by ids the server gives, never by what a study is called. A run computed stays computed: the results come back with the study when it is opened, from any browser, and a run asked again is answered from what the directory holds. Deleting a study, or an account, removes its directory.

A result is kept only while it still answers the study. `runner.py` records, for each run it sends, a digest of what it is computed from: its input, the structure or the run whose relaxed geometry it starts from, the run whose wavefunctions it reads. Before a wave, any run whose digest changed is dropped, with what was computed from it.

A run that another step reads the wavefunctions of must have written them. If it was computed before anything read it, it is computed once more, the same calculation, writing them.

## What a failure looks like

| On the page | Meaning | What to do |
|---|---|---|
| "refused by BigDFT's dry run: …" | BigDFT's input parser refused the input; nothing was computed | change the setting the message names |
| "BigDFT stopped (exit n): …" | the calculation started and ended in error | read `work/u<user>/s<study>/runs/log-NAME.yaml` |
| "stopped by the HAPS…" | longer than `limits.max_timeout_s` of `config/haps.yaml` | `serve.py --timeout`, within what the runtime allows |
| "the HAPS did not run it…", "no answer after…" | the service or the runtime, not the input | look at the runtime; then "Try again" |
| "this HAPS does not take wavefunctions…" | the step starts from the wavefunctions of another, and the HAPS would drop them | an older HAPS: update it, or apply `docs/patches/haps-wavefunctions.patch` to it |
| "The HAPS is not ready" (top of the page) | the bridge does not answer, or an application is not published | start `bridge.sh`; ask the operator of the HAPS. The reason is shown to administrators only: it names addresses of the server |
| "this study is already computing" | a wave of it is on its way, from this page or another | wait for it, or stop it |
| "… of your studies are computing already" | `ONDELETTE_MAX_JOBS_PER_USER` | wait for one to end |

A run that failed is not sent again by itself: "Try again" on the step does it.

## Files

| File | Role |
|---|---|
| `serve.py` | Reads the settings, says what it found, starts the application |
| `app/main.py` | The application: the two pages and their scripts, the API, the headers of every answer |
| `app/config.py`, `.env.example` | The settings (`ONDELETTE_*`), and what each one does |
| `app/models.py`, `app/db.py`, `migrations/`, `alembic.ini` | The database: its tables, its sessions, its migrations |
| `app/schemas.py`, `app/errors.py` | What the API accepts and answers; the one shape of its errors |
| `app/security.py`, `app/deps.py` | Passwords and tokens; who is signed in, with which role, and that a request is the page's own |
| `app/routers/` | The addresses: `auth`, `account`, `studies` (with the waves), `guides`, `admin` |
| `app/asymille.py` | Plugs Asymille into the accounts, the sessions and the database of this server |
| `asymille/`, `../asymille/` | Copied unchanged from the Asymille repository: its engine and API (numpy, scipy, lmfit, matplotlib), and its page |
| `update_from_asymille.sh` | Compares those copies with Asymille's, and takes them again |
| `app/compute.py` | Between a study and the HAPS: start a wave in the study's directory, follow it, record its results |
| `app/seed.py`, `app/seed_data/` | The first administrator, the demonstration account and its studies |
| `tests/` | The API tested on a database made by the migrations, with stand-ins for the runner (`fake_runner.py`, `replay_runner.py`) |
| `runner.py` | One wave: rebuild the study from data, drop stale results, dry-run, send, read the logs |
| `haps.py` | The client of the bridge: the tools it calls and how their answers are read |
| `bridge.sh`, `haps.toml` | Starts the bridge on the workshop's port and directory; its settings |
| `haps_bridge/` | Copied unchanged from the PyBigDFT pack: the MCP bridge to the HAPS (`haps_info`, `haps_dryrun`, `haps_bigdft`, `haps_result`, `haps_cancel`) |
| `update_from_pack.sh` | Compares the copies below and above with the pack's, and takes them again |
| `bigdft_bin/`, `bigdft_refused.sh`, `haps_dryrun_client.py` | Copied unchanged from the PyBigDFT pack (`tools/`): the stand-in `bigdft-tool` that sends PyBigDFT's dry run to the bridge, and `bigdft`, `abscalc`, `frequencies`, which refuse |
| `xyz_downloader.py` | Copied unchanged from the pack too: asks PubChem for the 3D structure of a molecule and writes it in BigDFT's `.xyz`, unit included. `/api/structure` calls it and hands the text to the page; the files stay in `work/.structures/` |
| `pyproject.toml`, `uv.lock` | The environment: FastAPI, SQLAlchemy, Alembic, Pydantic and Argon2 for the server; lmfit, numpy, scipy and matplotlib for Asymille; PyBigDFT without BigDFT, the MCP client and server, `haps-client` for the bridge, PyYAML, and `ase` and `requests` for the downloader |
| `data/`, `work/`, `.env` | The SQLite database, the runs of the studies, the settings (none in git) |

## Asymille

Asymille (curve fitting, analysis, figures for publication) is a third page of the application, at `/asymille/`, reached from the account menu of the two workshops. It needs no HAPS: its calculations run in this server (lmfit and scipy for the fits and the operations, matplotlib for PDF, EPS and TIFF).

It is developed in its own repository, where its engine is tested against NIST certified values and its page in Node. Here it is a copy:

```bash
./update_from_asymille.sh /path/to/Asymille           # what differs
./update_from_asymille.sh /path/to/Asymille --apply   # take it
uv run pytest tests/test_asymille.py                  # the copy and this server still agree
```

Asymille knows nothing of this server. `app/asymille.py` gives it what it asks for (the declarative base, who is signed in, a database session, how an error is raised), and so:

| | |
|---|---|
| Accounts | The page loads this server's own `shared/api.js` and `shared/account.js`: the same sign-in, the same profile menu. Its API answers 401 to nobody |
| Guards | Its router is included in the `/api` router: every address passes `csrf_guard` |
| Isolation | Its one table, `asymille_projects`, carries `owner_id` (`ondelete="CASCADE"`) and is read with it in the query itself: a project of someone else answers 404. Deleting an account deletes its projects |
| Database | The table is defined on `models.Base` and created by the migration `0002` |
| What it accepts | A project is validated by a model that refuses unknown fields. An expression typed by a person (a custom fit function, a tie between parameters) is walked as a syntax tree, never evaluated: `test_asymille.py` sends `__import__('os')` through it |
| Errors | Its refusals leave as `AppError`, in the one error shape |

A project travels whole at each save, its data included: `ONDELETTE_MAX_BODY_BYTES` (4 MB) bounds it, to about 200 000 numbers. `app/asymille.py` tells Asymille that limit, and the page says how much room a project has left: a series of many files is what fills one. A fit is stopped after 30 s and four calculations run at a time, all accounts together (`asymille.web.Limits` in `app/asymille.py`). These calculations run in the threads of the one process: a server used by many for long fits would need them moved out, which is not done.

Checked here: `tests/test_asymille.py` (7 tests: nobody signed in, isolation between two accounts, deletion with the account, the guards, a fit, an operation and a figure, the page and its scripts, and a project written by the page's own model in Node). The page was also driven in a browser through this server, on a database and a port of its own: signing up at the gate, the example, a fit, the account menu.

## Structures

A study can hold several structures (see `workshop/README.md`). Three of their sources need nothing from the server: the built-in systems, an atom, a file read in the page. The fourth does: a molecule by its name is one request from this server to PubChem, with the name typed and nothing else. The name is checked before it is put in an address (letters, digits, spaces and a few signs).

The server is sent every structure with the study, as data. A result is kept only while the structure it was computed on is the one the study names now.

## Limits

- One machine for the server and the bridge: they share a directory. One process for the server.
- One account on the HAPS, the bridge's, for every user of the application: who computed what is known here (`jobs`), not on the HAPS.
- Computing through this server was checked here with the recorded runs replayed in place of the HAPS (see above), not on a HAPS: `runner.py` and the bridge are unchanged, and `check_live.js` is the check to run on a real one.
- Dry runs go one after the other, about five seconds each through the HAPS: PyBigDFT reads BigDFT's verdict from a directory-wide `debug/`, so two at once could not be told apart.
- Results are read from the log. Orbitals and densities as volumes are not fetched.
- A wave can be stopped; the HAPS is then asked to stop its jobs. A job the bridge has not named yet (its first ten seconds) cannot be.
- Systems other than water go the same way, but only water was computed through this chain.
