## 1. Data (critical path for Bahrain)

- [x] 1.1 Jolpica client: calendar with session times, qualifying, results, driver and constructor standings, with caching and polite rate limiting
- [x] 1.2 f1db loader: pin a release, compute top-three and win rates by grid slot for 2014 to 2025, and safety car history per circuit
- [x] 1.3 OpenF1 race-control and weather fetch for a session (reusing the existing client)

## 2. Prediction (critical path for Bahrain)

- [x] 2.1 Snapshot builder: per-driver fact lines and race-level lines, computed by code, with a test that no race-day data can enter
- [x] 2.2 Question set: 22 podium `noul`s, the winner `choice` over the grid, the chaos `score` with the rubric as criteria, in one request
- [x] 2.3 `ui predict --season --round`: build the snapshot, call Jev once, save the record (request, response, model version, provider, cost, inputs, timestamp, request hash) to `predictions/`
- [x] 2.4 Dry run on 2026 rounds 1 to 15 as labelled backtests to test the pipeline, and measure cost and latency
- [ ] 2.5 Teammate head-to-head facts (qualifying and race, this season)
- [ ] 2.6 Power unit supplier facts from f1db entrant data, with the supplier's season results
- [ ] 2.7 Aero proxy facts from OpenF1 qualifying laps: speed-trap ranking and sector ranks
- [ ] 2.8 Circuit trait tags and similar-track form this season
- [ ] 2.9 Rerun the backtest with the richer snapshot and compare podium Brier before and after

## 3. Scoring

- [ ] 3.1 Chaos rubric scorer from OpenF1 race control, weather, and the classification, with tests on known races (a red flag race, a calm race)
- [ ] 3.2 `ui score --season --round`: podium Brier, winner log loss and hit, chaos error, consistency checks, late-prediction exclusion
- [ ] 3.3 Grid-slot and form baselines scored identically
- [ ] 3.4 Season leaderboard and reliability table over live races only

## 4. Automation

- [x] 4.1 Pre-race workflow (hourly, calendar-driven): predict when qualifying data is in, give up one hour before the start, commit
- [ ] 4.2 Post-race workflow (hourly, calendar-driven): score when results are in, commit
- [ ] 4.3 `OPENROUTER_API_KEY` as a repository secret; verify the built site contains no key

## 5. Site

- [ ] 5.1 Race page: before (calls, timestamp, commit link) and after (results, scorecard, baselines)
- [ ] 5.2 Season page: leaderboard, calibration, race list with statuses
- [ ] 5.3 Backtest page with the "may have seen these results" label
- [ ] 5.4 360px, contrast, and branding pass
- [ ] 5.5 Vercel project linked to the repository, deploying on push

## 6. First live race

- [ ] 6.1 Bahrain: prediction committed before 07:00 UTC on 4 October 2026
- [ ] 6.2 Bahrain: scored and on the leaderboard by 5 October
