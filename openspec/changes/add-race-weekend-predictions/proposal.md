## Why

The penalty-odds work showed where Jev is strong and where it is not. Asked to predict what the stewards will decide, it barely matches a historical base rate, because the target is a noisy human process. What it does well is a small set of typed judgements made from a clear snapshot of facts, with probabilities that can be checked.

A race weekend offers exactly that, once a week, with an objective answer 24 hours later: after qualifying, the grid and the season so far are known, and on Sunday the results are official. So the product becomes a public prediction tracker: before every race, Jev makes three kinds of call, they are published with a timestamp, and after the race they are scored against the results and a season leaderboard is updated.

It is also the honest experiment the backtest could not be. The model reports itself as `typesafe/jev-1.13-20260917`, and it may have seen 2023 to 2025 race results in training, so past races can flatter it. Races after 17 September 2026 cannot. Eight remain this season, starting with Bahrain (held at Sepang) on 4 October.

## What Changes

- New **pre-race job**: after qualifying, fetch the grid, qualifying times, standings, and recent form (Jolpica), plus history (f1db) and session data (OpenF1); build a plain-text snapshot; send one Jev request with a podium `noul` per driver, a winner `choice` over the grid, and a chaos `score`; save the response, the model version, the inputs, and the time; commit the prediction to git before lights out.
- New **post-race job**: fetch the official results and race-control messages, compute the actual chaos level from a fixed rubric, score the saved calls, and update the season leaderboard.
- New **baselines** scored on the same races: a grid-position baseline (historical podium and win rates by starting position) and a recent-form baseline, so Jev's numbers mean something.
- New **static site**: a season page (leaderboard, calibration so far, every race), and one page per race (Jev's calls before the race, then the results and the scorecard), deployed on Vercel.
- The **stewards products are parked**: `add-penalty-odds` stays as is (its pipeline, Jev client, cache, and metrics are reused here), and `add-be-the-steward` is paused, not built.

Out of scope: visitor predictions, accounts, live timing during the race, betting odds, and any commercial use.

## Capabilities

### New Capabilities

- `race-predictions`: The pre-race snapshot, the three typed Jev questions, and a timestamped, immutable record of every prediction.
- `prediction-scoring`: Scoring saved predictions against official results, the chaos rubric, the baselines, and the season leaderboard with calibration.
- `predictions-site`: The static season and race pages, and the scheduled jobs that build and deploy them.

### Modified Capabilities

(none; the stewards capabilities are parked, not changed)

## Impact

- Pipeline: a Jolpica client, an f1db loader, a snapshot builder, and `ui predict` / `ui score` commands, reusing the Jev client (OpenRouter transport, retries, cache), the OpenF1 client, and `metrics.py`.
- Automation: two scheduled GitHub Actions workflows holding `OPENROUTER_API_KEY` as a repository secret; the key is never in browser code or in the built site.
- Hosting: the static site on Vercel at a vercel.app address until a domain is bought.
- Cost: one Jev request per race, about $0.00005; the rest of the season is under $0.001. Start small, and record the cost of every call.
