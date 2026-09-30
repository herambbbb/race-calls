# Development

How to set up Race Calls on your own machine, run every check, run the site, and regenerate the files that are committed but produced by code.

- [Prerequisites](#prerequisites)
- [Setup](#setup)
- [Checks](#checks)
- [Running the site locally](#running-the-site-locally)
- [The environment file and API keys](#the-environment-file-and-api-keys)
- [The offline test harness](#the-offline-test-harness)
- [Regenerating committed artifacts](#regenerating-committed-artifacts)
- [Repository conventions](#repository-conventions)
- [Troubleshooting](#troubleshooting)

The repository has two independent halves that meet only through committed JSON files: the Python pipeline in `pipeline/` writes `predictions/` and `scores/`, and the React site in `web/` reads them at build time. You can work on either half without the other. For how they fit together see [architecture.md](architecture.md); for the pipeline's commands see [pipeline.md](pipeline.md); for the site see [site.md](site.md).

## Prerequisites

| Tool | Version | Used for |
| --- | --- | --- |
| Python | 3.12 or later (`requires-python = ">=3.12"` in `pipeline/pyproject.toml`) | the pipeline |
| [uv](https://docs.astral.sh/uv/) | any recent release | installing and running the pipeline; `pipeline/uv.lock` pins every dependency |
| Node.js | a current release | the site |
| [pnpm](https://pnpm.io/) | any recent release | installing and running the site; `web/pnpm-lock.yaml` pins every dependency |

uv can fetch a matching Python for you, so you do not need to install 3.12 separately. The scheduled workflows use the same pair: `astral-sh/setup-uv` with Python 3.12 and `uv sync --frozen` (see [automation.md](automation.md)).

Behind a TLS-intercepting proxy (a company network that re-signs HTTPS traffic), uv will not trust the proxy's certificate by default. Add `--system-certs` to uv commands, for example `uv sync --system-certs`, or set `UV_SYSTEM_CERTS=1` once in your shell. This makes uv load certificates from the operating system's store, where the proxy's root certificate normally lives. The pipeline's own HTTP client already does the same at run time: `pipeline/src/race_calls/http.py` builds every `httpx` client with a `truststore` SSL context, so no extra setting is needed there.

## Setup

Pipeline:

```sh
cd pipeline
uv sync            # add --system-certs behind a TLS-intercepting proxy
uv run rc --help   # the command line tool, declared as [project.scripts] rc
```

`uv sync` creates `pipeline/.venv` and installs both the runtime dependencies (httpx, pydantic, pydantic-settings, truststore, typer) and the `dev` dependency group (pytest, respx, ruff, mypy).

Site:

```sh
cd web
pnpm install
```

## Checks

Run all of these before committing. They are what "done" means for a change; there is no CI workflow that runs them for you (the two workflows in `.github/workflows/` only predict and score).

Pipeline, from `pipeline/`:

| Command | What it checks |
| --- | --- |
| `uv run pytest` | the test suite in `pipeline/tests/`, fully offline (see [below](#the-offline-test-harness)) |
| `uv run ruff check` | lint rules E, F, I, B, UP, SIM, and RUF, line length 100 |
| `uv run ruff format --check` | formatting, without changing files (drop `--check` to apply it) |
| `uv run mypy` | strict type checking of the `race_calls` package, with the pydantic plugin |

Site, from `web/`:

| Command | What it runs | What it checks |
| --- | --- | --- |
| `pnpm typecheck` | `tsc -b` | strict TypeScript, including `noUncheckedIndexedAccess` and `exactOptionalPropertyTypes` |
| `pnpm lint` | `oxlint` | lint |
| `pnpm test` | `vitest run` | unit and rendering tests under `src/`, `plugins/`, and `scripts/` |
| `pnpm build` | `tsc -b && vite build && node scripts/check-no-secrets.mjs` | type checks again, builds `web/dist/`, then runs the key-free build check |

The last step of `pnpm build` is worth knowing about. `scripts/check-no-secrets.mjs` collects the value of every variable whose name ends in `_API_KEY`, both from the environment and from the repository root `.env`, and searches every file in `dist/` for those values and for anything shaped like an OpenRouter key. On a hit it prints only the file name and the variable's name, never the value, and fails the build. A static site ships every byte of its bundle to every visitor, so this is the last line of defence against a key reaching the public. See [site.md](site.md#the-key-free-build-check).

## Running the site locally

```sh
cd web
pnpm dev
```

Vite serves the site on <http://localhost:5173>. If that port is taken (for example by another project), pick another one: `pnpm dev --port 5174`.

The dev server watches `predictions/` and `scores/` at the repository root. When a record is added, changed, or deleted there, it rebuilds the data modules and reloads the page, so you can run the pipeline in one terminal and watch the site update in another. Two extra routes exist only in development: `/preview` and `/preview/:state`, a gallery of every page state (upcoming, called, scored, late, no prediction, failed, backtest) built from fixtures, for design review. They are left out of the production build.

`pnpm preview` serves the built `dist/` folder, which is the closest thing to the real static site.

## The environment file and API keys

The pipeline reads its settings from environment variables and from a `.env` file at the repository root (`Settings` in `pipeline/src/race_calls/settings.py`, built on pydantic-settings). A variable set in the environment wins over the same name in `.env`.

| Variable | Default | Meaning |
| --- | --- | --- |
| `TYPESAFE_API_KEY` | none | the key for TypeSafe's own API, the default way to reach Jev |
| `JEV_TRANSPORT` | `typesafe` | which route to Jev to use: `typesafe`, `openrouter`, or `gateway` |
| `OPENROUTER_API_KEY` | none | optional; only read when `JEV_TRANSPORT=openrouter` |
| `AI_GATEWAY_API_KEY` | none | optional; only read when `JEV_TRANSPORT=gateway` |
| `DATA_DIR` | `data/` | local cache of API responses (gitignored) |
| `PREDICTIONS_DIR` | `predictions/` | where prediction records are written (committed) |
| `SCORES_DIR` | `scores/` | where score records are written (committed) |

A minimal `.env` for making real calls holds one line, `TYPESAFE_API_KEY=` followed by your key. `.env.example` is the committed template to copy from. OpenRouter (and the AI gateway) are fallback transports: they reach the same model through a different URL, model id, and key, and every record notes which provider served it. How the transports differ is covered in [jev.md](jev.md).

Rules that keep keys safe:

- **`.env` is never committed.** `.gitignore` ignores `.env` and `.env.*`, with `.env.example` as the one exception. The scheduled workflows get `TYPESAFE_API_KEY` from a GitHub Actions secret instead.
- **Keys are `SecretStr`.** Every key field in `Settings` is a pydantic `SecretStr`, so printing the settings object, logging it, or seeing it in a traceback shows `**********` instead of the value (`tests/test_settings.py` checks this). The raw value is read in exactly one place, `jev.py`, to build the `Authorization` header, and if an error response happens to echo the key back, that text is replaced with `[redacted]` before it goes into an error message.
- **Never print a key to check it.** To confirm a key is present, test for it (`bool(key and key.get_secret_value())`) rather than displaying it.
- **The build is scanned.** See [Checks](#checks) above.

Nothing else needs a key: Jolpica, OpenF1, and f1db are public.

## The offline test harness

`pipeline/tests/conftest.py` defines one fixture with `autouse=True`, so it wraps every test without being asked for. It does three things:

1. **Blocks the network.** It replaces `socket.socket.connect`, `socket.socket.connect_ex`, and `socket.create_connection` with a function that raises `NetworkBlocked("tests must not use the network; mock it with respx")`. HTTP calls in tests are mocked with [respx](https://lundberg.github.io/respx/), which intercepts `httpx` before a socket is ever opened, so mocks still work while a forgotten real call fails loudly.
2. **Blanks every key.** It sets `AI_GATEWAY_API_KEY`, `TYPESAFE_API_KEY`, and `OPENROUTER_API_KEY` to empty strings, so a test can never spend money on a real key, even if your `.env` holds one.
3. **Points the data folders at a temporary directory.** `DATA_DIR`, `PREDICTIONS_DIR`, and `SCORES_DIR` go to pytest's `tmp_path`, so a test can never overwrite a committed prediction or score.

Because `get_settings()` is cached with `lru_cache`, the fixture clears that cache before and after each test so the new environment is actually read. Why go this far: the committed records are the project's evidence, timestamped by Git, and a test run that silently rewrote one would destroy exactly what the project exists to protect.

Test fixtures (recorded API responses) live in `pipeline/tests/fixtures/`.

The site's tests are offline by construction: they render components with `react-dom/server` from the committed example records in `contracts/` and from inline fixtures, and never start a browser or a server.

## Regenerating committed artifacts

Some committed files are produced by code. Regenerate them when their source changes, and commit the result together with the change that caused it. Unless noted, run these from `pipeline/`.

| File(s) | Command | When |
| --- | --- | --- |
| `contracts/prediction-record.schema.json`, `contracts/score-record.schema.json` | `uv run python -m race_calls.contracts` | after changing `PredictionRecord` or `ScoreRecord` in `models.py` |
| `contracts/score-record.example.json` | `uv run python tests/test_score.py` | after changing the score model or the example race in that test |
| `priors/priors.json` | `uv run python -m race_calls.priors` (or `uv run rc priors`) | when moving to a new pinned f1db release |
| `priors/engines-2026.json` | `uv run python -m race_calls.facts.engines` | when a team changes engine supplier, or on a new f1db release |
| `docs/images/fig-*.png` | from the repository root: `uv run --no-project --with matplotlib python docs/figures/make_figures.py` | after new races are scored |
| `web/src/data/tracks.ts` | from `web/`: `node scripts/build-tracks.mjs [path/to/f1-circuits.geojson]` | when the calendar gains a circuit |

Notes:

- The schema files are the contract between the two halves. The site's TypeScript types in `web/src/data/types.ts` and `scores.ts` mirror them by hand, and `web/src/data/scores.contract.test.ts` checks the site against the committed score example, so after regenerating, run the web tests too. Field-by-field descriptions are in [data-formats.md](data-formats.md).
- `priors` and `facts.engines` read the pinned f1db release from the local cache under `DATA_DIR`, downloading and verifying it first if it is not there. These two, and `build-tracks.mjs` when given no path, are the only regeneration steps that use the network.
- `make_figures.py` reads only `predictions/` and `scores/` and needs nothing from the pipeline, which is why it runs with `--no-project` and pulls in matplotlib just for that run.
- `priors/circuit-traits.json` is written by hand: its tags are the project's own judgement (see `facts/tracks.py`).

## Repository conventions

- **No em dash or en dash characters, anywhere.** Not in code, comments, UI text, docs, or commit messages. Use a hyphen, or rephrase. A quick check before committing: `grep -rnE $'\u2013|\u2014' --exclude-dir=node_modules --exclude-dir=.git --exclude-dir=.venv --exclude-dir=dist --exclude-dir=data .` (zsh, or bash 4.2 or later; the `\u2013` and `\u2014` escapes stand for the two characters, so the command itself contains neither).
- **The project is Race Calls.** The racing series' name is a trademark, so it is never used as the project's name, in the site's name or logo, or in page titles (`useDocumentTitle` builds every title as "Page - Race Calls"). Team names are shown without the series name too (`teamName()` in `web/src/data/teams.ts` strips the series suffix from a constructor name, so the site shows just "RB"). Facts that Jev was given are shown verbatim and are the exception.
- **Commit identity.** Commits are authored as `herambbbb` with the GitHub noreply email (`73944580+herambbbb@users.noreply.github.com`), and carry no AI co-author trailers. The scheduled workflows commit as `github-actions[bot]`.
- **OpenSpec for changes.** Planned changes are written up before they are built, under `openspec/changes/<change>/` (a proposal, a design, tasks, and spec deltas), and archived under `openspec/changes/archive/` when done. Validate a change with `openspec validate <change> --strict`. For example, the site's current look is described in `openspec/changes/starry-night-theme-and-scroll/`.
- **Records are append-only evidence.** Never edit a committed file in `predictions/` by hand; its Git history is the proof of when the call was made. See [automation.md](automation.md).

## Troubleshooting

**TLS or certificate errors when installing** (`uv sync` fails with "invalid peer certificate" or "unable to get local issuer certificate"). You are probably behind a TLS-intercepting proxy. Use `uv sync --system-certs` or set `UV_SYSTEM_CERTS=1`. For pnpm, point Node at the proxy's root certificate with `NODE_EXTRA_CA_CERTS=/path/to/root.pem`. The pipeline's own requests already use the system store through `truststore`.

**`Port 5173 is in use`.** Another dev server is running. Stop it, or run `pnpm dev --port 5174`.

**OpenF1 answers 401 while a session is on track.** While any session is live, OpenF1 refuses every unauthenticated request, even for past sessions. The client raises `LiveSessionLockout` for this case (`pipeline/src/race_calls/openf1/client.py`); it is never retried and never cached. Nothing is wrong with your setup: wait until the session ends and run the command again.

**Jolpica returns empty tables** (no qualifying or results for a race that has just happened). The data is not published yet; Jolpica usually fills in a while after the session. The client never caches an empty table, so simply run again later. The post-race scorer treats this as "not published yet" and writes nothing, rather than scoring against a partial result.

**The site shows a race as "Called" but you have committed its score.** The score file did not pass the site's shape check (`isScoreRecord` in `web/src/data/scores.ts`) and was skipped; the browser console shows a `Skipping scores/...: not a score record this site can read` warning naming the file. Compare it with `contracts/score-record.example.json`.

**A test fails with `NetworkBlocked`.** The code under test made a real network call. Mock it with respx, or use a recorded response from `pipeline/tests/fixtures/`.
