"""Making, saving, and scheduling predictions (tasks 2.3 and 4.1).

A record is written once. It may only be replaced while it is a failure (Jev was
unreachable), so the next hourly run can try again; an ok or no-prediction record is
final. A live call made at or after the scheduled start is marked late and never scored.
"""

import json
from collections.abc import Callable, Iterable, Sequence
from dataclasses import dataclass
from datetime import UTC, date, datetime, timedelta
from enum import StrEnum
from pathlib import Path
from typing import Protocol

from race_calls.jev import PATIENT, JevClient, JevError, RetryPolicy, request_hash
from race_calls.models import (
    JevMeta,
    Kind,
    PredictionRecord,
    Priors,
    QualifyingEntry,
    RaceResult,
    RecordDriver,
    SessionWeather,
    Snapshot,
    Standings,
    Status,
    Weekend,
    model_date,
)
from race_calls.questions import AnswerError, build_questions, parse_calls
from race_calls.snapshot import RECENT_RACES, build_snapshot

# The version OpenRouter reported on 2026-09-26. Races on or before it are backtests.
KNOWN_MODEL_DATE = date(2026, 9, 17)
GIVE_UP_BEFORE_START = timedelta(hours=1)
QUALIFYING_LENGTH = timedelta(hours=1)
BACKTEST_NOTE = "Backtest: the model may have seen these results."
NO_DATA_NOTE = "No prediction for this race: qualifying data did not arrive in time."


def utc_now() -> datetime:
    return datetime.now(UTC)


class RecordExists(RuntimeError):
    pass


def kind_for(weekend: Weekend, model_id: str | None = None) -> Kind:
    cutoff = model_date(model_id) or KNOWN_MODEL_DATE
    return Kind.BACKTEST if weekend.race_start.date() <= cutoff else Kind.LIVE


def record_path(predictions_dir: Path, weekend: Weekend, kind: Kind) -> Path:
    folder = "backtest" if kind is Kind.BACKTEST else str(weekend.season)
    return predictions_dir / folder / f"{weekend.file_stem}.json"


def existing_record(predictions_dir: Path, weekend: Weekend) -> PredictionRecord | None:
    for kind in (Kind.LIVE, Kind.BACKTEST):
        path = record_path(predictions_dir, weekend, kind)
        if path.exists():
            return PredictionRecord.model_validate_json(path.read_text())
    return None


def write_record(predictions_dir: Path, weekend: Weekend, record: PredictionRecord) -> Path:
    path = record_path(predictions_dir, weekend, record.kind)
    if path.exists():
        old = PredictionRecord.model_validate_json(path.read_text())
        if old.status is not Status.FAILED:
            raise RecordExists(f"{path} already holds a {old.status} record; records are final")
    path.parent.mkdir(parents=True, exist_ok=True)
    text = json.dumps(record.model_dump(mode="json"), indent=2, ensure_ascii=False) + "\n"
    tmp = path.with_suffix(".tmp")
    tmp.write_text(text)
    tmp.replace(path)
    return path


def _drivers(snapshot: Snapshot, qualifying: Sequence[QualifyingEntry]) -> tuple[RecordDriver, ...]:
    by_code = {q.driver.code: q for q in qualifying}
    out = []
    for fact in snapshot.drivers:
        q = by_code[fact.code]
        out.append(
            RecordDriver(
                code=fact.code,
                name=fact.name,
                number=q.driver.number,
                constructor=fact.constructor,
                constructor_id=q.constructor.constructor_id,
                grid=fact.grid,
            )
        )
    return tuple(out)


def _base(weekend: Weekend, kind: Kind, status: Status, made_at: datetime) -> dict[str, object]:
    return {
        "season": weekend.season,
        "round": weekend.round,
        "slug": weekend.slug,
        "race_name": weekend.name,
        "circuit_name": weekend.circuit_name,
        "race_start": weekend.race_start,
        "kind": kind,
        "status": status,
        "made_at": made_at,
        # A backtest is made after its race by design; "late" is about live calls only.
        "late": kind is Kind.LIVE and made_at >= weekend.race_start,
    }


def no_prediction_record(weekend: Weekend, made_at: datetime) -> PredictionRecord:
    return PredictionRecord.model_validate(
        _base(weekend, kind_for(weekend), Status.NO_PREDICTION, made_at) | {"note": NO_DATA_NOTE}
    )


