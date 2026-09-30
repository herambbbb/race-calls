# Race Calls documentation

How the whole product works, from the facts gathered after qualifying to the scores on the leaderboard. Start with the [project README](../README.md) for the overview; these pages go deep.

| Page | What it covers |
|---|---|
| [Case study](case-study.md) | A five-minute read for reviewers: the problem, what was built, decisions and trade-offs, results, lessons, and skills |
| [Architecture](architecture.md) | The system on one page: components, data flow, a race weekend as a sequence, the repository layout, and the design principles with where each is enforced |
| [Pipeline](pipeline.md) | The data sources (Jolpica, OpenF1, f1db), caching and rate limits, the priors, the fact modules, the snapshot Jev sees, and the CLI |
| [Jev](jev.md) | The model: its three question types, the one request per race, a real request and response, transports, retries, and the contamination problem |
| [Scoring](scoring.md) | Every metric with its formula, how the actual chaos level is measured, the two baselines, what is never scored, calibration, and how much to trust the numbers |
| [Automation](automation.md) | The two hourly GitHub Actions jobs, the pre-race state machine, the proof that a call came first, and the race-weekend runbook |
| [Site](site.md) | Every page of the static site, with screenshots, and how data gets into the build |
| [Data formats](data-formats.md) | Every committed file: prediction records, score records, priors, and the contracts that keep the pipeline and the site in step |
| [Findings](findings.md) | What the 14 backtests show so far, race by race, with charts |
| [Development](development.md) | Setup, running every check, regenerating committed files, conventions, and troubleshooting |
| [UI brief](ui-brief.md) | The brief the site's redesign was built from |
| [Moodboard](moodboard.md) | The visual references behind the site's design |

The plan and its rationale live in OpenSpec: [`openspec/changes/add-race-weekend-predictions/`](../openspec/changes/add-race-weekend-predictions/) (the pipeline) and [`openspec/changes/starry-night-theme-and-scroll/`](../openspec/changes/starry-night-theme-and-scroll/) (the site's design).
