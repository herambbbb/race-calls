"""Scoring a saved prediction against the official result (tasks 3.2 and 3.3).

Jev and the two baselines are scored identically on the drivers in the prediction:
- podium Brier: the mean over those drivers of (p - finished in the top three)^2, using the
  podium probabilities exactly as given (never normalised);
- winner log loss and hit, from each side's win distribution;
- podium pick: each side's three most likely podium finishers, and how many made it;
- chaos error: |called - actual| for Jev; the baselines make no chaos call.

Baselines:
- grid: the 2014 to 2025 top-three and win rates of each driver's starting slot (f1db);
- form: each driver's top-three and win rates over the last three races before this one,
  smoothed with one pseudo-race at the average rate (3 of N for a podium, 1 of N for a win),
  so a driver with no history gets the average rather than zero.
"""

import json
from collections.abc import Mapping, Sequence
from datetime import datetime
from pathlib import Path

from race_calls.metrics import log_loss, mean_brier, top_pick
from race_calls.models import (
    ChaosActual,
    ContenderScore,
    Kind,
    PredictionRecord,
    Priors,
    RaceOutcome,
    RaceResult,
    ScoreChaos,
    ScoreRecord,
    Status,
)

FORM_RACES = 3
CONTENDERS = ("jev", "grid", "form")


class NotScorable(ValueError):
    """The prediction is late, failed, or missing its calls; it is never scored."""


def outcome(result: RaceResult) -> RaceOutcome:
    ordered = sorted(result.entries, key=lambda e: e.position)
    podium = tuple(e.driver.code for e in ordered if e.classified and e.position <= 3)
    if len(podium) != 3:
        raise ValueError(f"round {result.round}: the classification has no full podium")
    return RaceOutcome(
        winner=podium[0],
        podium=podium,
        finish={e.driver.code: e.position_text for e in ordered},
    )


def podium_pick(
    probs: Mapping[str, float], tiebreak: Mapping[str, int] | None = None
) -> tuple[str, ...]:
    """The three most likely; ties go to the better grid slot if given, then the code."""
    rank = tiebreak or {}
    return tuple(sorted(probs, key=lambda c: (-probs[c], rank.get(c, 99), c))[:3])


def normalise(weights: Mapping[str, float]) -> dict[str, float]:
    total = sum(max(0.0, w) for w in weights.values())
    if total <= 0:
        return {c: 1 / len(weights) for c in weights} if weights else {}
    return {c: max(0.0, w) / total for c, w in weights.items()}


def contender_score(
    podium_probs: Mapping[str, float],
    win_probs: Mapping[str, float],
    result: RaceOutcome,
    chaos_call: float | None,
    chaos_actual: int,
    tiebreak: Mapping[str, int] | None = None,
) -> ContenderScore:
    on_podium = set(result.podium)
    pick = podium_pick(podium_probs, tiebreak)
    return ContenderScore(
        podium_brier=mean_brier((p, code in on_podium) for code, p in podium_probs.items()),
        winner_log_loss=log_loss(win_probs, result.winner),
        winner_hit=bool(win_probs) and top_pick(win_probs) == result.winner,
        podium_pick=pick,
        podium_hits=len(set(pick) & on_podium),
        chaos_error=None if chaos_call is None else abs(chaos_call - chaos_actual),
    )


def grid_baseline(
    record: PredictionRecord, priors: Priors
) -> tuple[dict[str, float], dict[str, float]]:
    podium, win = {}, {}
    for d in record.drivers:
        slot = priors.slot(d.grid)
        podium[d.code] = slot.podium_rate if slot else 0.0
        win[d.code] = slot.win_rate if slot else 0.0
    return podium, normalise(win)


