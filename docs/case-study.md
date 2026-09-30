# Race Calls: case study

A five-minute read on what this project is, why it is built the way it is, and what it shows. The technical depth is in the [other docs](README.md).

- [The problem](#the-problem)
- [What was built](#what-was-built)
- [My role](#my-role)
- [Key decisions and trade-offs](#key-decisions-and-trade-offs)
- [Results](#results)
- [What went wrong, and what it taught](#what-went-wrong-and-what-it-taught)
- [Quality and engineering practice](#quality-and-engineering-practice)
- [Skills shown](#skills-shown)
- [Resume bullets](#resume-bullets)
- [Talking points for an interview](#talking-points-for-an-interview)

## The problem

AI models are often shown off with predictions nobody can check: made after the fact, scored by the people who made them, or quietly revised. The question behind Race Calls: **can you build an AI prediction product that is honest by construction**, where every call is public before the event, scored by fixed rules against official data, and compared with simple baselines so the numbers mean something?

Motor racing is a good test bed. There is a race almost every week, the inputs (the grid, standings, form) are public just before it, and an objective answer arrives a few hours later.

## What was built

An end-to-end system, built to run on its own for the last 8 races of the 2026 season:

1. **A data pipeline** (Python) that, after qualifying, gathers the grid, standings, recent form, teammate head-to-heads, engine suppliers, speed-trap and sector rankings, weather, and 12 seasons of grid-slot history from three public sources, with caching, rate limiting, and retries.
2. **A snapshot builder** that turns those facts into plain sentences. Code computes every number; the model only judges.
3. **One structured request per race** to Jev, TypeSafe's decision model: a yes/no podium probability for each of 22 drivers, a winner distribution over the grid, and a chaos rating on a fixed rubric.
4. **Tamper-evident publishing**: each prediction is committed to a public git repository before the race starts; the commit time is the proof. Records are immutable, and a call made after the start is marked late and never scored.
5. **A scoring engine** that, after the race, scores the calls with proper scoring rules (Brier score, log loss, calibration) against two baselines, and computes the race's actual chaos level from race-control messages, weather, and the classification.
6. **Automation**: two scheduled GitHub Actions workflows that decide from the calendar what to do, predict or score, and commit their own output.
7. **A static website** (React, TypeScript) with race pages, a season leaderboard, a separate backtest leaderboard, a technical per-race board, a "calls vs reality" view, and a calibration chart, all built from the committed files, with no runtime API calls and a build step that fails if an API key would leak.

Scale: 25 Python modules, 278 offline tests on the pipeline and 159 on the site, two JSON contracts shared by both halves, and a dozen documentation pages.

## My role

<!-- Review this section and adjust it so it describes your own contribution accurately. -->

I conceived the product and owned it end to end: the problem, the requirements, the honesty rules (timestamped calls, late calls never scored, backtests kept apart, no invented explanations), the data sources, and every design decision and trade-off in this document. I built it with AI coding agents (Claude Code), working as architect and reviewer: I wrote the specification (OpenSpec), broke the work into independent pieces with shared contracts, had separate agents implement them in parallel, and had an independent verifier agent check each stage before anything was committed. I reviewed the results, caught and directed fixes for the issues described below, and made the calls on scope, licensing, and hosting.

## Key decisions and trade-offs

| Decision | Why | Trade-off accepted |
|---|---|---|
| **Code computes every number; the model never does arithmetic** | Language models are unreliable at arithmetic; typed judgments over plain facts are what this model is built for | Every fact needs code to compute and phrase it |
| **One request per race, 24 questions over one state** | Every answer comes from the same facts; cost stays at one call per race | Questions cannot see each other's answers, so they can contradict (reported, not hidden) |
| **Publish by git commit before lights out** | A public, timestamped, append-only record is proof nobody can quietly edit | Relies on a scheduler that can be late, so the job runs twice an hour and gives up an hour before the start |
| **Score raw probabilities, never normalise them** | Normalising would hide the model's real behaviour | Scores look worse when the model is inconsistent, which is the honest outcome |
| **Two simple baselines on every race** | A number alone means nothing; the grid-slot history is hard to beat | The model can visibly lose to a lookup table (and on the winner call, it does) |
| **Backtests kept apart and labelled** | The model was built on 17 September 2026 and may have seen earlier results | Only 8 live races this season: a small sample, stated everywhere |
| **Static site, data baked in at build time** | No servers, no keys in the browser, nothing to go down | New results appear only after a rebuild |
| **Fully offline tests** | Tests once hit a real API in an earlier project; never again | Every external response is a captured, trimmed fixture |

## Results

On 14 backtests (rounds 1 to 14 of 2026, possibly seen by the model, so a plumbing check rather than proof of skill):

| | Podium Brier (lower is better) | Winner log loss | Winners right | Podium picks right |
|---|---|---|---|---|
| Jev | 0.0665 | 2.44 | 9 of 14 | 26 of 42 |
| Grid-slot baseline | 0.0673 | 1.21 | 9 of 14 | 26 of 42 |
| Form baseline | 0.0906 | 2.53 | 4 of 14 | 24 of 42 |

- The **podium calls** match the strong baseline and are well calibrated (expected calibration error 0.045 over 303 calls).
- The **winner call** always picked the pole-sitter, usually at 90 to 100%, and was confidently wrong in 5 races. Diagnosing this led to richer facts, which improved every metric on a re-run (podium Brier 0.0635, beating the baseline).
- The **chaos call** ran low in 13 of 14 races: the model underestimates how eventful the 2026 races are.

Full analysis with charts: [findings](findings.md). The live season begins on 4 October 2026.

## What went wrong, and what it taught

Real problems found while building it, each fixed and covered by a test:

- **A data leak hiding in helpful data.** The historical dataset already included 2026 races, so a backtest's circuit history counted the race being predicted. Now history is capped at 2025, and the snapshot builder refuses any input from the race's own round or later.
- **An official calendar that was wrong.** One race ran three hours earlier than the calendar source still says. A call made between the two times would have looked on time. The scorer now checks every live call against the real start time from race-control messages.
- **Rain after the finish.** A race was scored as "wet running" because it rained minutes after the chequered flag. The rain window now ends at the flag.
- **A transient error treated as final.** An HTTP 520 from the API gateway was not retried. On race day that would have wasted a scheduled run.
- **The model's contradictions.** In 12 of 14 races the model gave some driver a higher chance to win than to finish on the podium, because parallel questions cannot see each other. Rather than patching the numbers, the product reports these contradictions.

The common lesson: **the dangerous bugs in a prediction system are not crashes but quiet dishonesty**: leaks, wrong clocks, and flattering transformations. Most of the design exists to make those impossible or visible.

## Quality and engineering practice

- **Spec-first**: an OpenSpec change (proposal, design, requirements with scenarios, tasks) written and validated before code, and updated as decisions changed.
- **Contracts between halves**: JSON schemas and examples in `contracts/`, checked by tests on both the Python and the TypeScript side, so neither can drift.
- **Checks on every change**: pytest, ruff, mypy in strict mode; TypeScript strict with `noUncheckedIndexedAccess`, oxlint, vitest; a build-time secret scan.
- **Independent verification**: a separate reviewer checked each stage and recomputed published numbers by hand from the raw files before anything was committed.
- **Security**: keys read only as secrets, redacted from errors, absent from records, logs, and the built site; the CI secret is set outside the tooling.
- **Accessibility**: WCAG 2.2 AA contrast, no colour-only meaning, 360 px layouts without horizontal scroll.

## Skills shown

| Area | Evidence in this repository |
|---|---|
| Product thinking | An honesty-first product definition: public timestamped calls, baselines, labelled backtests, stated uncertainty |
| Data engineering | Three external sources with caching, rate limits, retries, and failure modes handled explicitly |
| Applied AI | Structured, typed model questions; prompt state built by code; contamination handled; model behaviour diagnosed and improved with measurement |
| Evaluation and statistics | Proper scoring rules (Brier, log loss), calibration and ECE, baselines, small-sample caution |
| Software design | Pure, testable modules; shared contracts; immutable records; explicit leak guards |
| Testing and quality | 437 offline tests across both halves, strict typing, linting, independent review |
| Automation and DevOps | Calendar-driven scheduled workflows that commit their own output, with retries bounded by deadlines |
| Frontend | A static React and TypeScript site with data visualisation, accessibility, and a build-time data pipeline |
| Communication | This documentation set, charts from real data, and a findings report that shows misses as plainly as hits |

## Resume bullets

Pick two or three and adjust them to your role:

- Designed and shipped **Race Calls**, an end-to-end AI prediction tracker that publishes timestamped, tamper-evident race predictions to GitHub before each event and scores them automatically against official results and baselines (Python, TypeScript, GitHub Actions).
- Built a data pipeline over three public motorsport APIs with caching, rate limiting, and explicit leak guards, turning raw data into plain-language facts for a typed decision model (22 probability questions plus a winner distribution and a chaos rating per race, in one request).
- Implemented an evaluation engine using proper scoring rules (Brier score, log loss, expected calibration error) against two baselines; diagnosed the model's overconfident winner picks and improved podium accuracy with richer features, beating the strongest baseline on backtests.
- Directed a multi-agent AI coding workflow (Claude Code) from a written specification: parallel implementation against shared JSON contracts, an independent verifier on every stage, and 437 fully offline tests with strict typing and a build-time secret scan.

## Talking points for an interview

- **Why git commits as proof?** Because they are public, timestamped by a third party, and append-only. Anyone can check the prediction existed before the race, without trusting me.
- **Why does the model lose to a lookup table on winners?** Its winner answer collapsed onto the pole-sitter with extreme confidence; log loss punishes confident misses. The fix was better inputs, measured with a re-run, not tuning the output.
- **How do you know the backtests are not inflated?** You do not, and the site says so: the model may have seen those races. That is why they are separated and why the live season, after the model's date, is the real test.
- **What would you do next?** Add safety-car history per circuit to fix the chaos bias, add drivers missing from qualifying data to the grid, and put uncertainty intervals on the leaderboard.
