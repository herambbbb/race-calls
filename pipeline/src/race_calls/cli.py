from collections.abc import Callable
from datetime import datetime
from typing import Any

import typer

from race_calls.cache import JsonCache
from race_calls.chaos import ChaosUnavailable, actual_chaos
from race_calls.facts.engines import load_engines
from race_calls.facts.pace import qualifying_laps
from race_calls.facts.tracks import load_traits
from race_calls.http import make_client
from race_calls.jev import PATIENT, JevClient, RetryPolicy
from race_calls.jolpica import JolpicaClient
from race_calls.models import Kind, PredictionRecord, SessionWeather, Status, Weekend
from race_calls.openf1.client import LiveSessionLockout, OpenF1Client
from race_calls.openf1.sessions import find_session, weather_summary
from race_calls.postrace import score_weekend, scoring_due
from race_calls.predict import (
    GIVE_UP_BEFORE_START,
    Action,
    FactSources,
    RecordExists,
    due,
    existing_record,
    gather,
    kind_for,
    make_prediction,
    no_prediction_record,
    retry_until,
    utc_now,
    write_record,
)
from race_calls.priors import load_priors
from race_calls.score import NotScorable, ScoreExists
from race_calls.settings import get_settings

app = typer.Typer(help="race-calls: timestamped race predictions from Jev.", no_args_is_help=True)


def _on_retry(attempt: int, attempts: int, problem: str, wait: float) -> None:
    typer.echo(f"  Jev attempt {attempt}/{attempts} failed ({problem}); waiting {wait:.0f}s")


def _weather_lookup(openf1: OpenF1Client) -> Callable[[Weekend], SessionWeather | None]:
    def lookup(weekend: Weekend) -> SessionWeather | None:
        if weekend.qualifying_start is None:
            return None
        key = find_session(openf1, weekend.season, "Qualifying", weekend.qualifying_start)
        return weather_summary(openf1, key) if key is not None else None

    return lookup


def _laps_lookup(openf1: OpenF1Client) -> Callable[[Weekend], list[dict[str, Any]]]:
    def lookup(weekend: Weekend) -> list[dict[str, Any]]:
        if weekend.qualifying_start is None:
            return []
        key = find_session(openf1, weekend.season, "Qualifying", weekend.qualifying_start)
        return qualifying_laps(openf1, key) if key is not None else []

    return lookup


class Context:
    def __init__(self) -> None:
        settings = get_settings()
        cache = JsonCache(settings.data_dir / "cache")
        self.settings = settings
        self.jolpica = JolpicaClient(cache=cache)
        openf1 = OpenF1Client(make_client(), cache=cache)
        self.openf1 = openf1
        self.weather = _weather_lookup(openf1)
        self.facts = FactSources(load_engines(), load_traits(), laps=_laps_lookup(openf1))
        self.priors = load_priors()

    def done(self, weekend: Weekend) -> bool:
        record = existing_record(self.settings.predictions_dir, weekend)
        return record is not None and record.status is not Status.FAILED

    def score(self, weekend: Weekend, record: PredictionRecord, force: bool = False) -> bool:
        """Score one race. False (and a reason) if the data is not in yet."""
        try:
            path = score_weekend(
                self.jolpica,
                lambda w, result: actual_chaos(self.openf1, w, result),
                weekend,
                record,
                self.priors,
                self.settings.predictions_dir,
                self.settings.scores_dir,
                utc_now(),
                force=force,
            )
        except (ChaosUnavailable, LiveSessionLockout) as error:
            typer.echo(f"Round {weekend.round}: race-control data not available yet ({error}).")
            return False
        except (NotScorable, ScoreExists) as error:
            typer.echo(f"Round {weekend.round}: {error}")
            return False
        except ValueError as error:
            # An unusual classification (no full podium) needs a person, but must not stop
            # the other races due in the same run from being scored.
            typer.echo(f"Round {weekend.round}: cannot score yet, needs a look: {error}")
            return False
        if path is None:
            typer.echo(f"Round {weekend.round}: the official result is not published yet.")
            return False
        typer.echo(f"Round {weekend.round}: scored -> {path.name}")
        return True

    def predict(self, calendar: list[Weekend], weekend: Weekend, retry: RetryPolicy) -> bool:
        """Predict one race and save it. False if qualifying is not published yet."""
        inputs = gather(
            self.jolpica, calendar, weekend, self.priors, utc_now(), self.weather, self.facts
        )
        if inputs is None:
            typer.echo(f"Round {weekend.round}: qualifying results are not published yet.")
            return False
        for note in inputs.notes:
            typer.echo(f"  note: {note}")
        client = JevClient(retry=retry, on_retry=_on_retry)
        record = make_prediction(
            weekend, inputs.snapshot, inputs.qualifying, client, extra={"notes": list(inputs.notes)}
        )
        path = write_record(self.settings.predictions_dir, weekend, record)
        _summary(record, str(path.relative_to(self.settings.predictions_dir.parent)))
        return True


def _summary(record: PredictionRecord, where: str) -> None:
    typer.echo(
        f"Round {record.round} {record.race_name}: {record.status} ({record.kind}) -> {where}"
    )
    if record.error:
        typer.echo(f"  error: {record.error}")
    if record.late:
        typer.echo("  LATE: made after the scheduled start; it will not be scored.")
    if record.calls and record.jev:
        w = record.calls.winner
        podium_sum = sum(record.calls.podium.values())
        typer.echo(
            f"  winner {w.choice} {w.probabilities.get(w.choice, 0):.0%}, chaos "
            f"{record.calls.chaos.score:.2f}, podium sum {podium_sum:.2f}; "
            f"{record.jev.model_id}, {_cost(record.jev.cost_usd)}, "
            f"{record.jev.input_tokens} in / {record.jev.output_tokens} out tokens, "
            f"{record.jev.latency_ms} ms"
        )


