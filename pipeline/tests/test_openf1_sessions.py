import json
from datetime import UTC, datetime, timedelta
from pathlib import Path
from typing import Any

import httpx
import pytest
import respx

from race_calls.openf1.client import BASE_URL, LiveSessionLockout, OpenF1Client
from race_calls.openf1.ratelimit import SlidingWindowLimiter
from race_calls.openf1.sessions import (
    find_session,
    race_control_summary,
    summarise_race_control,
    weather_summary,
)

FIXTURES = Path(__file__).parent / "fixtures" / "openf1"
LIVE = (
    "Live F1 session in progress. Global API access (including past sessions) is "
    "restricted to authenticated users until the session ends."
)


def _load(name: str) -> list[dict[str, Any]]:
    data: list[dict[str, Any]] = json.loads((FIXTURES / name).read_text())
    return data


def _client() -> OpenF1Client:
    return OpenF1Client(httpx.Client(), limiter=SlidingWindowLimiter([(1000, 1.0)]))


def _serve(endpoint: str, fixture: str) -> respx.Route:
    return respx.get(f"{BASE_URL}/{endpoint}").mock(
        return_value=httpx.Response(200, json=_load(fixture))
    )


# --- find_session -------------------------------------------------------------------


@respx.mock
def test_find_session_matches_start_within_tolerance():
    _serve("sessions", "sessions_2026_qualifying.json")
    baku = datetime(2026, 9, 25, 12, 0, tzinfo=UTC)
    assert find_session(_client(), 2026, "Qualifying", baku) == 11373
    # Jolpica and OpenF1 can disagree by a few minutes or hours; the tolerance covers it.
    assert find_session(_client(), 2026, "Qualifying", baku + timedelta(hours=5)) == 11373


@respx.mock
def test_find_session_outside_tolerance_is_none():
    _serve("sessions", "sessions_2026_qualifying.json")
    baku = datetime(2026, 9, 25, 12, 0, tzinfo=UTC)
    assert find_session(_client(), 2026, "Qualifying", baku + timedelta(hours=7)) is None
    assert (
        find_session(_client(), 2026, "Qualifying", baku, tolerance=timedelta(minutes=30)) == 11373
    )
    assert (
        find_session(
            _client(), 2026, "Qualifying", baku + timedelta(hours=1), timedelta(minutes=30)
        )
        is None
    )


@respx.mock
def test_find_session_uses_the_session_name_and_year_params():
    route = _serve("sessions", "sessions_2024_race.json")
    monaco = datetime(2024, 5, 26, 13, 0, tzinfo=UTC)
    assert find_session(_client(), 2024, "Race", monaco) == 9523
    params = route.calls.last.request.url.params
    assert params["year"] == "2024"
    assert params["session_name"] == "Race"


@respx.mock
def test_find_session_ignores_other_names_and_cancelled_sessions():
    start = "2026-09-25T12:00:00+00:00"
    respx.get(f"{BASE_URL}/sessions").mock(
        return_value=httpx.Response(
            200,
            json=[
                {"session_key": 1, "session_name": "Sprint", "date_start": start},
                {
                    "session_key": 2,
                    "session_name": "Race",
                    "date_start": start,
                    "is_cancelled": True,
                },
            ],
        )
    )
    near = datetime(2026, 9, 25, 12, 0, tzinfo=UTC)
    assert find_session(_client(), 2026, "Race", near) is None


@respx.mock
def test_find_session_404_is_none():
    respx.get(f"{BASE_URL}/sessions").mock(return_value=httpx.Response(404))
    assert find_session(_client(), 2030, "Race", datetime(2030, 3, 1, tzinfo=UTC)) is None


def test_find_session_requires_aware_time():
    with pytest.raises(ValueError):
        find_session(_client(), 2026, "Race", datetime(2026, 9, 27, 11, 0))


# --- weather ------------------------------------------------------------------------


@respx.mock
def test_weather_dry_race():
    _serve("weather", "weather_2024_bahrain_race.json")
    weather = weather_summary(_client(), 9472)
    assert weather is not None
    assert weather.session_key == 9472
    assert weather.samples == 16
    assert weather.rainfall is False
    assert weather.air_temp_c is not None and 15 < weather.air_temp_c < 25
    assert weather.track_temp_c is not None and 18 < weather.track_temp_c < 35


