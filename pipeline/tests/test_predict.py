import json
from datetime import UTC, datetime, timedelta

import httpx
import pytest
import respx
from test_snapshot import BAHRAIN, CALENDAR, PREVIOUS, PRIORS, QUALI, STANDINGS, build

from race_calls.jev import OPENROUTER_URL, JevClient, RetryPolicy
from race_calls.models import Kind, PredictionRecord, Status
from race_calls.predict import (
    BACKTEST_NOTE,
    Action,
    RecordExists,
    due,
    existing_record,
    gather,
    kind_for,
    make_prediction,
    no_prediction_record,
    record_path,
    retry_until,
    write_record,
)
from race_calls.settings import Settings

SECRET = "test-secret-key-do-not-leak"
BEFORE = datetime(2026, 10, 3, 10, tzinfo=UTC)


def client(max_attempts: int = 1) -> JevClient:
    # OpenRouter's response carries cost and a dated model; TypeSafe's is covered in test_cli.
    settings = Settings(_env_file=None, openrouter_api_key=SECRET, jev_transport="openrouter")
    return JevClient(settings, http=httpx.Client(), sleep=lambda _: None, max_attempts=max_attempts)


def answers(podium_ver: float = 0.5) -> dict:
    return {
        "podium_NOR": {"type": "noul", "noul": 0.61},
        "podium_VER": {"type": "noul", "noul": podium_ver},
        "podium_PIA": {"type": "noul", "noul": 0.3},
        "winner": {
            "type": "choice",
            "choice": "NOR",
            "confidence": 0.08,
            "probabilities": {"NOR": 0.5, "VER": 0.3, "PIA": 0.2},
        },
        "chaos": {"type": "score", "score": 1.28, "confidence": 0.7, "legend": {}},
    }


def ok(body_answers: dict | None = None, model: str = "typesafe/jev-1.13-20260917"):
    return httpx.Response(
        200,
        json={
            "model": model,
            "provider": "TypeSafe",
            "id": "gen-dec-1",
            "usage": {"input_tokens": 1500, "output_tokens": 300, "cost": 3.5e-05},
            "answers": body_answers or answers(),
        },
    )


@respx.mock
def test_one_request_and_a_complete_record():
    route = respx.post(OPENROUTER_URL).mock(return_value=ok())
    record = make_prediction(BAHRAIN, build(), QUALI, client(), clock=lambda: BEFORE)
    assert route.call_count == 1
    sent = json.loads(route.calls[0].request.content)
    assert len(sent["questions"]) == len(QUALI) + 2
    assert record.status is Status.OK and record.kind is Kind.LIVE and not record.late
    assert record.calls is not None and record.calls.podium["NOR"] == 0.61
    assert record.jev is not None and record.jev.model_id == "typesafe/jev-1.13-20260917"
    assert (record.jev.cost_usd, record.jev.input_tokens, record.jev.output_tokens) == (
        3.5e-05,
        1500,
        300,
    )
    assert record.jev.provider == "TypeSafe" and record.jev.generation_id == "gen-dec-1"
    assert record.request == sent and record.request_hash and len(record.request_hash) == 64
    assert [d.code for d in record.drivers] == ["NOR", "VER", "PIA"]
    assert record.drivers[1].constructor_id == "red_bull"
    assert SECRET not in record.model_dump_json()


@respx.mock
def test_after_the_start_is_late():
    respx.post(OPENROUTER_URL).mock(return_value=ok())
    at_start = make_prediction(BAHRAIN, build(), QUALI, client(), clock=lambda: BAHRAIN.race_start)
    assert at_start.late


@respx.mock
def test_unreachable_jev_is_a_failed_record_not_a_crash():
    respx.post(OPENROUTER_URL).mock(return_value=httpx.Response(503))
    record = make_prediction(BAHRAIN, build(), QUALI, client(), clock=lambda: BEFORE)
    assert record.status is Status.FAILED and record.calls is None
    assert "1 attempts" in (record.error or "") and record.request is not None


@respx.mock
def test_malformed_answers_are_a_failed_record_that_keeps_the_response():
    respx.post(OPENROUTER_URL).mock(return_value=ok(answers(podium_ver=1.7)))
    record = make_prediction(BAHRAIN, build(), QUALI, client(), clock=lambda: BEFORE)
    assert record.status is Status.FAILED and record.response is not None


@respx.mock
def test_a_race_before_the_model_date_is_a_backtest():
    respx.post(OPENROUTER_URL).mock(return_value=ok())
    old = BAHRAIN.model_copy(update={"race_start": datetime(2026, 9, 6, 13, tzinfo=UTC)})
    record = make_prediction(old, build(weekend=old), QUALI, client(), clock=lambda: BEFORE)
    assert record.kind is Kind.BACKTEST and record.note == BACKTEST_NOTE
    assert not record.late  # made long after the race, but a backtest is never "late"


def test_kind_follows_the_reported_model_date():
    assert kind_for(BAHRAIN) is Kind.LIVE
    assert kind_for(BAHRAIN, "typesafe/jev-1.14-20261010") is Kind.BACKTEST


