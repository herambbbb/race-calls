"""The post-race job (task 4.2): score each live race once its result is official.

A race is due three hours after its scheduled start, when it has an on-time live
prediction and no score yet. Until the result is on Jolpica and the race-control data is
on OpenF1, the job reports "waiting" and the next hourly run tries again.
"""

from collections.abc import Callable, Iterable
from dataclasses import dataclass
from datetime import datetime, timedelta
from pathlib import Path

from race_calls.models import (
    ChaosActual,
    Kind,
    PredictionRecord,
    Priors,
    RaceResult,
    Status,
    Weekend,
)
from race_calls.predict import RaceData, existing_record, record_path
from race_calls.score import score_path, score_prediction, write_score

SCORE_AFTER = timedelta(hours=3)

ChaosLookup = Callable[[Weekend, RaceResult], ChaosActual]


@dataclass(frozen=True)
class Scorable:
    weekend: Weekend
    record: PredictionRecord


def scoring_due(
    calendar: Iterable[Weekend],
    now: datetime,
    predictions_dir: Path,
    scores_dir: Path,
) -> list[Scorable]:
    out = []
    for w in calendar:
        if now < w.race_start + SCORE_AFTER:
            continue
        record = existing_record(predictions_dir, w)
        if record is None or record.kind is not Kind.LIVE:
            continue
        if record.status is not Status.OK or record.late:
            continue  # published, never scored
        if score_path(scores_dir, record).exists():
            continue
        out.append(Scorable(w, record))
    return out


def score_weekend(
    data: RaceData,
    chaos: ChaosLookup,
    weekend: Weekend,
    record: PredictionRecord,
    priors: Priors,
    predictions_dir: Path,
    scores_dir: Path,
    now: datetime,
    force: bool = False,
) -> Path | None:
    """Write the score; None if the official result is not published yet."""
    result = data.results(weekend.season, weekend.round)
    if result is None:
        return None
    previous = [
        r
        for rnd in range(weekend.round - 1, 0, -1)
        if (r := data.results(weekend.season, rnd)) is not None
    ]
    prediction_path = record_path(predictions_dir, weekend, record.kind)
    score = score_prediction(
        record,
        str(prediction_path.relative_to(predictions_dir.parent)),
        result,
        previous,
        priors,
        chaos(weekend, result),
        now,
    )
    return write_score(scores_dir, record, score, force=force)