@respx.mock
def test_weather_wet_race():
    _serve("weather", "weather_2024_brazil_race.json")
    weather = weather_summary(_client(), 9636)
    assert weather is not None
    assert weather.rainfall is True


@respx.mock
def test_weather_2026_qualifying():
    _serve("weather", "weather_2026_azerbaijan_qualifying.json")
    weather = weather_summary(_client(), 11373)
    assert weather is not None
    assert weather.rainfall is False
    assert weather.samples == 9
    assert weather.track_temp_c is not None and weather.air_temp_c is not None
    assert weather.track_temp_c > weather.air_temp_c


@respx.mock
def test_weather_without_data_is_none():
    respx.get(f"{BASE_URL}/weather").mock(return_value=httpx.Response(200, json=[]))
    assert weather_summary(_client(), 1) is None
    respx.get(f"{BASE_URL}/weather").mock(return_value=httpx.Response(404))
    assert weather_summary(_client(), 1) is None


# --- race control -------------------------------------------------------------------


@respx.mock
def test_calm_race_has_no_interruptions():
    # 2024 Bahrain: two brief sector double yellows on lap 1, nothing else.
    _serve("race_control", "race_control_2024_bahrain_race.json")
    summary = race_control_summary(_client(), 9472)
    assert (summary.safety_cars, summary.virtual_safety_cars, summary.red_flags) == (0, 0, 0)
    assert summary.first_lap_yellow_or_vsc is False
    assert summary.messages == 25


@respx.mock
def test_vsc_race():
    # 2024 Australia: VSC for Verstappen's brake fire (lap 17) and Russell's crash (lap 58).
    _serve("race_control", "race_control_2024_australia_race.json")
    summary = race_control_summary(_client(), 9488)
    assert (summary.safety_cars, summary.virtual_safety_cars, summary.red_flags) == (0, 2, 0)
    assert summary.first_lap_yellow_or_vsc is False


@respx.mock
def test_red_flag_on_lap_one():
    # 2024 Monaco: Perez and the Haas pair crash on lap 1; the race is red-flagged.
    _serve("race_control", "race_control_2024_monaco_race.json")
    summary = race_control_summary(_client(), 9523)
    assert summary.red_flags == 1
    assert (summary.safety_cars, summary.virtual_safety_cars) == (0, 0)
    assert summary.first_lap_yellow_or_vsc is True


@respx.mock
def test_wet_race_with_everything():
    # 2024 Brazil: VSC, SC, red flag, then a second SC.
    _serve("race_control", "race_control_2024_brazil_race.json")
    summary = race_control_summary(_client(), 9636)
    assert (summary.safety_cars, summary.virtual_safety_cars, summary.red_flags) == (2, 1, 1)
    assert summary.first_lap_yellow_or_vsc is False


def _msg(
    time: str,
    message: str,
    category: str = "Other",
    lap: int | None = 1,
    flag: str | None = None,
    scope: str | None = None,
    sector: int | None = None,
) -> dict[str, Any]:
    return {
        "date": f"2026-09-27T{time}+00:00",
        "lap_number": lap,
        "category": category,
        "flag": flag,
        "scope": scope,
        "sector": sector,
        "message": message,
    }


START = _msg("11:03:00", "SESSION STARTED", "SessionStatus")