@respx.mock
def test_records_are_final_except_failures(tmp_path):
    respx.post(OPENROUTER_URL).mock(side_effect=[httpx.Response(503), ok(), ok()])
    failed = make_prediction(BAHRAIN, build(), QUALI, client(), clock=lambda: BEFORE)
    path = write_record(tmp_path, BAHRAIN, failed)
    assert path == tmp_path / "2026" / "16-bahrain-grand-prix-in-malaysia.json"
    good = make_prediction(BAHRAIN, build(), QUALI, client(), clock=lambda: BEFORE)
    write_record(tmp_path, BAHRAIN, good)  # replacing a failure is allowed
    again = make_prediction(BAHRAIN, build(), QUALI, client(), clock=lambda: BEFORE)
    with pytest.raises(RecordExists):
        write_record(tmp_path, BAHRAIN, again)
    saved = existing_record(tmp_path, BAHRAIN)
    assert saved is not None and saved.status is Status.OK
    assert PredictionRecord.model_validate_json(path.read_text()) == good


def test_backtests_are_stored_apart(tmp_path):
    assert record_path(tmp_path, BAHRAIN, Kind.BACKTEST).parent.name == "backtest"


def test_no_prediction_record():
    record = no_prediction_record(BAHRAIN, BAHRAIN.race_start - timedelta(minutes=55))
    assert record.status is Status.NO_PREDICTION and record.calls is None and not record.late
    assert "did not arrive in time" in (record.note or "")


def test_due_windows():
    done = lambda w: False  # noqa: E731
    q_end = BAHRAIN.qualifying_start + timedelta(hours=1)  # type: ignore[operator]
    assert due([BAHRAIN], q_end - timedelta(minutes=1), done) == []
    [d] = due([BAHRAIN], q_end, done)
    assert d.action is Action.TRY
    [d] = due([BAHRAIN], BAHRAIN.race_start - timedelta(minutes=59), done)
    assert d.action is Action.GIVE_UP
    assert due([BAHRAIN], BAHRAIN.race_start, done) == []
    assert due([BAHRAIN], q_end, lambda w: True) == []


def test_due_skips_backtests():
    old = BAHRAIN.model_copy(
        update={
            "race_start": datetime(2026, 9, 6, 13, tzinfo=UTC),
            "qualifying_start": datetime(2026, 9, 5, 14, tzinfo=UTC),
        }
    )
    assert due([old], datetime(2026, 9, 5, 20, tzinfo=UTC), lambda w: False) == []


def test_retry_budget_never_runs_past_the_deadline():
    now = datetime(2026, 10, 3, 10, tzinfo=UTC)
    assert retry_until(now + timedelta(minutes=10), now).delays == (30, 60, 120, 240)
    assert retry_until(now, now) == RetryPolicy(())


class FakeData:
    def __init__(self, qualifying):
        self._qualifying = qualifying
        self.results_asked: list[int] = []

    def calendar(self, season):
        return CALENDAR

    def qualifying(self, season, round):
        return self._qualifying

    def results(self, season, round):
        self.results_asked.append(round)
        return next((r for r in PREVIOUS if r.round == round), None)

    def sprint(self, season, round):
        raise AssertionError("not a sprint weekend")

    def standings(self, season, after_round):
        assert after_round == 15
        return STANDINGS


def test_gather_asks_only_for_earlier_rounds():
    data = FakeData(QUALI)
    inputs = gather(data, CALENDAR, BAHRAIN, PRIORS, BEFORE)
    assert inputs is not None and data.results_asked == list(range(15, 0, -1))
    assert [d.code for d in inputs.snapshot.drivers] == ["NOR", "VER", "PIA"]


def test_gather_waits_for_qualifying():
    assert gather(FakeData([]), CALENDAR, BAHRAIN, PRIORS, BEFORE) is None


def test_a_weather_failure_does_not_block_the_prediction():
    def broken(_):
        raise RuntimeError("401 live session")

    inputs = gather(FakeData(QUALI), CALENDAR, BAHRAIN, PRIORS, BEFORE, weather=broken)
    assert inputs is not None and "weather unavailable" in inputs.notes[0]
    assert "Weather during qualifying is not available." in inputs.snapshot.text


def test_a_laps_failure_is_a_note_not_a_blocker():
    from race_calls.predict import FactSources

    def broken(_):
        raise RuntimeError("401 live session")

    facts = FactSources(engines={}, traits={"sepang": ("hot",)}, laps=broken)
    inputs = gather(FakeData(QUALI), CALENDAR, BAHRAIN, PRIORS, BEFORE, facts=facts)
    assert inputs is not None and any("qualifying laps unavailable" in n for n in inputs.notes)


def test_a_leak_inside_a_fact_module_stops_the_prediction():
    from race_calls.predict import FactSources
    from race_calls.snapshot import LeakError

    class LeakyData(FakeData):
        def results(self, season, round):
            # Pretend Jolpica answered an earlier round with this race's own result.
            r = super().results(season, round)
            return r.model_copy(update={"round": 16}) if r is not None else None

    facts = FactSources(engines={}, traits={"sepang": ("hot",)})
    with pytest.raises(LeakError):
        gather(LeakyData(QUALI), CALENDAR, BAHRAIN, PRIORS, BEFORE, facts=facts)
