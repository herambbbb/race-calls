## Context

The repository already has an OpenF1 client, a Jev client on OpenRouter (`typesafe/jev-1.13`, with patient retries and a request cache), scoring metrics, and a Vite and React site with the project's visual language. This change adds a weekly prediction loop on top: one Jev request after qualifying, one scoring pass after the race, and a static site that shows both.

Timeline: 8 races remain in 2026. The first live prediction is Bahrain (at Sepang): qualifying ends about 09:00 UTC on 3 October, lights out is 07:00 UTC on 4 October.

## Goals / Non-Goals

**Goals:** a prediction published before every remaining race, scored the next day, with an honest season record; minimal moving parts; cost measured per call.

**Non-Goals:** visitor predictions, live in-race updates, betting, a custom domain (Vercel's address is used until one is bought).

## Decisions

### 1. One snapshot, one request, after qualifying
The prediction is made once, after qualifying, from a snapshot of facts. Earlier (before qualifying) would drop the strongest input, the grid; later (Sunday) risks missing the start. All 22 drivers' podium questions, the winner choice, and the chaos score go in one request (24 questions), so a race costs one call.

### 2. The snapshot is facts as sentences, computed by code
Per driver, one line: grid slot (and any known penalty), gap to pole, team, championship position and points, finishes in the last three races (including retirements), and the historical top-three rate from that grid slot. Then race-level lines: circuit, laps, whether it is a sprint weekend and the sprint result, recent safety car frequency at this circuit (f1db and OpenF1), and the weather at qualifying (OpenF1). Jev never does arithmetic.

### 2b. Richer facts (added 2026-09-28, after the first backtest)
The first backtest put 56 to 100% of the winner `choice` on the pole-sitter in all 14 races, including the 5 it lost, so the snapshot gains facts beyond the grid, each computed by code and written as a sentence:
- Teammate head-to-head this season, in qualifying and in the race (Jolpica).
- Power unit supplier per car and that supplier's results this season (f1db entrant data, not typed by hand).
- An aero proxy from qualifying: speed-trap ranking (drag and power) and rank in each sector (cornering), from OpenF1 qualifying laps. No public aero data exists; the snapshot says what the proxy is.
- Similar-track form: each circuit is tagged with traits (high altitude, long straights, street, high downforce); each driver's results this season at circuits sharing a trait with this one. The tags are this project's judgement, stored in one reviewed file and labelled as such.
The effect is measured, not assumed: the backtest is rerun and podium Brier compared before and after (contaminated races, so only as a plumbing check).

### 3. The chaos rubric (shared by the question and the scorer)
```
0 calm       no safety car or VSC, at most 2 retirements, winner led most laps
1 lively     a VSC, or 3 to 4 retirements, or 3+ lead changes
2 eventful   one full safety car, or a first-lap incident that brought out a yellow or VSC
3 chaotic    two or more safety cars, or 5+ retirements
4 bedlam     a red flag, or wet running, or a podium with none of the top six starters
```
The actual level is the highest row whose condition holds, computed from OpenF1 race-control messages (SAFETY CAR DEPLOYED, VIRTUAL SAFETY CAR DEPLOYED, RED FLAG, track wetness from weather) and the Jolpica classification. Jev's `score` criteria are exactly these five lines.

### 4. Where the data comes from
| Need | Source | Why |
|---|---|---|
| Calendar, qualifying, grid, results, standings | Jolpica (Ergast-compatible) | free, stable, fast to update after sessions |
| Grid-slot base rates, circuit history | f1db releases (pinned version) | complete history in one file, no API limits |
| Race control, weather | OpenF1 | free 30 minutes after a session |
The grid-slot rates use 2014 to 2025 (the current points and grid format). 2026 is a new regulation era, so the rates are a prior, and the site says so.

### 5. Proof that predictions came first
Each prediction is written to `predictions/2026/<round>-<slug>.json` and committed by the workflow before the start. The race page links to that commit, whose time GitHub shows publicly. The record also carries its own timestamp and the SHA-256 of the request body. A prediction that lands after the start is marked late and never scored.

### 6. Scheduling that tolerates odd timetables
Weekend days vary (Las Vegas races on Saturday night local time, Sunday 04:00 UTC). So both workflows run hourly every day and decide from the calendar what to do:
- pre-race: if a race's qualifying ended, results are on Jolpica, no prediction exists, and the start is more than one hour away, predict; if one hour before the start there is still no data, write "no prediction".
- post-race: if a race ended more than three hours ago and is not scored, and results are on Jolpica, score it.
Each run exits in seconds when there is nothing to do. The Vercel GitHub integration deploys on every push to `master`.

### 7. Scoring and the leaderboard
Per race: podium Brier (mean over drivers), winner log loss and hit, chaos absolute error. Jev's podium is the three drivers with the highest podium probability (no extra question); it is scored as the number of correct podium finishers, 0 to 3, next to the grid baseline's top three. Season: the same metrics accumulated over live races, plus a reliability table of podium probabilities (10 bins, low-sample under 10). Baselines scored identically: grid-slot rates, and a form baseline (podium rate over the last three races, smoothed). The raw podium answers are scored as given; the page also shows how far they sum from three and lists drivers whose win probability exceeds their podium probability.

### 8. Backtests are for plumbing, not for bragging
Races before the model's date (`20260917`) are run once to test the pipeline end to end (2026 rounds 1 to 15, about 15 requests), stored under `predictions/backtest/`, and shown on a separate page labelled "the model may have seen these results".

### 9. The site
The existing `web/` app gets two routes: `/` (the season) and `/race/:round`. The old stewards pages stay in the code but are not linked. It reads the committed JSON at build time, so the deployed site is plain static files.

## Risks / Trade-offs

- [Jolpica lags after qualifying] → hourly retries until one hour before the start, then "no prediction".
- [A grid penalty lands after the prediction] → the snapshot records whether the grid was provisional; the page shows it.
- [Jev memorised past results] → live-only leaderboard; backtests labelled.
- [OpenRouter changes the alpha endpoint] → the transport is one setting; the gateway transport remains.
- [Eight races is a tiny sample] → the site states the count everywhere and shows intervals, not just point scores; the tracker continues into 2027.

## Open Questions

- Should the snapshot include practice long-run pace from OpenF1? It helps, but it is noisy and adds work; start without it and add it if Jev's scores lag the baselines.
- Commit to `master` directly from CI, or to a `predictions` branch merged automatically? Direct commits are simpler; a branch keeps history tidy.