def test_repeated_deployments_and_non_deployment_messages_are_not_counted():
    messages = [
        START,
        _msg("11:10:00", "SAFETY CAR DEPLOYED", "SafetyCar", lap=5),
        _msg("11:10:30", "SAFETY CAR DEPLOYED", "SafetyCar", lap=5),
        _msg("11:12:00", "SAFETY CAR THROUGH THE PIT LANE", "SafetyCar", lap=6),
        _msg("11:14:00", "SAFETY CAR IN THIS LAP", "SafetyCar", lap=7),
        _msg("11:30:00", "VIRTUAL SAFETY CAR DEPLOYED", "SafetyCar", lap=20),
        _msg("11:31:00", "VSC ENDING", "SafetyCar", lap=20),
        _msg("11:40:00", "SAFETY CAR DEPLOYED", "SafetyCar", lap=None),
        _msg("11:41:00", "RED FLAG", "Flag", lap=None, flag="RED", scope="Track"),
        _msg("11:41:05", "RED FLAG", "Flag", lap=None, flag="RED", scope="Track"),
        _msg("11:55:00", "TRACK CLEAR", "Flag", lap=30, flag="CLEAR", scope="Track"),
        _msg("11:56:00", "RED FLAG", "Flag", lap=30, flag="RED", scope="Track"),
        _msg("12:10:00", "SESSION STARTED", "SessionStatus", lap=30),
        _msg("12:20:00", "RED FLAG", "Flag", lap=35, flag="RED", scope="Track"),
    ]
    summary = summarise_race_control(1, messages)
    assert summary.safety_cars == 2
    assert summary.virtual_safety_cars == 1
    assert summary.red_flags == 2
    assert summary.first_lap_yellow_or_vsc is False


def test_long_sector_yellow_on_lap_one_counts():
    messages = [
        START,
        _msg(
            "11:03:20",
            "DOUBLE YELLOW IN TRACK SECTOR 4",
            "Flag",
            flag="DOUBLE YELLOW",
            scope="Sector",
            sector=4,
        ),
        _msg("11:04:10", "CLEAR IN TRACK SECTOR 4", "Flag", flag="CLEAR", scope="Sector", sector=4),
        _msg("11:05:00", "DRS ENABLED", "Drs", lap=2),
    ]
    assert summarise_race_control(1, messages).first_lap_yellow_or_vsc is True


def test_brief_sector_yellow_and_pre_start_yellow_do_not_count():
    messages = [
        _msg(
            "10:30:00",
            "DOUBLE YELLOW IN TRACK SECTOR 7",
            "Flag",
            flag="DOUBLE YELLOW",
            scope="Sector",
            sector=7,
        ),
        _msg("10:35:00", "CLEAR IN TRACK SECTOR 7", "Flag", flag="CLEAR", scope="Sector", sector=7),
        START,
        _msg(
            "11:03:20", "YELLOW IN TRACK SECTOR 4", "Flag", flag="YELLOW", scope="Sector", sector=4
        ),
        _msg("11:03:25", "CLEAR IN TRACK SECTOR 4", "Flag", flag="CLEAR", scope="Sector", sector=4),
        _msg("11:05:00", "DRS ENABLED", "Drs", lap=2),
        # Long, but on lap 2.
        _msg(
            "11:06:00",
            "YELLOW IN TRACK SECTOR 9",
            "Flag",
            lap=2,
            flag="YELLOW",
            scope="Sector",
            sector=9,
        ),
    ]
    assert summarise_race_control(1, messages).first_lap_yellow_or_vsc is False


def test_vsc_on_lap_one_with_null_lap_number_counts():
    messages = [
        START,
        _msg("11:03:40", "VIRTUAL SAFETY CAR DEPLOYED", "SafetyCar", lap=None),
        _msg("11:05:00", "VIRTUAL SAFETY CAR ENDING", "SafetyCar", lap=2),
    ]
    summary = summarise_race_control(1, messages)
    assert summary.first_lap_yellow_or_vsc is True
    assert summary.virtual_safety_cars == 1


def test_no_race_control_data_is_all_zeros():
    summary = summarise_race_control(1, [])
    assert (summary.safety_cars, summary.virtual_safety_cars, summary.red_flags) == (0, 0, 0)
    assert summary.first_lap_yellow_or_vsc is False


# --- live lockout -------------------------------------------------------------------


@respx.mock
@pytest.mark.parametrize(
    "call",
    [
        lambda c: race_control_summary(c, 9523),
        lambda c: weather_summary(c, 9523),
        lambda c: find_session(c, 2026, "Race", datetime(2026, 9, 27, 11, tzinfo=UTC)),
    ],
)
def test_live_lockout_propagates(call):
    respx.get(url__startswith=BASE_URL).mock(
        return_value=httpx.Response(401, json={"detail": LIVE})
    )
    with pytest.raises(LiveSessionLockout, match="Live F1 session"):
        call(_client())
