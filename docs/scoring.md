# Scoring: how a call is judged

- [When a race is scored](#when-a-race-is-scored)
- [The actual result](#the-actual-result)
- [The metrics](#the-metrics)
- [The actual chaos level](#the-actual-chaos-level)
- [The two baselines](#the-two-baselines)
- [Never scored](#never-scored)
- [Leaderboards and calibration](#leaderboards-and-calibration)
- [How much to trust the numbers](#how-much-to-trust-the-numbers)

Code: [`score.py`](../pipeline/src/race_calls/score.py) (metrics and baselines), [`chaos.py`](../pipeline/src/race_calls/chaos.py) (the actual chaos level), [`postrace.py`](../pipeline/src/race_calls/postrace.py) (when), [`metrics.py`](../pipeline/src/race_calls/metrics.py) (the scoring rules). The output format is in [data formats](data-formats.md).

## When a race is scored

A live race is due **three hours after its scheduled start**, if it has an on-time prediction and no score yet. The hourly post-race job ([automation](automation.md)) then waits until two things exist: the official classification on Jolpica and the race-control data on OpenF1 (free 30 minutes after a session ends). Until both are in, it reports "waiting" and tries again next hour. Each race is scored once; a rescore needs `rc score --force`.

## The actual result

From the Jolpica classification ([`score.outcome`](../pipeline/src/race_calls/score.py)):

- **winner**: the driver classified 1st;
- **podium**: the drivers classified 1st, 2nd, and 3rd, in that order;
- **finish**: every driver's classification text: `"1"` to `"22"`, `"R"` retired, `"D"` disqualified, `"N"` not classified, `"W"` withdrawn, `"F"` failed to qualify, `"E"` excluded.

## The metrics

Every side (Jev and both baselines) is scored the same way, on **the drivers in the prediction** (the grid at the time of the call). A driver who raced but was not in the call is listed in `details.unscored_finishers` and does not enter the podium score.

### Podium Brier (lower is better)

For each driver $i$ with podium probability $p_i$ and $y_i = 1$ if they finished in the top three, else $0$:

$$\text{Brier} = \frac{1}{N}\sum_{i=1}^{N}(p_i - y_i)^2$$

0 is perfect. Saying "every driver has a 3 in 22 chance" scores about 0.12. The probabilities are used **exactly as Jev gave them**, even though they do not add up to 3.

### Winner log loss (lower is better)

With $q_w$ the probability the side gave the real winner:

$$\text{log loss} = -\ln \max(q_w,\ 10^{-6})$$

0.69 means the winner got 50%; 2.30 means 10%. The floor at $10^{-6}$ keeps one confident miss finite (it then costs 13.8). A winner the side gave no probability to counts as 0, so as the floor.

### Winner hit

Whether the side's most likely winner won. Ties break by driver code, so the result never depends on the order of a dictionary.

### Podium picks

The side's three most likely podium finishers, and how many of them finished in the top three (0 to 3). For Jev, ties break by driver code, the same way the site shows its podium. For the baselines, ties break by the better grid slot, then by code.

### Chaos error (Jev only)

$$\text{chaos error} = |\text{Jev's score} - \text{actual level}|$$

Jev's score is a probability-weighted position on the 0 to 4 rubric (for example 0.92); the actual level is a whole number. The baselines make no chaos call.

### Consistency checks (reported, not scored)

- **Podium sum**: the sum of Jev's podium probabilities (the real total is always 3).
- **Win above podium**: drivers whose win probability is higher than their podium probability, which cannot be right. It happens because questions in one request cannot see each other's answers ([Jev](jev.md#why-one-request-per-race)).

## The actual chaos level

The actual level is the **highest rubric row whose condition holds**, computed from OpenF1 race control, OpenF1 weather, and the Jolpica classification ([`chaos.chaos_level`](../pipeline/src/race_calls/chaos.py)). The rubric text is the same text Jev was given.

| Level | Condition | How it is measured |
|---|---|---|
| 4 bedlam | a red flag, or wet running, or no podium finisher started in the top six | red flags from race control (a repeated red flag during one stoppage counts once); rain in any weather sample between lights out and the chequered flag; grid slots 1 to 6 (a pit-lane start is not top six) |
| 3 chaotic | two or more full safety cars, or 5 or more retirements | new safety car deployments only (a repeated "deployed" message while one is out is ignored) |
| 2 eventful | one full safety car, or a first-lap incident with a yellow or VSC | lap 1 runs from lights out to the first message marked lap 2; a sector yellow counts only if it stays out for at least 30 seconds (brief yellows happen on nearly every opening lap) |
| 1 lively | a virtual safety car, or 3 to 4 retirements, or 3 or more lead changes | lead changes from OpenF1 position data, counted from lights out; a leader for less than 10 seconds is ignored as a timing blip; pit-stop cycles count |
| 0 calm | none of the above | |

**Retirements** are drivers who started and were not classified: `R` and `N` count. Non-starters (`W`, `F`, or a status starting with "Did not" or "Withdrew") do not, and neither do stewards' decisions (`D`, `E`): a disqualification removes a finish the driver actually made. A lap-1 crash is a retirement.

**The rain window** runs from lights out (race control's first SESSION STARTED) to the chequered flag (the last SESSION FINISHED), falling back to the session's scheduled times, then to three hours from the start. The window matters: in 2026 Miami it rained a few minutes **after** the flag, and an earlier version counted that as wet running.

**The reason** saved with the level names what triggered it, in plain words: "a red flag", "two full safety cars", "5 retirements", "a calm race: no safety car, 1 retirement". All the counts behind it are kept in `details.chaos_inputs`.

Checked on real races: 2024 Bahrain 0 (calm), 2024 Australia 1 (two virtual safety cars), 2024 Monaco 4 (red flag), 2024 Brazil 4 (red flag and wet running), 2026 Miami 2 (one safety car).

## The two baselines

A model's numbers mean little alone. Each race is also scored for two simple rules, on the same drivers, with the same metrics ([`score.grid_baseline`](../pipeline/src/race_calls/score.py), [`score.form_baseline`](../pipeline/src/race_calls/score.py)):

- **Grid baseline**: a driver's podium and win chance is how often drivers starting from that grid slot finished on the podium and won in 2014 to 2025 (from f1db). Pole, for example: 81% podium, 54% win, over 251 starts. Win chances are normalised to add up to 1. 2026 has new technical rules, so these are a prior, not a law.
- **Form baseline**: each driver's podium and win rate over the last three races before this one, smoothed with one pseudo-race at the average rate (3 in N for the podium, 1 in N for a win, with N drivers on the grid). A driver with no recent races gets the average, not zero.

The grid baseline is hard to beat. That is the point: it keeps the model honest.

## Never scored

A prediction is published but never scored when:

- its status is `no_prediction` (qualifying data never arrived) or `failed` (Jev unreachable or answers malformed);
- it is **late**: made at or after the scheduled start;
- it was made after the **real** lights out, even if the calendar said otherwise. Calendars can be wrong: Jolpica still lists 2026 Miami at 20:00Z, but the race ran at 17:00Z. The scorer checks the prediction time against race control's actual SESSION STARTED ([`score.score_prediction`](../pipeline/src/race_calls/score.py)).

Backtests are scored with the same code (to test it), but they are marked `kind: backtest` and never count on the season leaderboard.

## Leaderboards and calibration

The site computes these from the prediction and score files ([site](site.md)):

- **Season leaderboard**: the mean of each metric per side over live, on-time, scored races, and total hits. The number of races counted is the biggest thing on it.
- **Backtest leaderboard**: the same table over the backtests only, labelled as a plumbing check.
- **Technical board**: every metric per race and per side, plus aggregates, the podium sums, the win-above-podium counts, and the podium calibration error.
- **Calls vs reality**: per race, the probabilities Jev gave to what really happened: the real podium finishers, the real winner, and the actual chaos level.
- **Calibration**: podium probabilities in ten equal bands against how often those drivers really made the podium. Bands with fewer than 10 calls are marked low-sample. The expected calibration error (ECE) is the count-weighted mean gap:

$$\text{ECE} = \sum_{b} \frac{n_b}{N}\,\left|\bar{p}_b - \bar{y}_b\right|$$

## How much to trust the numbers

Not much yet, and the site says so next to every leaderboard:

- **It is a sport.** A safety car at the wrong moment, a first-lap crash, a shower, a failed engine, a slow stop, or a penalty can decide a race. A good call can lose and a bad one can win.
- **The samples are tiny.** 8 live races this season, 14 backtests. In the backtests, Jev's podium Brier (0.0665) and the grid baseline's (0.0673) differ by far less than one race can move them.
- **The calls are not independent.** One crash can take out two front runners; teammates share a car. 22 podium calls per race are worth much less than 22 separate tests.
- **The inputs are imperfect.** The grid is the qualifying order (later penalties are missing), the historical rates predate the 2026 rules, and data sources can lag or be wrong.
- **Backtests may be memorised** by the model; only races after 17 September 2026 are a fair test.

The results so far are in [findings](findings.md).
