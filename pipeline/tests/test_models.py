import json
from datetime import UTC, date, datetime, timedelta
from pathlib import Path

import pytest
from pydantic import ValidationError

from race_calls.cache import JsonCache
from race_calls.models import PredictionRecord, Weekend, lap_seconds, model_date
from race_calls.rubric import CHAOS_CRITERIA

CONTRACTS = Path(__file__).resolve().parents[2] / "contracts"


def test_lap_seconds():
    assert lap_seconds("1:31.234") == pytest.approx(91.234)
    assert lap_seconds("58.1") == pytest.approx(58.1)
    assert lap_seconds("") is None and lap_seconds(None) is None and lap_seconds("DNF") is None


def test_model_date_comes_from_the_dated_version():
    assert model_date("typesafe/jev-1.13-20260917") == date(2026, 9, 17)
    assert model_date("typesafe/jev-1.13") is None
    assert model_date(None) is None


def test_times_must_be_timezone_aware():
    with pytest.raises(ValidationError):
        Weekend(
            season=2026,
            round=16,
            name="x",
            slug="x",
            circuit_id="sepang",
            circuit_name="x",
            locality="x",
            country="x",
            race_start=datetime(2026, 10, 4, 7),
        )


def test_rubric_has_five_levels_in_order():
    assert [c.split(":")[0] for c in CHAOS_CRITERIA] == ["0", "1", "2", "3", "4"]


def test_example_record_matches_the_contract_and_the_schema_is_current():
    example = json.loads((CONTRACTS / "prediction-record.example.json").read_text())
    record = PredictionRecord.model_validate(example)
    assert record.calls is not None and len(record.calls.podium) == len(record.drivers)
    schema = json.loads((CONTRACTS / "prediction-record.schema.json").read_text())
    assert schema == PredictionRecord.model_json_schema(), (
        "regenerate with: uv run python -m race_calls.contracts"
    )


def test_cache_round_trip_and_expiry(tmp_path):
    now = [datetime(2026, 10, 3, 9, tzinfo=UTC)]
    cache = JsonCache(tmp_path, clock=lambda: now[0])
    assert cache.get("jolpica", "a") is None
    cache.put("jolpica", "a", {"x": 1})
    assert cache.get("jolpica", "a") == {"x": 1}
    now[0] += timedelta(hours=7)
    assert cache.get("jolpica", "a", max_age=timedelta(hours=6)) is None
    assert cache.get("jolpica", "a") == {"x": 1}
