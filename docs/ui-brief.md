# Race Calls: brief for a UI/UX redesign

> [!NOTE]
> This is the original brief (28 September 2026) the redesign was built from. The site has moved on since; for what it is now, see [site](site.md).

## In one line

Before every Grand Prix, an AI model (Jev) makes public, timestamped calls about the race; after the race, the site scores those calls against what really happened and keeps an honest season record.

## What the project is

Race Calls is a hobby portfolio project: a public prediction tracker for the remaining races of the 2026 season (8 races, 4 October to 6 December 2026), continuing into 2027.

- **Before each race**, after qualifying, a script gathers facts (the grid, gaps to pole, championship standings, recent form, teammate head-to-head, engine supplier, qualifying speed trap and sector ranks, results at similar circuits, weather) and sends them to **Jev**, a decision model made by TypeSafe. Jev answers three kinds of question in one request:
  - **Podium chance** for each of the 22 drivers: "Will this driver finish in the top three?" (a probability, 0 to 100%). These are 22 separate yes/no calls, so they do not add up to exactly 3.
  - **Winner pick**: one driver, plus a full probability distribution over the grid.
  - **Chaos rating**: a score from 0 (calm) to 4 (bedlam) on a fixed five-level rubric (safety cars, red flags, retirements, rain).
- The prediction is **committed to a public GitHub repository before lights out**. The commit time is the proof that the call came first. A call made after the start is marked **late** and never scored.
- **After the race**, the calls are scored against the official results, next to two simple baselines (the historical record of each grid slot, and recent form), and a season leaderboard is updated.
- **Backtests**: the first 14 races of 2026 were predicted after the fact to test the pipeline. The model may have seen those results in training, so they are shown separately and always labelled "the model may have seen these results". They never count on the leaderboard.

Who it is for: race fans who like numbers, and anyone looking at the author's portfolio. The tone is confident but honest: show the misses as clearly as the hits.

## Hard constraints (non-negotiable)

- **No trademarks.** Never use "F1", "Formula 1", or "Formula One" in the site name, logo, page titles, or meta; no F1 logo, red wordmark, or the official F1 typeface; no team logos or driver photos (licensed). Team names as plain text and neutral team colour swatches are fine. The site name is **Race Calls**.
- **The motorsport look is welcome** and generic: broadcast-style timing towers, sector-style colour coding (purple for best, green for improved, yellow for slower), tabular telemetry numerals, chequered or track-line motifs, dark pit-wall surfaces.
- **Fonts**: Satoshi (loaded from the Fontshare CDN; its licence forbids committing the font files) for UI and body text; Instrument Serif (open licence) for display headings only. A monospace or tabular numeral style for all numbers.
- **Accessibility**: WCAG 2.2 AA contrast; team colours are for swatches and bars only, never as text colour; must work at **360px wide with no horizontal scroll**.
- **No em dash or en dash characters** anywhere in UI text. Use a hyphen or rephrase.
- **Static site**: all data is baked in at build time (no live API calls from the browser, no accounts, no login).
- **Honesty labels must stay visible**: backtest label, late label, "no prediction" state, the provisional-grid note, and "Jev gives no reasons" (see below).

## Pages and states

### 1. Home / season page (`/`)
- Hero: what Race Calls is, in one or two sentences, and the next race with a countdown to lights out.
- **Season leaderboard**: Jev versus the two baselines, over live races only, with the number of races counted shown prominently (it starts at zero; small samples must look small).
- **Calibration**: "when Jev said 70%, how often did it happen?" as a reliability chart in 10 bins; bins with fewer than 10 predictions are visibly marked low-sample.
- **Race list**: every race of the season with a status: upcoming, predicted, scored, late, no prediction.
- A separate, clearly labelled **Backtests** section.

### 2. Race page (`/race/:round`, and `/backtest/:round`)
Before the race:
- Race name, circuit, round, lights-out time (UTC and the visitor's local time).
- **"Called at" timestamp with a link to the public commit** (the proof).
- A **reveal button**: the page first shows the grid, and "Show Jev's calls" reveals the predictions (a spoiler guard). The page should say the calls are public in the repository anyway.
- **Winner pick**: the driver and probability, plus the full distribution (all 22 drivers).
- **Jev's podium**: the three drivers with the highest podium chance, in order.
- **Grid table** in grid order: slot, driver, team (colour swatch), podium chance (bar and percent), win chance.
- **Consistency notes**: the podium chances sum to X (the true number is 3); drivers whose win chance is higher than their podium chance (logically impossible) are flagged.
- **Chaos**: the score on a 0 to 4 scale with the five rubric lines, exactly as Jev saw them.
- **"What Jev knew"**: per driver, the plain-English facts Jev was given (expandable rows). Jev returns numbers only, no reasoning, so the page shows inputs and outputs and must not invent reasons.
- Small print: model version, provider, tokens, latency, request hash.

After the race (same page, below or in a before/after layout):
- **Actual result**: the real podium and winner, the real chaos level with the reason (for example "red flag on lap 12").
- **Scorecard**: podium Brier score (lower is better; explain in plain words), winner log loss, winner hit or miss, how many of Jev's three podium picks were right, chaos error; the same numbers for both baselines side by side.
- **Called vs actual per driver**: each driver's podium chance next to whether they finished on the podium, so misses (such as 94% on a driver who finished third) are obvious.

States to design: upcoming (no call yet), predicted (before the race), scored, late (published but not scored), no prediction (qualifying data did not arrive), failed, backtest.

## Real example data (round 14 backtest, Spanish Grand Prix at Madring, 13 September 2026)

- Grid: 1 Lando Norris (McLaren), 2 Andrea Kimi Antonelli (Mercedes), 3 Max Verstappen (Red Bull), ... 20 drivers.
- Jev's winner pick: **Norris 94%**, Antonelli 6%, everyone else about 0%.
- Jev's podium chances (top five): Norris 74%, Antonelli 72%, Verstappen 51%, Hamilton 19%, Russell 16%.
- Chaos: 0.92 out of 4 (calm to lively), confidence 0.23.
- Actual result: **Antonelli won**; podium Antonelli, Verstappen, Norris. So Jev's podium pick was 3 of 3 right, but the winner pick was a confident miss. Showing this kind of result clearly is the point of the site.
- A fact line Jev was given: "Lando Norris (McLaren) starts 1st, on pole. Norris is 4th in the championship with 171 points, with 2 wins. Last 3 races: finished 4th in the Italian Grand Prix; finished 1st in the Dutch Grand Prix; finished 1st in the Hungarian Grand Prix. From 1st on the grid in 2014 to 2025, drivers finished in the top three 81% of the time and won 54% of the time (251 starts)."

The data shape is defined in `contracts/prediction-record.schema.json`, with a full example in `contracts/prediction-record.example.json`. The current site (Vite, React 19, TypeScript, Tailwind 4) is in `web/`; run it with `cd web && pnpm dev --port 5174`.

## Numbers and wording guidance

- Show probabilities as whole percents; scores to two or three decimals with a one-line plain explanation.
- Always show sample sizes ("over 3 live races").
- The model is "Jev by TypeSafe". Data credits in the footer: Jolpica, OpenF1, f1db.