def form_baseline(
    record: PredictionRecord, previous: Sequence[RaceResult]
) -> tuple[dict[str, float], dict[str, float]]:
    recent = sorted(
        (r for r in previous if r.season == record.season and r.round < record.round),
        key=lambda r: r.round,
        reverse=True,
    )[:FORM_RACES]
    n_drivers = len(record.drivers)
    podium, win = {}, {}
    for d in record.drivers:
        mine = [e for r in recent for e in r.entries if e.driver.code == d.code]
        top3 = sum(1 for e in mine if e.classified and e.position <= 3)
        wins = sum(1 for e in mine if e.classified and e.position == 1)
        podium[d.code] = (top3 + 3 / n_drivers) / (len(mine) + 1)
        win[d.code] = (wins + 1 / n_drivers) / (len(mine) + 1)
    return podium, normalise(win)


def score_prediction(
    record: PredictionRecord,
    prediction_path: str,
    result: RaceResult,
    previous: Sequence[RaceResult],
    priors: Priors,
    chaos: ChaosActual,
    scored_at: datetime,
) -> ScoreRecord:
    if record.status is not Status.OK or record.calls is None:
        raise NotScorable(f"round {record.round}: the prediction is {record.status}")
    if record.late:
        raise NotScorable(f"round {record.round}: the prediction was late; it is never scored")
    if result.season != record.season or result.round != record.round:
        raise ValueError("the result is for a different race")
    if record.kind is Kind.LIVE and chaos.lights_out and record.made_at >= chaos.lights_out:
        raise NotScorable(
            f"round {record.round}: the prediction was made after the real lights out "
            f"({chaos.lights_out:%Y-%m-%d %H:%M}Z); it is never scored"
        )

    actual = outcome(result)
    grid_rank = {d.code: d.grid for d in record.drivers}
    calls = record.calls
    grid_podium, grid_win = grid_baseline(record, priors)
    form_podium, form_win = form_baseline(record, previous)
    scores = {
        # Jev's pick ties break by code, as the site shows them.
        "jev": contender_score(
            calls.podium, calls.winner.probabilities, actual, calls.chaos.score, chaos.actual
        ),
        "grid": contender_score(grid_podium, grid_win, actual, None, chaos.actual, grid_rank),
        "form": contender_score(form_podium, form_win, actual, None, chaos.actual, grid_rank),
    }
    return ScoreRecord(
        season=record.season,
        round=record.round,
        kind=record.kind,
        scored_at=scored_at,
        prediction=prediction_path,
        result=actual,
        chaos=ScoreChaos(actual=chaos.actual, reason=chaos.reason),
        scores=scores,
        details={
            "chaos_inputs": chaos.inputs.model_dump(mode="json"),
            # Race control's real lights out: the late-call check can be audited from here.
            "lights_out": chaos.lights_out.isoformat() if chaos.lights_out else None,
            "podium_sum": round(sum(calls.podium.values()), 4),
            "win_above_podium": sorted(
                c for c, p in calls.winner.probabilities.items() if p > calls.podium.get(c, 0.0)
            ),
            "baselines": {
                "grid": f"top-three and win rates by starting slot, {priors.source}, "
                f"{priors.seasons[0]} to {priors.seasons[1]}",
                "form": f"last {FORM_RACES} races, smoothed with one pseudo-race at the average",
            },
            "unscored_finishers": sorted(set(actual.finish) - set(grid_rank)),
        },
    )


def score_path(scores_dir: Path, record: PredictionRecord) -> Path:
    folder = "backtest" if record.kind is Kind.BACKTEST else str(record.season)
    return scores_dir / folder / f"{record.round:02d}-{record.slug}.json"


class ScoreExists(RuntimeError):
    pass


def write_score(
    scores_dir: Path, record: PredictionRecord, score: ScoreRecord, force: bool = False
) -> Path:
    path = score_path(scores_dir, record)
    if path.exists() and not force:
        raise ScoreExists(f"{path} exists; pass --force to rescore")
    path.parent.mkdir(parents=True, exist_ok=True)
    text = json.dumps(score.model_dump(mode="json"), indent=2, ensure_ascii=False) + "\n"
    tmp = path.with_suffix(".tmp")
    tmp.write_text(text)
    tmp.replace(path)
    return path
