# Data formats

Every file Race Calls commits, field by field. All of them are plain JSON written by the
pipeline, and the pydantic models in [`models.py`](../pipeline/src/race_calls/models.py)
are the single source of truth for the two record types. Times are always
timezone-aware UTC, written in ISO 8601 with a `Z`.

- [Where files live and how they are named](#where-files-live-and-how-they-are-named)
- [Prediction records](#prediction-records)
  - [Statuses and kinds](#statuses-and-kinds)
  - [PredictionRecord fields](#predictionrecord-fields)
  - [Nested objects](#nested-objects)
  - [A real record](#a-real-record)
- [Score records](#score-records)
  - [ScoreRecord fields](#scorerecord-fields)
  - [ContenderScore fields](#contenderscore-fields)
  - [The details block](#the-details-block)
  - [A real score](#a-real-score)
- [Priors](#priors)
  - [`priors/priors.json`](#priorspriorsjson)
  - [`priors/engines-2026.json`](#priorsengines-2026json)
  - [`priors/circuit-traits.json`](#priorscircuit-traitsjson)
- [Contracts](#contracts)

## Where files live and how they are named

| Path | Written by | Content |
|---|---|---|
| `predictions/<season>/<NN>-<slug>.json` | `rc prerace`, `rc predict` | a live `PredictionRecord` |
| `predictions/backtest/<NN>-<slug>.json` | `rc backtest` | a backtest `PredictionRecord` |
| `scores/<season>/<NN>-<slug>.json` | `rc postrace`, `rc score` | a live `ScoreRecord` |
| `scores/backtest/<NN>-<slug>.json` | `rc score-backtests` | a backtest `ScoreRecord` |
| `priors/priors.json` | `rc priors` | grid-slot rates and circuit history |
| `priors/engines-2026.json` | `python -m race_calls.facts.engines` | power unit per constructor |
| `priors/circuit-traits.json` | a person (reviewed by hand) | circuit traits |
| `contracts/*.schema.json` | `python -m race_calls.contracts` | JSON schemas of the two records |
| `contracts/*.example.json` | by hand, and `python tests/test_score.py` | example records for both test suites |

`NN` is the round number with two digits and `slug` is the Jolpica race name made
lowercase with every run of other characters replaced by `-` (`Weekend.file_stem`, and
`slugify` in [`jolpica.py`](../pipeline/src/race_calls/jolpica.py)). So round 14 of 2026 is
`14-spanish-grand-prix.json`. The folder is `backtest` or the season number, chosen by the
record's `kind` (`record_path` in [`predict.py`](../pipeline/src/race_calls/predict.py) and
`score_path` in [`score.py`](../pipeline/src/race_calls/score.py)). A score has the same
file name as the prediction it scores, in the matching folder under `scores/`.

Records are written atomically (to a `.tmp` file, then renamed) with two-space indents
and non-ASCII characters kept as they are.

## Prediction records

`PredictionRecord` in [`models.py`](../pipeline/src/race_calls/models.py). One per race.
Every model is frozen and uses `extra="forbid"`, so a record with an unknown field fails
to load: the format cannot drift quietly.

### Statuses and kinds

`status` says what happened:

| Status | Meaning | What the record carries |
|---|---|---|
| `ok` | Jev answered and every answer parsed | everything: drivers, snapshot, request, response, `jev`, `calls` |
| `failed` | Jev could not be reached, rejected the request, or its answers were malformed | `error`, plus the drivers, snapshot, and request; if Jev did answer, also `response` and `jev`. The only status that may be replaced by a later run. |
| `no_prediction` | qualifying data had not arrived one hour before the start | only the header fields and `note` ("No prediction for this race: qualifying data did not arrive in time.") |

`kind` says whether the call can count:

| Kind | Meaning |
|---|---|
| `live` | the race is after the model's build date, so Jev cannot have seen the result |
| `backtest` | the race is on or before the build date (17 September 2026); "the model may have seen these results" |

`kind_for` in [`predict.py`](../pipeline/src/race_calls/predict.py) takes the build date
from the model id Jev reports (`typesafe/jev-1.13-20260917`), or falls back to
`KNOWN_MODEL_DATE` when the id has no date (TypeSafe's own API reports `jev-1.13.0`).

`late` is `true` only for a live record written at or after the scheduled start. A late
record is published but never scored. Backtests are made after their race by design, so
they are never late.

### PredictionRecord fields

| Field | Type | Meaning |
|---|---|---|
| `schema_version` | integer | format version, currently `1` |
| `season` | integer | season, e.g. `2026` |
| `round` | integer | round number |
| `slug` | string | race name slug, part of the file name |
| `race_name` | string | e.g. `"Spanish Grand Prix"` |
| `circuit_name` | string | e.g. `"Madring"` |
| `race_start` | date-time | scheduled start from Jolpica's calendar |
| `kind` | `"live"` or `"backtest"` | see above |
| `status` | `"ok"`, `"no_prediction"`, or `"failed"` | see above |
| `made_at` | date-time | when the record was made: after Jev answered (or failed), or when the job gave up |
| `late` | boolean | `made_at >= race_start` for a live record |
| `note` | string or null | a plain note, e.g. the backtest warning |
| `grid_provisional` | boolean | the grid is the qualifying order; always `true` today |
| `drivers` | array of `RecordDriver` | the grid, in grid order; empty for `no_prediction` |
| `snapshot_text` | string or null | the exact `state` text Jev read |
| `request` | object or null | the exact request body: `model`, `state`, `questions` (see [jev.md](jev.md)) |
| `request_hash` | string or null | SHA-256 of the request body as canonical JSON (sorted keys, no spaces), so anyone can check the committed request is the one sent |
| `response` | object or null | Jev's full response body, as received |
| `jev` | `JevMeta` or null | who served the call, and its cost and timing |
| `calls` | `Calls` or null | the parsed answers; present only when `status` is `ok` |
| `error` | string or null | why a `failed` record failed; never contains a key |
| `extra` | object | `snapshot` (the structured `Snapshot`: race lines and per-driver facts) and `notes` (optional inputs that were unavailable, as strings) |

### Nested objects

**`RecordDriver`**, one per car on the grid:

| Field | Type | Meaning |
|---|---|---|
| `code` | string | three-letter code, e.g. `"NOR"`; the key for every per-driver answer |
| `name` | string | full name |
| `number` | integer or null | car number |
| `constructor` | string | team name as Jolpica gives it |
| `constructor_id` | string | Jolpica constructor id, e.g. `"mclaren"` |
| `grid` | integer | provisional grid slot, from 1 |

**`JevMeta`**:

| Field | Type | Meaning |
|---|---|---|
| `url` | string | the endpoint called (the transport) |
| `model_requested` | string | the model id sent |
| `model_id` | string or null | the model id Jev reported, dated when the transport reports one |
| `provider` | string or null | who served it |
| `generation_id` | string or null | the provider's id for the call |
| `cost_usd` | number or null | cost as reported; `null` from TypeSafe's own API, which reports none |
| `input_tokens`, `output_tokens` | integer or null | usage as reported |
| `latency_ms` | integer | time for the successful attempt |
| `requested_at` | date-time | when the first attempt started |

**`Calls`**, the parsed answers:

| Field | Type | Meaning |
|---|---|---|
| `podium` | object, code to number | each driver's podium probability from 0 to 1, exactly as Jev gave it (not normalised, so the sum is not forced to 3) |
| `winner.choice` | string | the driver code Jev chose |
| `winner.confidence` | number or null | Jev's confidence in the choice |
| `winner.probabilities` | object, code to number | a win probability for every driver on the grid; a driver Jev left out is `0` |
| `chaos.score` | number | the chaos call, 0 to 4 on the rubric (see [scoring.md](scoring.md)) |
| `chaos.confidence` | number or null | Jev's confidence |

`parse_calls` in [`questions.py`](../pipeline/src/race_calls/questions.py) rejects (and so
turns into a `failed` record) any probability outside 0 to 1, a winner probability for a
driver not on the grid, a choice not on the grid, and a chaos score outside 0 to 4.

### A real record

From [`predictions/backtest/14-spanish-grand-prix.json`](../predictions/backtest/14-spanish-grand-prix.json).
This backtest was made through the OpenRouter transport, which is why `url` and
`cost_usd` are what they are.

```jsonc
{
  "schema_version": 1,
  "season": 2026,
  "round": 14,
  "slug": "spanish-grand-prix",
  "race_name": "Spanish Grand Prix",
  "circuit_name": "Madring",
  "race_start": "2026-09-13T13:00:00Z",
  "kind": "backtest",
  "status": "ok",
  "made_at": "2026-09-28T08:58:51.644452Z",
  "late": false,
  "note": "Backtest: the model may have seen these results.",
  "grid_provisional": true,
  "drivers": [
    { "code": "NOR", "name": "Lando Norris", "number": 1, "constructor": "McLaren", "constructor_id": "mclaren", "grid": 1 },
    { "code": "ANT", "name": "Andrea Kimi Antonelli", "number": 12, "constructor": "Mercedes", "constructor_id": "mercedes", "grid": 2 }
    // ... 18 more drivers
  ],
  "snapshot_text": "Race: the Spanish Grand Prix, round 14 of 23 in the 2026 season, at Madring (Madrid, Spain).\n...",
  "request": {
    "model": "typesafe/jev-1.13",
    "state": "Race: the Spanish Grand Prix, round 14 of 23 ...",  // same text as snapshot_text
    "questions": {
      "podium_NOR": { "type": "noul", "instructions": "Will Lando Norris (McLaren) finish this race in the top three?" },
      // ... one podium question per driver, then "winner" and "chaos"
    }
  },
  "request_hash": "644b13ddce1fd7fc2749505c62cc9f6e4ea28c014290d400de3103073d2f94ef",
  "response": {
    "model": "typesafe/jev-1.13-20260917",
    "answers": {
      "podium_NOR": { "type": "noul", "noul": 0.74 },
      // ... every podium answer, then "winner" and "chaos"
    },
    "usage": { "input_tokens": 4318, "output_tokens": 558, "cost": 0.000181356 },
    "id": "gen-dec-1790585931-wWFQvGGOgKkQU7FFD1FI",
    "provider": "TypeSafe"
  },
  "jev": {
    "url": "https://openrouter.ai/api/alpha/decisions",
    "model_requested": "typesafe/jev-1.13",
    "model_id": "typesafe/jev-1.13-20260917",
    "provider": "TypeSafe",
    "generation_id": "gen-dec-1790585931-wWFQvGGOgKkQU7FFD1FI",
    "cost_usd": 0.000181356,
    "input_tokens": 4318,
    "output_tokens": 558,
    "latency_ms": 496,
    "requested_at": "2026-09-28T08:58:51.148625Z"
  },
  "calls": {
    "podium": { "NOR": 0.74, "ANT": 0.72, "VER": 0.51, "HAM": 0.19 /* ... 16 more */ },
    "winner": {
      "choice": "NOR",
      "confidence": 0.93,
      "probabilities": { "NOR": 0.94, "ANT": 0.06, "VER": 0.0 /* ... 17 more, all 0.0 */ }
    },
    "chaos": { "score": 0.92, "confidence": 0.23 }
  },
  "error": null,
  "extra": {
    "snapshot": { /* the structured snapshot; see pipeline.md */ },
    "notes": []
  }
}
```

The full `extra.snapshot` of this record is shown in
[pipeline.md](pipeline.md#a-real-snapshot).

## Score records

`ScoreRecord` in [`models.py`](../pipeline/src/race_calls/models.py), written by
`score_prediction` and `write_score` in [`score.py`](../pipeline/src/race_calls/score.py).
One per scored prediction. Only `ok`, on-time predictions are ever scored, so there is no
score file for a `failed`, `no_prediction`, or late record. How each number is computed
is in [scoring.md](scoring.md); this section is only the shape.

### ScoreRecord fields

| Field | Type | Meaning |
|---|---|---|
| `schema_version` | integer | format version, currently `1` |
| `season`, `round` | integer | the race |
| `kind` | `"live"` or `"backtest"` | copied from the prediction |
| `scored_at` | date-time | when the score was computed |
| `prediction` | string | repository path of the scored prediction, e.g. `predictions/backtest/14-spanish-grand-prix.json` |
| `result.winner` | string | the winner's code |
| `result.podium` | array of 3 strings | the podium codes, P1 to P3 |
| `result.finish` | object, code to string | every entry in the classification, with its Jolpica `positionText`: `"1"` to `"22"`, or `"R"`, `"D"`, `"W"`, `"N"`, `"F"`, `"E"` |
| `chaos.actual` | integer | the actual chaos level, 0 to 4 |
| `chaos.reason` | string | why, in plain words, e.g. `"4 retirements"` |
| `scores` | object | one `ContenderScore` each for `"jev"`, `"grid"`, and `"form"` |
| `details` | object | audit data, see below; the site ignores fields it does not know |

### ContenderScore fields

Jev and the two baselines are scored the same way on the drivers in the prediction.

| Field | Type | Meaning |
|---|---|---|
| `podium_brier` | number | mean Brier score of the podium probabilities (lower is better) |
| `winner_log_loss` | number | log loss of the win distribution on the actual winner (lower is better) |
| `winner_hit` | boolean | the side's most likely winner won |
| `podium_pick` | array of 3 strings | the side's three most likely podium finishers, most likely first |
| `podium_hits` | integer | how many of `podium_pick` finished on the podium, 0 to 3 |
| `chaos_error` | number or null | absolute error of the chaos call; `null` for the baselines, which make none |

### The details block

| Key | Type | Meaning |
|---|---|---|
| `chaos_inputs` | object | what the chaos level was computed from (`ChaosInputs`): `safety_cars`, `virtual_safety_cars`, `red_flags` (integers), `first_lap_yellow_or_vsc` (boolean), `retirements` (started but not classified), `lead_changes` (integer, or `null` when OpenF1 had no position data), `wet` (boolean), `podium_from_top_six` (boolean) |
| `lights_out` | date-time or `null` | when the race really started (race control's first SESSION STARTED); a live call made at or after it is never scored, so the check can be audited from the committed file |
| `podium_sum` | number | the sum of Jev's podium probabilities, rounded to 4 places (3 would be coherent) |
| `win_above_podium` | array of strings | codes whose win probability is above their podium probability, which is incoherent |
| `baselines` | object | a one-line description of the `grid` and `form` baselines, including the priors source |
| `unscored_finishers` | array of strings | codes in the result that were not in the prediction's grid, so were not scored |

### A real score

From [`scores/backtest/14-spanish-grand-prix.json`](../scores/backtest/14-spanish-grand-prix.json):

```jsonc
{
  "schema_version": 1,
  "season": 2026,
  "round": 14,
  "kind": "backtest",
  "scored_at": "2026-09-28T20:45:09.344378Z",
  "prediction": "predictions/backtest/14-spanish-grand-prix.json",
  "result": {
    "winner": "ANT",
    "podium": ["ANT", "VER", "NOR"],
    "finish": {
      "ANT": "1", "VER": "2", "NOR": "3", "LEC": "4",
      // ... 14 more classified finishers
      "SAI": "R", "PER": "R", "STR": "R", "HAM": "R"
    }
  },
  "chaos": { "actual": 1, "reason": "4 retirements" },
  "scores": {
    "jev": {
      "podium_brier": 0.023289999999999998,
      "winner_log_loss": 2.8134107167600364,
      "winner_hit": false,
      "podium_pick": ["NOR", "ANT", "VER"],
      "podium_hits": 3,
      "chaos_error": 0.07999999999999996
    },
    "grid": {
      "podium_brier": 0.02409966561253815,
      "winner_log_loss": 1.4486327952270268,
      "winner_hit": false,
      "podium_pick": ["NOR", "ANT", "VER"],
      "podium_hits": 3,
      "chaos_error": null
    },
    "form": {
      "podium_brier": 0.0392734375,
      "winner_log_loss": 1.3416622070991222,
      "winner_hit": false,
      "podium_pick": ["ANT", "NOR", "VER"],
      "podium_hits": 3,
      "chaos_error": null
    }
  },
  "details": {
    "chaos_inputs": {
      "safety_cars": 0,
      "virtual_safety_cars": 0,
      "red_flags": 0,
      "first_lap_yellow_or_vsc": false,
      "retirements": 4,
      "lead_changes": 2,
      "wet": false,
      "podium_from_top_six": true
    },
    "lights_out": "2026-09-13T13:04:04.248000+00:00",
    "podium_sum": 2.74,
    "win_above_podium": ["NOR"],
    "baselines": {
      "grid": "top-three and win rates by starting slot, f1db v2026.15.1, 2014 to 2025",
      "form": "last 3 races, smoothed with one pseudo-race at the average"
    },
    "unscored_finishers": ["BEA", "STR"]
  }
}
```

Here `unscored_finishers` shows two drivers in the result who were not in the
prediction's 20-car grid: the qualifying data the backtest used had 20 entries,
while 22 cars appear in the classification.

## Priors

Three committed files under [`priors/`](../priors/). The first two are generated from
the pinned f1db release (see [pipeline.md](pipeline.md#f1db)); the third is edited by hand.
The two generated files are written with sorted keys, so a rebuild with the same inputs
produces an identical file and a real change shows up as a small diff.

### `priors/priors.json`

`Priors` in [`models.py`](../pipeline/src/race_calls/models.py), built by `build_priors` in
[`priors.py`](../pipeline/src/race_calls/priors.py).

| Field | Type | Meaning |
|---|---|---|
| `source` | string | `"f1db v2026.15.1"` |
| `seasons` | `[first, last]` | `[2014, 2025]`; the snapshot refuses priors whose last season reaches the race's season |
| `grid_slots` | array of `GridSlotRate` | one per starting slot, 0 (pit lane) to 22 |
| `grid_slots[].slot` | integer | starting slot; 0 is a pit-lane start |
| `grid_slots[].starts`, `.podiums`, `.wins` | integer | counts from 2014 to 2025; the rates are `podiums / starts` and `wins / starts` |
| `circuits` | array of `CircuitHistory` | one per Jolpica circuit id in `JOLPICA_TO_F1DB` |
| `circuits[].circuit_id` | string | Jolpica circuit id |
| `circuits[].races` | integer | championship races held there, all years to 2025 |
| `circuits[].last_held` | integer or null | last season held, up to 2025; `null` for a new circuit |
| `circuits[].safety_car_races` | integer or null | races with a full safety car; always `null` today (f1db has no such data) |
| `circuits[].safety_car_seasons` | array of integers | seasons covered by `safety_car_races`; always empty today |
| `circuits[].safety_car_source` | string or null | where those came from; always `null` today |

```jsonc
{
  "circuits": [
    {
      "circuit_id": "albert_park",
      "last_held": 2025,
      "races": 28,
      "safety_car_races": null,
      "safety_car_seasons": [],
      "safety_car_source": null
    },
    // ... 25 more circuits, including
    // { "circuit_id": "madring", "last_held": null, "races": 0, ... }
  ],
  "grid_slots": [
    { "podiums": 2, "slot": 0, "starts": 114, "wins": 0 },
    { "podiums": 204, "slot": 1, "starts": 251, "wins": 135 },
    { "podiums": 181, "slot": 2, "starts": 250, "wins": 59 }
    // ... slots 3 to 22
  ],
  "seasons": [2014, 2025],
  "source": "f1db v2026.15.1"
}
```

### `priors/engines-2026.json`

Built by `python -m race_calls.facts.engines` (`write_engines` in
[`facts/engines.py`](../pipeline/src/race_calls/facts/engines.py)) from f1db's entrant
data, and read by `load_engines`.

| Field | Type | Meaning |
|---|---|---|
| `source` | string | the f1db release it came from |
| `season` | integer | `2026` |
| `engines` | object | Jolpica constructor id to power unit maker name |
| `notes` | array of strings | one line per constructor that changed engine during the season; empty today |

```jsonc
{
  "engines": {
    "alpine": "Mercedes",
    "aston_martin": "Honda",
    "audi": "Audi",
    "cadillac": "Ferrari",
    "ferrari": "Ferrari",
    "haas": "Ferrari",
    "mclaren": "Mercedes",
    "mercedes": "Mercedes",
    "rb": "Red Bull Ford",
    "red_bull": "Red Bull Ford",
    "williams": "Mercedes"
  },
  "notes": [],
  "season": 2026,
  "source": "f1db v2026.15.1"
}
```

### `priors/circuit-traits.json`

Edited by hand and read by `load_traits` in
[`facts/tracks.py`](../pipeline/src/race_calls/facts/tracks.py), which rejects an unknown
trait or a circuit without 1 to 3 distinct traits. The traits are this project's own
judgement, not data from any source, and the snapshot says so whenever it uses them.

| Field | Type | Meaning |
|---|---|---|
| `version` | integer | format version, `1` |
| `reviewed` | date string | when the list was last reviewed |
| `note` | string | how the traits were chosen |
| `circuits` | object | Jolpica circuit id to `{ traits, reason }` |
| `circuits.<id>.traits` | array of 1 to 3 strings | from `high_altitude`, `long_straights`, `street`, `high_downforce`, `high_speed_corners`, `hot` |
| `circuits.<id>.reason` | string | one sentence justifying the tags |

```jsonc
{
  "version": 1,
  "reviewed": "2026-09-28",
  "note": "Circuit traits are this project's own judgement, not data from any source. Only well-established traits are listed (1 to 3 per circuit); when unsure, a trait is left off. Keyed by Jolpica circuit id.",
  "circuits": {
    "albert_park": {
      "traits": ["street"],
      "reason": "Temporary circuit on public park roads around Albert Park lake."
    },
    "baku": {
      "traits": ["street", "long_straights"],
      "reason": "City street circuit with a flat-out run of about 2 km to the finish line."
    },
    "madring": {
      "traits": ["street"],
      "reason": "New semi-street circuit around the IFEMA area of Madrid."
    }
    // ... 21 more circuits
  }
}
```

## Contracts

The pipeline (Python) writes the records and the site (TypeScript) reads them, so the
two sides have to agree on the shape. [`contracts/`](../contracts/) holds that agreement,
and tests on both sides fail if either one drifts.

| File | What it is | Kept current by |
|---|---|---|
| [`prediction-record.schema.json`](../contracts/prediction-record.schema.json) | JSON Schema generated from `PredictionRecord` | `python -m race_calls.contracts` ([`contracts.py`](../pipeline/src/race_calls/contracts.py)) |
| [`score-record.schema.json`](../contracts/score-record.schema.json) | JSON Schema generated from `ScoreRecord` | the same command |
| [`prediction-record.example.json`](../contracts/prediction-record.example.json) | a hand-written, clearly labelled example (round 99, "Example Grand Prix", three drivers) | by hand |
| [`score-record.example.json`](../contracts/score-record.example.json) | the example prediction scored by the real scorer | `uv run python tests/test_score.py` (its `__main__` block) |

The tests that keep both sides in sync:

- [`pipeline/tests/test_models.py`](../pipeline/tests/test_models.py):
  - `test_example_record_matches_the_contract_and_the_schema_is_current` loads the
    example prediction into `PredictionRecord` (so it must be valid) and compares the
    committed schema with `PredictionRecord.model_json_schema()`. A model change without a
    regenerated schema fails with "regenerate with: uv run python -m race_calls.contracts".
  - `test_the_score_schema_is_current` does the same for `ScoreRecord`.
- [`pipeline/tests/test_score.py`](../pipeline/tests/test_score.py):
  `test_the_committed_example_is_what_the_scorer_writes` scores the example prediction
  with `score_prediction` and requires the result to equal `score-record.example.json`
  exactly, and checks every contender has exactly the six `ContenderScore` fields. So the
  score example is real scorer output, not a hand-written guess.
- [`web/src/data/scores.contract.test.ts`](../web/src/data/scores.contract.test.ts): the
  site's `isScoreRecord` must accept `score-record.example.json`, and `parseScores` must
  return one record from it.
- The site's other tests (for example `record.test.ts`, `load.test.ts`, and
  [`web/plugins/predictions.test.ts`](../web/plugins/predictions.test.ts)) read
  `prediction-record.example.json` directly, so a change to the prediction format that
  the site cannot read fails there. What the site keeps from each record at build time is
  described in [site.md](site.md).

The chain is: change a model, regenerate the schema, update or regenerate the example,
and both test suites confirm the other side still understands it.
