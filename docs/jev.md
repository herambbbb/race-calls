# Jev: the model and how Race Calls asks it

- [What Jev is](#what-jev-is)
- [Why one request per race](#why-one-request-per-race)
- [The three questions](#the-three-questions)
- [A real request and response](#a-real-request-and-response)
- [Reading the answers](#reading-the-answers)
- [Transports: TypeSafe, OpenRouter, gateway](#transports-typesafe-openrouter-gateway)
- [Retries, failures, and secrets](#retries-failures-and-secrets)
- [The contamination problem](#the-contamination-problem)
- [What Jev cannot do, by design](#what-jev-cannot-do-by-design)

## What Jev is

Jev is TypeSafe's first **System One** model. It does not write text or explain itself. You give it a **state** (the facts) and a set of **questions**, each of a fixed type, and it returns typed answers with probabilities. Code owns everything else: gathering the facts, computing the numbers, combining the answers, and deciding what to do with them.

TypeSafe describes three primitives, and Race Calls uses all three:

| Primitive | Answers | Race Calls uses it for |
|---|---|---|
| **Noul** | The probability that a condition holds (0 to 1). No separate confidence. | "Will this driver finish in the top three?", one per driver |
| **Choice** | One option from a defined set, plus a probability distribution over all of them and a confidence | "Who will win?", over every driver on the grid |
| **Score** | A probability-weighted position on ordered levels, plus the distribution over levels and a confidence | "How chaotic will this race be?", on the fixed 0 to 4 rubric |

Official documentation: <https://docs.typesafe.ai>. (`jevtypesafeai.com` is not a TypeSafe site.)

## Why one request per race

All 24 questions for a race (22 podium nouls, 1 winner choice, 1 chaos score) go in **one request** over **one state**. That keeps the cost to one call per race, and it means every answer was made from exactly the same facts.

One consequence matters a lot for reading the results: questions in the same request **run in parallel and cannot see each other's answers**. The winner question does not know what the podium questions said. That is why Jev can give a driver a 94% chance to win and only a 74% chance to finish in the top three, which is logically impossible. The scorer does not hide this: each score file lists these drivers under `details.win_above_podium`, and the site shows them as inconsistencies.

## The three questions

The questions are built by [`questions.py`](../pipeline/src/race_calls/questions.py). The instructions never contain a number: every fact, including every number, lives in the state, written as a plain sentence by code (see [pipeline](pipeline.md)). Jev never does arithmetic.

- **Podium**, question id `podium_<CODE>` (for example `podium_NOR`), type `noul`:
  *"Will Lando Norris (McLaren) finish this race in the top three?"*
- **Winner**, id `winner`, type `choice`, instructions *"Who will win this race?"*, with one option per driver on the grid, keyed by driver code: `"NOR": "Lando Norris (McLaren) wins the race."`
- **Chaos**, id `chaos`, type `score`, with the five rubric lines as the levels, word for word the same text the scorer uses ([`rubric.py`](../pipeline/src/race_calls/rubric.py)), so the question and the answer key cannot drift apart:

  | Level | Criterion given to Jev |
  |---|---|
  | 0 | calm - no safety car or virtual safety car, at most 2 retirements, and the winner led most laps. |
  | 1 | lively - a virtual safety car, or 3 to 4 retirements, or 3 or more lead changes. |
  | 2 | eventful - one full safety car, or a first-lap incident that brought out a yellow flag or a virtual safety car. |
  | 3 | chaotic - two or more full safety cars, or 5 or more retirements. |
  | 4 | bedlam - a red flag, or wet running, or a podium with none of the top six starters. |

The podium probabilities are **independent** yes/no calls, so they do not sum to 3. They are stored and scored exactly as returned, never normalised; the sum is reported next to them (`details.podium_sum`).

## A real request and response

From the committed backtest [`14-spanish-grand-prix.json`](../predictions/backtest/14-spanish-grand-prix.json) (made through OpenRouter, before the switch to TypeSafe's own API). The state was 9,166 characters of plain sentences.

```jsonc
// POST https://openrouter.ai/api/alpha/decisions   (TypeSafe direct: https://api.typesafe.ai/v1/systemone)
{
  "model": "typesafe/jev-1.13",                    // TypeSafe direct: "jev-1.13.0"
  "state": "Race: the Spanish Grand Prix, round 14 of 23 in the 2026 season, at Madring (Madrid, Spain).\n...",
  "questions": {
    "podium_NOR": { "type": "noul", "instructions": "Will Lando Norris (McLaren) finish this race in the top three?" },
    // ... 19 more podium questions, one per driver
    "winner": {
      "type": "choice",
      "instructions": "Who will win this race?",
      "criteria": { "NOR": "Lando Norris (McLaren) wins the race.", "ANT": "Andrea Kimi Antonelli (Mercedes) wins the race." /* ... */ }
    },
    "chaos": {
      "type": "score",
      "instructions": "How chaotic will this race be? Rate it on the five-level rubric. The actual level will be the highest level whose condition the race meets.",
      "criteria": ["0: calm - ...", "1: lively - ...", "2: eventful - ...", "3: chaotic - ...", "4: bedlam - ..."]
    }
  }
}
```

```jsonc
// Response (answers trimmed)
{
  "model": "typesafe/jev-1.13-20260917",           // OpenRouter reports a dated build; TypeSafe direct reports "jev-1.13.0"
  "provider": "TypeSafe",
  "id": "gen-dec-1790585931-...",
  "usage": { "input_tokens": 4318, "output_tokens": 558, "cost": 0.000181356 },   // TypeSafe direct: tokens only, no cost
  "answers": {
    "podium_NOR": { "type": "noul", "noul": 0.74 },
    "winner": { "type": "choice", "choice": "NOR", "confidence": 0.93,
                "probabilities": { "NOR": 0.94, "ANT": 0.06, "VER": 0 /* ... */ } },
    "chaos": { "type": "score", "score": 0.92, "confidence": 0.23,
               "probabilities": { "0": 0.55, "1": 0.21, "2": 0.04, "3": 0.14, "4": 0.05 },
               "legend": { "0": "0: calm - ...", /* ... */ } }
  }
}
```

What happened: Antonelli won, Verstappen second, Norris third. Jev's three highest podium chances (Norris 74%, Antonelli 72%, Verstappen 51%) were all right; its winner pick (Norris, 94%) was a confident miss. The actual chaos level was 1 (four retirements); Jev said 0.92.

Everything above is saved in the prediction record: the full request, the full response, the model version, provider, tokens, cost when reported, latency, and the SHA-256 of the canonical request body. See [data formats](data-formats.md).

## Reading the answers

[`questions.parse_calls`](../pipeline/src/race_calls/questions.py) turns the answers into the record's `calls` block and rejects anything malformed: a missing answer, a probability outside 0 to 1, a winner who is not on the grid, a chaos score outside the rubric. A malformed answer makes the record `failed` (the response is still kept for inspection); it never crashes the job and is never scored.

Two properties of the answers are easy to misread, so the site states them:

- **A Choice's confidence is about concentration, not correctness.** 0.93 means the distribution is piled onto one option, not that the pick is 93% likely to be right.
- **A Noul near 0.5 means "as likely as not"**, not "medium".

## Transports: TypeSafe, OpenRouter, gateway

The request body is the same everywhere; only the URL, the model id, and the key change. [`jev.py`](../pipeline/src/race_calls/jev.py) supports three transports, chosen by the `JEV_TRANSPORT` setting ([`settings.py`](../pipeline/src/race_calls/settings.py)):

| Transport | URL | Model | Key | Notes |
|---|---|---|---|---|
| `typesafe` (default) | `https://api.typesafe.ai/v1/systemone` | `jev-1.13.0` (pinned, not `jev-latest`) | `TYPESAFE_API_KEY` | Used for live races. Reports tokens, no cost, no build date. |
| `openrouter` | `https://openrouter.ai/api/alpha/decisions` (the native decisions endpoint, not chat completions) | `typesafe/jev-1.13` | `OPENROUTER_API_KEY` | Used for the backtests. Reports a dated build and the cost (about $0.0002 per race with the full snapshot). |
| `gateway` | Vercel AI Gateway | `typesafe-ai/jev` | `AI_GATEWAY_API_KEY` | Kept as a fallback only: it throttled this account to about one success every 4 to 7 minutes. |

## Retries, failures, and secrets

- **Retryable**: HTTP 429, 500, 502, 503, 504, 520 to 524 (Cloudflare's transient origin errors; OpenRouter returned a 520 once during a backtest), 529, and dropped connections. Everything else (for example 401 or 422) fails at once.
- **Patient policy** for real runs: waits of 30 s, 60 s, 2, 4, 8, then 10 minutes (about 45 minutes in total). A server's `Retry-After` is honoured when it is longer, capped at 10 minutes. Failed attempts are not billed.
- **Never past the deadline**: on race weekends the retry budget is cut so the waits alone cannot run past one hour before the start ([`predict.retry_until`](../pipeline/src/race_calls/predict.py)).
- **Secrets**: keys are read only through pydantic-settings as `SecretStr`, never printed or logged; any error text that could echo a key has it replaced with `[redacted]`; records never contain a key; the site build fails if any `*_API_KEY` value appears in it.

## The contamination problem

OpenRouter reports the model as `typesafe/jev-1.13-20260917`: built on 17 September 2026. Jev may therefore have seen the results of every race before that date in training. So:

- Rounds 1 to 14 of 2026 were run **after the fact as backtests** to test the pipeline. They are stored under `predictions/backtest/`, always labelled "the model may have seen these results", and kept off the season leaderboard. They have their own leaderboard.
- The **live season starts at round 16** (Bahrain at Sepang, 4 October 2026), the first race after the model's date that had not happened when the prediction was made.
- TypeSafe's own API reports `jev-1.13.0` without a date, so the same cutoff (17 September 2026) is applied to it ([`predict.KNOWN_MODEL_DATE`](../pipeline/src/race_calls/predict.py)). If a future version reports a later date, races before that date automatically become backtests.

## What Jev cannot do, by design

- **Give reasons.** It returns numbers only. The site shows "What Jev knew" (the exact facts it was given) next to what it answered, and never invents a reason.
- **See the other answers** in the same request (see above).
- **Do arithmetic.** Every number it sees was computed by code and written into a sentence.
- **Know about grid penalties announced after qualifying.** The grid in the snapshot is the qualifying order, and the snapshot says so.
