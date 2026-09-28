"""End to end through the CLI, with Jolpica, OpenF1, and Jev all mocked from fixtures."""

import json
import re
from pathlib import Path

import httpx
import pytest
import respx
from typer.testing import CliRunner

from race_calls.cli import app
from race_calls.jev import TYPESAFE_MODEL, TYPESAFE_URL
from race_calls.jolpica import BASE_URL
from race_calls.models import PredictionRecord, Status
from race_calls.settings import get_settings

FIXTURES = Path(__file__).parent / "fixtures" / "jolpica"
EMPTY = json.loads((FIXTURES / "2026_16_qualifying_empty.json").read_text())
runner = CliRunner()


@pytest.fixture(autouse=True)
def no_rate_limit_sleeps(monkeypatch):
    # The limiter itself is tested elsewhere; here it would only make the test slow.
    from race_calls.openf1.ratelimit import SlidingWindowLimiter

    monkeypatch.setattr(SlidingWindowLimiter, "acquire", lambda self: None)


def fixture(name: str) -> dict:
    return json.loads((FIXTURES / name).read_text())


def mock_jolpica(qualifying: dict) -> None:
    respx.get(f"{BASE_URL}/2026/races/").mock(
        return_value=httpx.Response(200, json=fixture("2026_races.json"))
    )
    respx.get(f"{BASE_URL}/2026/16/qualifying/").mock(
        return_value=httpx.Response(200, json=qualifying)
    )
    respx.get(f"{BASE_URL}/2026/15/results/").mock(
        return_value=httpx.Response(200, json=fixture("2026_15_results.json"))
    )
    # Every other earlier round: nothing published (routes match in the order added).
    respx.get(url__regex=rf"{re.escape(BASE_URL)}/2026/\d+/results/").mock(
        return_value=httpx.Response(200, json=EMPTY)
    )
    respx.get(url__regex=rf"{re.escape(BASE_URL)}/2026/\d+/qualifying/").mock(
        return_value=httpx.Response(200, json=EMPTY)
    )
    respx.get(f"{BASE_URL}/2026/15/driverStandings/").mock(
        return_value=httpx.Response(200, json=fixture("2026_15_driver_standings.json"))
    )
    respx.get(f"{BASE_URL}/2026/15/constructorStandings/").mock(
        return_value=httpx.Response(200, json=fixture("2026_15_constructor_standings.json"))
    )
    respx.get(url__startswith="https://api.openf1.org/").mock(
        return_value=httpx.Response(404, json={"detail": "No results found."})
    )


def jev_answers(request: httpx.Request) -> httpx.Response:
    questions = json.loads(request.content)["questions"]
    codes = [k.removeprefix("podium_") for k in questions if k.startswith("podium_")]
    answers = {f"podium_{c}": {"type": "noul", "noul": 0.1} for c in codes}
    answers["winner"] = {
        "type": "choice",
        "choice": codes[0],
        "confidence": 0.1,
        "probabilities": {c: 1 / len(codes) for c in codes},
    }
    answers["chaos"] = {"type": "score", "score": 1.0, "confidence": 0.5, "legend": {}}
    # TypeSafe's documented response (docs.typesafe.ai/api.md): an undated model version and
    # token usage, with no cost, provider, or id.
    return httpx.Response(
        200,
        json={
            "model": "jev-1.13.0",
            "answers": answers,
            "usage": {"input_tokens": 2000, "output_tokens": 400},
        },
    )


@pytest.fixture
def key(monkeypatch):
    monkeypatch.setenv("TYPESAFE_API_KEY", "test-key-not-real")
    get_settings.cache_clear()


def records() -> list[Path]:
    return sorted(get_settings().predictions_dir.rglob("*.json"))


@respx.mock
def test_nothing_due_before_qualifying_ends():
    mock_jolpica(EMPTY)
    result = runner.invoke(app, ["prerace", "--season", "2026", "--now", "2026-10-03T08:30+00:00"])
    assert result.exit_code == 0, result.output
    assert "Nothing due." in result.output and records() == []


@respx.mock
def test_waits_while_qualifying_is_unpublished():
    mock_jolpica(EMPTY)
    result = runner.invoke(app, ["prerace", "--season", "2026", "--now", "2026-10-03T09:30+00:00"])
    assert result.exit_code == 0, result.output
    assert "not published yet" in result.output and records() == []


@respx.mock
def test_gives_up_an_hour_before_the_start():
    mock_jolpica(EMPTY)
    result = runner.invoke(app, ["prerace", "--season", "2026", "--now", "2026-10-04T06:10+00:00"])
    assert result.exit_code == 0, result.output
    [path] = records()
    assert path.name == "16-bahrain-grand-prix-in-malaysia.json"
    assert PredictionRecord.model_validate_json(path.read_text()).status is Status.NO_PREDICTION


@respx.mock
def test_predicts_once_qualifying_is_in_and_then_stops(key):
    qualifying = fixture("2026_15_qualifying.json")  # a real 22-car qualifying table
    mock_jolpica(qualifying)
    jev = respx.post(TYPESAFE_URL).mock(side_effect=jev_answers)
    now = ["prerace", "--season", "2026", "--now", "2026-10-03T09:30+00:00"]
    result = runner.invoke(app, now)
    assert result.exit_code == 0, result.output
    [path] = records()
    record = PredictionRecord.model_validate_json(path.read_text())
    assert record.status is Status.OK and record.kind == "live" and len(record.drivers) == 22
    sent = json.loads(jev.calls[0].request.content)
    assert sent["model"] == TYPESAFE_MODEL  # the pinned version, not jev-latest
    assert jev.calls[0].request.headers["authorization"] == "Bearer test-key-not-real"
    assert record.jev is not None and record.jev.model_id == "jev-1.13.0"
    assert record.jev.provider == "typesafe-ai" and record.jev.cost_usd is None
    assert (record.jev.input_tokens, record.jev.output_tokens) == (2000, 400)
    assert jev.call_count == 1 and len(sent["questions"]) == 24
    # The richer facts reach Jev's state (engine and similar-track lines).
    assert "Power units this season" in sent["state"]
    assert "uses a Mercedes power unit" in sent["state"]
    assert "this project's own classification" in sent["state"]
    assert "test-key-not-real" not in path.read_text()
    # The next hourly run finds a final record and does nothing.
    again = runner.invoke(app, now)
    assert "Nothing due." in again.output and jev.call_count == 1