def make_prediction(
    weekend: Weekend,
    snapshot: Snapshot,
    qualifying: Sequence[QualifyingEntry],
    client: JevClient,
    clock: Callable[[], datetime] = utc_now,
    extra: dict[str, object] | None = None,
) -> PredictionRecord:
    """One Jev request for the whole race. Failures become a failed record, never a raise."""
    body = client.build_body(snapshot.text, build_questions(snapshot.drivers))
    common: dict[str, object] = {
        "grid_provisional": snapshot.grid_provisional,
        "drivers": _drivers(snapshot, qualifying),
        "snapshot_text": snapshot.text,
        "request": body,
        "request_hash": request_hash(body),
        "extra": {"snapshot": snapshot.model_dump(mode="json"), **(extra or {})},
    }
    try:
        response = client.send(body)
    except JevError as error:
        kind = kind_for(weekend)
        return PredictionRecord.model_validate(
            _base(weekend, kind, Status.FAILED, clock()) | common | {"error": str(error)}
        )

    kind = kind_for(weekend, response.model_id)
    meta = JevMeta(
        url=client.url,
        model_requested=client.model,
        model_id=response.model_id,
        provider=response.provider,
        generation_id=response.generation_id,
        cost_usd=response.cost_usd,
        input_tokens=response.input_tokens,
        output_tokens=response.output_tokens,
        latency_ms=response.latency_ms,
        requested_at=response.requested_at,
    )
    common |= {"response": response.body, "jev": meta}
    if kind is Kind.BACKTEST:
        common["note"] = BACKTEST_NOTE
    try:
        calls = parse_calls(response.body["answers"], [d.code for d in snapshot.drivers])
    except AnswerError as error:
        return PredictionRecord.model_validate(
            _base(weekend, kind, Status.FAILED, clock()) | common | {"error": str(error)}
        )
    return PredictionRecord.model_validate(
        _base(weekend, kind, Status.OK, clock()) | common | {"calls": calls}
    )


def retry_until(deadline: datetime, now: datetime, policy: RetryPolicy = PATIENT) -> RetryPolicy:
    """The patient policy, cut short so the waits alone never run past the deadline."""
    budget = (deadline - now).total_seconds()
    delays: list[float] = []
    for delay in policy.delays:
        if sum(delays) + delay > budget:
            break
        delays.append(delay)
    return RetryPolicy(tuple(delays))


# --- Gathering inputs --------------------------------------------------------------------


class RaceData(Protocol):
    def calendar(self, season: int) -> list[Weekend]: ...
    def qualifying(self, season: int, round: int) -> list[QualifyingEntry]: ...
    def results(self, season: int, round: int) -> RaceResult | None: ...
    def sprint(self, season: int, round: int) -> RaceResult | None: ...
    def standings(self, season: int, after_round: int) -> Standings | None: ...


WeatherLookup = Callable[[Weekend], SessionWeather | None]


@dataclass(frozen=True)
class Inputs:
    weekend: Weekend
    qualifying: list[QualifyingEntry]
    snapshot: Snapshot
    notes: tuple[str, ...]


def gather(
    data: RaceData,
    calendar: Sequence[Weekend],
    weekend: Weekend,
    priors: Priors,
    built_at: datetime,
    weather: WeatherLookup | None = None,
) -> Inputs | None:
    """Everything known after qualifying, or None if qualifying is not published yet."""
    qualifying = data.qualifying(weekend.season, weekend.round)
    if not qualifying:
        return None
    previous = [
        r
        for rnd in range(weekend.round - 1, max(0, weekend.round - 1 - RECENT_RACES), -1)
        if (r := data.results(weekend.season, rnd)) is not None
    ]
    standings = data.standings(weekend.season, weekend.round - 1)
    sprint = data.sprint(weekend.season, weekend.round) if weekend.is_sprint else None
    notes: list[str] = []
    session_weather = None
    if weather is not None:
        try:
            session_weather = weather(weekend)
        except Exception as error:  # weather is optional; a lookup failure must not block
            notes.append(f"qualifying weather unavailable: {type(error).__name__}: {error}")
    snapshot = build_snapshot(
        weekend=weekend,
        calendar=calendar,
        qualifying=qualifying,
        standings=standings,
        previous=previous,
        priors=priors,
        built_at=built_at,
        sprint=sprint,
        qualifying_weather=session_weather,
    )
    return Inputs(weekend, qualifying, snapshot, tuple(notes))


# --- The hourly pre-race decision (task 4.1) ---------------------------------------------


class Action(StrEnum):
    TRY = "try"  # qualifying is over: predict if the data is in
    GIVE_UP = "give_up"  # within an hour of the start and still nothing: no prediction


@dataclass(frozen=True)
class Due:
    weekend: Weekend
    action: Action


def due(calendar: Iterable[Weekend], now: datetime, done: Callable[[Weekend], bool]) -> list[Due]:
    """Live races whose qualifying is over, whose start is ahead, and with no final record."""
    out = []
    for w in calendar:
        if w.qualifying_start is None or kind_for(w) is Kind.BACKTEST:
            continue
        if not (w.qualifying_start + QUALIFYING_LENGTH <= now < w.race_start) or done(w):
            continue
        give_up = now >= w.race_start - GIVE_UP_BEFORE_START
        out.append(Due(w, Action.GIVE_UP if give_up else Action.TRY))
    return out