def _cost(cost_usd: float | None) -> str:
    # TypeSafe's own API reports tokens but no cost; OpenRouter reports both.
    return "cost not reported" if cost_usd is None else f"${cost_usd:.6f}"


def _parse_now(now: str | None) -> datetime:
    if now is None:
        return utc_now()
    parsed = datetime.fromisoformat(now)
    if parsed.tzinfo is None:
        raise typer.BadParameter("--now must include a timezone, e.g. 2026-10-03T10:00Z")
    return parsed


@app.command()
def predict(
    season: int = typer.Option(..., help="Season, e.g. 2026"),
    round: int = typer.Option(..., "--round", help="Round number"),
) -> None:
    """Predict one race now (the manual fallback). Records are final once saved."""
    ctx = Context()
    calendar = ctx.jolpica.calendar(season)
    weekend = next((w for w in calendar if w.round == round), None)
    if weekend is None:
        raise typer.BadParameter(f"no round {round} in {season}")
    if ctx.done(weekend):
        typer.echo(f"Round {round} already has a final record; nothing to do.")
        raise typer.Exit(0)
    if kind_for(weekend) is Kind.LIVE and utc_now() >= weekend.race_start:
        typer.echo("Warning: the race has started; this prediction will be marked late.")
    if not ctx.predict(calendar, weekend, PATIENT):
        raise typer.Exit(1)


@app.command()
def prerace(
    season: int | None = typer.Option(None, help="Season (default: the current year)"),
    now: str | None = typer.Option(None, help="Pretend it is this UTC time (testing)"),
) -> None:
    """The hourly job: predict any race whose qualifying is over, or give up an hour out."""
    ctx = Context()
    moment = _parse_now(now)
    calendar = ctx.jolpica.calendar(season or moment.year)
    todo = due(calendar, moment, ctx.done)
    if not todo:
        typer.echo("Nothing due.")
    for item in todo:
        w = item.weekend
        try:
            if item.action is Action.GIVE_UP:
                path = write_record(
                    ctx.settings.predictions_dir, w, no_prediction_record(w, moment)
                )
                typer.echo(f"Round {w.round}: no prediction (gave up an hour out) -> {path.name}")
            else:
                deadline = w.race_start - GIVE_UP_BEFORE_START
                ctx.predict(calendar, w, retry_until(deadline, moment))
        except RecordExists as error:
            typer.echo(f"Round {w.round}: {error}")


@app.command()
def backtest(
    season: int = typer.Option(2026, help="Season"),
    first: int = typer.Option(1, help="First round"),
    last: int = typer.Option(14, help="Last round"),
) -> None:
    """Dry-run past rounds (the model may have seen them). One Jev request per round."""
    ctx = Context()
    calendar = ctx.jolpica.calendar(season)
    for w in calendar:
        if not first <= w.round <= last:
            continue
        if kind_for(w) is not Kind.BACKTEST:
            typer.echo(f"Round {w.round} is after the model date; skipping (it is live).")
            continue
        if ctx.done(w):
            typer.echo(f"Round {w.round}: already done.")
            continue
        ctx.predict(calendar, w, PATIENT)


@app.command()
def score(
    season: int = typer.Option(..., help="Season, e.g. 2026"),
    round: int = typer.Option(..., "--round", help="Round number"),
    force: bool = typer.Option(False, help="Rescore, replacing an existing score"),
) -> None:
    """Score one race's saved prediction against the official result."""
    ctx = Context()
    weekend = ctx.jolpica.weekend(season, round)
    record = existing_record(ctx.settings.predictions_dir, weekend)
    if record is None:
        raise typer.BadParameter(f"no prediction saved for {season} round {round}")
    if not ctx.score(weekend, record, force=force):
        raise typer.Exit(1)


@app.command()
def postrace(
    season: int | None = typer.Option(None, help="Season (default: the current year)"),
    now: str | None = typer.Option(None, help="Pretend it is this UTC time (testing)"),
) -> None:
    """The hourly job: score every live race whose result is official."""
    ctx = Context()
    moment = _parse_now(now)
    calendar = ctx.jolpica.calendar(season or moment.year)
    todo = scoring_due(calendar, moment, ctx.settings.predictions_dir, ctx.settings.scores_dir)
    if not todo:
        typer.echo("Nothing due.")
    for item in todo:
        ctx.score(item.weekend, item.record)


@app.command("score-backtests")
def score_backtests(
    season: int = typer.Option(2026, help="Season"),
    first: int = typer.Option(1, help="First round"),
    last: int = typer.Option(14, help="Last round"),
    force: bool = typer.Option(False, help="Rescore, replacing existing scores"),
) -> None:
    """Score the backtests (never on the leaderboard; the model may have seen them)."""
    ctx = Context()
    for w in ctx.jolpica.calendar(season):
        if not first <= w.round <= last:
            continue
        record = existing_record(ctx.settings.predictions_dir, w)
        if record is None or record.kind is not Kind.BACKTEST:
            typer.echo(f"Round {w.round}: no backtest saved.")
            continue
        ctx.score(w, record, force=force)


@app.command()
def priors() -> None:
    """Download the pinned f1db release and rebuild priors/priors.json."""
    from race_calls.priors import main

    main()
