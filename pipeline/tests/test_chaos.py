import json
from datetime import UTC, datetime, timedelta
from pathlib import Path
from typing import Any, NamedTuple

import httpx
import pytest
import respx

from race_calls.cache import JsonCache
from race_calls.chaos import (
    MIN_LEAD,
    ChaosUnavailable,
    actual_chaos,
    chaos_level,
    lead_changes,
    podium_from_top_six,
    race_wet,
    retirements,
)
from race_calls.jolpica import BASE_URL as JOLPICA_URL
from race_calls.jolpica import JolpicaClient
from race_calls.models import (
    Constructor,
    Driver,
    RaceControlSummary,
    RaceResult,
    ResultEntry,
    Weekend,
)
from race_calls.openf1.client import BASE_URL, LiveSessionLockout, OpenF1Client
from race_calls.openf1.ratelimit import SlidingWindowLimiter
from race_calls.rubric import CHAOS_CRITERIA

HERE = Path(__file__).parent / "fixtures"
CHAOS = HERE / "chaos"
OPENF1 = HERE / "openf1"
LIVE = (
    "Live F1 session in progress. Global API access (including past sessions) is "
    "restricted to authenticated users until the session ends."
)
T0 = datetime(2024, 3, 2, 15, 0, tzinfo=UTC)


def _load(path: Path) -> Any:
    return json.loads(path.read_text())


def _fast() -> SlidingWindowLimiter:
    return SlidingWindowLimiter([(1000, 1.0)])


# --- builders -----------------------------------------------------------------------


def _entry(
    position: int, text: str | None = None, grid: int | None = None, status: str = "Finished"
) -> ResultEntry:
    code = f"D{position:02d}"
    return ResultEntry(
        position=position,
        position_text=text or str(position),
        points=0.0,
        grid=position if grid is None else grid,
        laps=50,
        status=status,
        driver=Driver(driver_id=code.lower(), code=code, given_name="A", family_name=code),
        constructor=Constructor(constructor_id="team", name="Team"),
    )


def _result(*entries: ResultEntry) -> RaceResult:
    if not entries:
        entries = tuple(_entry(p) for p in range(1, 21))
    return RaceResult(season=2024, round=1, entries=entries)


def _with_retirements(n: int) -> RaceResult:
    finishers = [_entry(p) for p in range(1, 21 - n)]
    retired = [_entry(p, "R", status="Retired") for p in range(21 - n, 21)]
    return _result(*finishers, *retired)


def _summary(
    safety_cars: int = 0, vscs: int = 0, red_flags: int = 0, first_lap: bool = False
) -> RaceControlSummary:
    return RaceControlSummary(
        session_key=1,
        safety_cars=safety_cars,
        virtual_safety_cars=vscs,
        red_flags=red_flags,
        first_lap_yellow_or_vsc=first_lap,
        messages=0,
    )


def _leader(driver: int, at: datetime, position: int = 1) -> dict[str, Any]:
    return {"date": at.isoformat(), "driver_number": driver, "position": position}


# --- the rubric, row by row ---------------------------------------------------------


def test_the_scorer_has_one_level_per_rubric_line():
    assert len(CHAOS_CRITERIA) == 5
    assert CHAOS_CRITERIA[4].startswith("4: bedlam - a red flag")


def test_calm():
    actual = chaos_level(_summary(), _with_retirements(1), wet=False, lead_changes=2)
    assert actual.actual == 0
    assert actual.reason == "a calm race: no safety car, 1 retirement"
    two = chaos_level(_summary(), _with_retirements(2), wet=False, lead_changes=0)
    assert two.reason == "a calm race: no safety car, 2 retirements"
    assert (
        chaos_level(_summary(), _result(), False, 0).reason
        == "a calm race: no safety car, no retirements"
    )


def test_calm_says_when_lead_changes_were_unknown():
    actual = chaos_level(_summary(), _result(), wet=False, lead_changes=None)
    assert actual.actual == 0
    assert actual.reason == "a calm race: no safety car, no retirements (lead changes unavailable)"
    assert actual.inputs.lead_changes is None


@pytest.mark.parametrize(
    ("summary", "result", "changes", "reason"),
    [
        (_summary(vscs=1), _result(), 0, "a virtual safety car"),
        (_summary(vscs=2), _result(), 0, "two virtual safety cars"),
        (_summary(), _with_retirements(3), 0, "3 retirements"),
        (_summary(), _with_retirements(4), 0, "4 retirements"),
        (_summary(), _result(), 3, "3 lead changes"),
        (_summary(vscs=1), _with_retirements(3), 5, "a virtual safety car and 3 retirements"),
    ],
)
def test_lively(summary, result, changes, reason):
    actual = chaos_level(summary, result, wet=False, lead_changes=changes)
    assert (actual.actual, actual.reason) == (1, reason)


def test_lead_changes_unknown_are_not_applied():
    assert chaos_level(_summary(), _result(), False, None).actual == 0
    assert chaos_level(_summary(vscs=1), _result(), False, None).reason == "a virtual safety car"


@pytest.mark.parametrize(
    ("summary", "reason"),
    [
        (_summary(safety_cars=1), "a full safety car"),
        (_summary(first_lap=True), "a first-lap yellow or virtual safety car"),
        (
            _summary(safety_cars=1, first_lap=True),
            "a full safety car and a first-lap yellow or virtual safety car",
        ),
    ],
)
def test_eventful(summary, reason):
    actual = chaos_level(summary, _result(), wet=False, lead_changes=0)
    assert (actual.actual, actual.reason) == (2, reason)


@pytest.mark.parametrize(
    ("summary", "result", "reason"),
    [
        (_summary(safety_cars=2), _result(), "two full safety cars"),
        (_summary(safety_cars=3), _result(), "three full safety cars"),
        (_summary(), _with_retirements(5), "5 retirements"),
        (_summary(safety_cars=2), _with_retirements(6), "two full safety cars and 6 retirements"),
    ],
)
def test_chaotic(summary, result, reason):
    actual = chaos_level(summary, result, wet=False, lead_changes=0)
    assert (actual.actual, actual.reason) == (3, reason)


def test_bedlam():
    assert chaos_level(_summary(red_flags=1), _result(), False, 0).reason == "a red flag"
    assert chaos_level(_summary(red_flags=2), _result(), False, 0).reason == "two red flags"
    assert chaos_level(_summary(), _result(), True, 0).reason == "wet running"
    outsiders = _result(*(_entry(p, grid=p + 6) for p in range(1, 15)))
    actual = chaos_level(_summary(), outsiders, False, 0)
    assert (actual.actual, actual.reason) == (4, "a podium with none of the top six starters")
    assert actual.inputs.podium_from_top_six is False


def test_bedlam_names_at_most_two_triggers():
    outsiders = _result(*(_entry(p, grid=p + 6) for p in range(1, 15)))
    actual = chaos_level(_summary(red_flags=1), outsiders, True, 0)
    assert actual.reason == "a red flag and wet running"


def test_the_highest_row_wins():
    everything = chaos_level(
        _summary(safety_cars=2, vscs=3, red_flags=1, first_lap=True),
        _with_retirements(6),
        wet=False,
        lead_changes=7,
    )
    assert (everything.actual, everything.reason) == (4, "a red flag")
    # One safety car beats a VSC and 4 retirements; the reason names only row 2.
    actual = chaos_level(_summary(safety_cars=1, vscs=1), _with_retirements(4), False, 5)
    assert (actual.actual, actual.reason) == (2, "a full safety car")


def test_no_dashes_in_any_reason():
    reasons = [
        chaos_level(s, r, w, c).reason
        for s in (_summary(), _summary(vscs=1, safety_cars=2, red_flags=1, first_lap=True))
        for r in (_result(), _with_retirements(5))
        for w in (False, True)
        for c in (None, 0, 4)
    ]
    assert all("\u2013" not in r and "\u2014" not in r for r in reasons)


# --- retirements and the top-six podium ----------------------------------------------


def test_retirements_count_started_non_finishers_only():
    result = _result(
        *(_entry(p) for p in range(1, 13)),
        _entry(13, "R", status="Retired"),
        _entry(14, "R", status="Collision"),
        _entry(15, "N", status="Not classified"),
        _entry(16, "D", status="Disqualified"),
        _entry(17, "E", status="Excluded"),
        _entry(18, "W", status="Did not start"),
        _entry(19, "F", status="Did not qualify"),
        _entry(20, "R", status="Did not start"),
        _entry(21, "R", grid=0, status="Retired"),  # a pit-lane starter who retired
    )
    assert retirements(result) == 4


def test_a_lap_one_crash_is_a_retirement():
    crash = _entry(20, "R", status="Retired").model_copy(update={"laps": 0})
    assert retirements(_result(*(_entry(p) for p in range(1, 20)), crash)) == 1


def test_podium_from_top_six():
    assert podium_from_top_six(_result())
    only_p3 = _result(_entry(1, grid=9), _entry(2, grid=12), _entry(3, grid=6))
    assert podium_from_top_six(only_p3)
    # A pit-lane start (grid 0) is not a top-six start.
    pit_lane = _result(_entry(1, grid=0), _entry(2, grid=7), _entry(3, grid=8))
    assert not podium_from_top_six(pit_lane)
    # A top-six starter who finished fourth does not help.
    fourth = _result(_entry(1, grid=7), _entry(2, grid=8), _entry(3, grid=9), _entry(4, grid=1))
    assert not podium_from_top_six(fourth)


def test_podium_rule_needs_a_podium():
    with pytest.raises(ValueError, match="no podium"):
        podium_from_top_six(_result(_entry(1, "R", status="Retired")))


# --- lead changes -------------------------------------------------------------------


def test_lead_changes_count_driver_changes_after_the_start():
    rows = [
        _leader(1, T0 - timedelta(minutes=50)),  # grid order, before lights out
        _leader(4, T0 + timedelta(minutes=5)),
        _leader(4, T0 + timedelta(minutes=6)),  # a repeat of the same leader
        _leader(1, T0 + timedelta(minutes=30)),  # a pit-stop cycle counts too
        _leader(16, T0 + timedelta(minutes=31)),
    ]
    assert lead_changes(rows, T0) == 3
    assert lead_changes(list(reversed(rows)), T0) == 3


def test_lead_changes_ignore_rows_before_the_start_and_other_positions():
    rows = [
        _leader(4, T0 - timedelta(minutes=60)),
        _leader(1, T0 - timedelta(minutes=50)),  # formation order settles on the pole-sitter
        _leader(1, T0 + timedelta(minutes=5)),
        _leader(16, T0 + timedelta(minutes=6), position=2),
    ]
    assert lead_changes(rows, T0) == 0


def test_lead_changes_without_a_start_take_the_first_row_as_the_leader():
    rows = [_leader(1, T0), _leader(4, T0 + timedelta(minutes=5))]
    assert lead_changes(rows) == 1
    assert lead_changes([], T0) == 0
    # No row before the start: the first leader after it is the starting leader.
    assert lead_changes([_leader(4, T0 + timedelta(seconds=30))], T0) == 0


def test_lead_changes_drop_a_timing_blip():
    rows = [
        _leader(1, T0 - timedelta(minutes=50)),
        _leader(4, T0 + timedelta(minutes=3)),
        _leader(1, T0 + timedelta(minutes=3) + MIN_LEAD - timedelta(seconds=1)),
    ]
    assert lead_changes(rows, T0) == 0
    rows[2] = _leader(1, T0 + timedelta(minutes=3) + MIN_LEAD)
    assert lead_changes(rows, T0) == 2


def test_real_leader_rows():
    bahrain = _load(CHAOS / "leader_2024_bahrain_race.json")
    lights_out = datetime(2024, 3, 2, 15, 3, 42, tzinfo=UTC)
    # Norris "leads" for about a second at the start; Verstappen led every lap.
    assert lead_changes(bahrain, lights_out) == 0
    australia = _load(CHAOS / "leader_2024_australia_race.json")
    # Sainz passes Verstappen, then Leclerc leads while Sainz pits under the VSC.
    assert lead_changes(australia, datetime(2024, 3, 24, 4, 3, 12, tzinfo=UTC)) == 3


# --- rain ---------------------------------------------------------------------------


def test_race_wet_ignores_rain_before_the_start():
    rows = [
        {"date": (T0 - timedelta(minutes=20)).isoformat(), "rainfall": 1},
        {"date": (T0 + timedelta(minutes=10)).isoformat(), "rainfall": 0},
    ]
    assert not race_wet(rows, T0, T0 + timedelta(hours=2))
    rows.append({"date": (T0 + timedelta(minutes=30)).isoformat(), "rainfall": 1})
    assert race_wet(rows, T0, T0 + timedelta(hours=2))
    assert not race_wet(rows, T0, T0 + timedelta(minutes=20))
    assert race_wet(rows, T0, None)


def test_race_wet_on_real_weather():
    brazil = _load(OPENF1 / "weather_2024_brazil_race.json")
    start = datetime(2024, 11, 3, 15, 30, tzinfo=UTC)
    assert race_wet(brazil, start, start + timedelta(hours=3))
    bahrain = _load(OPENF1 / "weather_2024_bahrain_race.json")
    assert not race_wet(bahrain, T0, T0 + timedelta(hours=2))


# --- actual_chaos on real races -----------------------------------------------------


class Race(NamedTuple):
    season: int
    round: int
    results: Path
    sessions: Path
    race_control: Path
    weather: Path
    leader: Path


def _race_2024(round_: int, name: str, weather: Path) -> Race:
    return Race(
        2024,
        round_,
        CHAOS / f"results_2024_{name}.json",
        OPENF1 / "sessions_2024_race.json",
        OPENF1 / f"race_control_2024_{name}_race.json",
        weather,
        CHAOS / f"leader_2024_{name}_race.json",
    )


RACES = {
    "bahrain": _race_2024(1, "bahrain", OPENF1 / "weather_2024_bahrain_race.json"),
    "australia": _race_2024(3, "australia", CHAOS / "weather_2024_australia_race.json"),
    "monaco": _race_2024(8, "monaco", CHAOS / "weather_2024_monaco_race.json"),
    "brazil": _race_2024(21, "brazil", OPENF1 / "weather_2024_brazil_race.json"),
    # Jolpica still lists it at 20:00Z; it ran from 17:04Z to 18:37Z (session 11280).
    "miami": Race(
        2026,
        4,
        CHAOS / "results_2026_miami.json",
        CHAOS / "sessions_2026_miami_race.json",
        CHAOS / "race_control_2026_miami_race.json",
        CHAOS / "weather_2026_miami_race.json",
        CHAOS / "leader_2026_miami_race.json",
    ),
}


def _real(name: str, tmp_path: Path) -> tuple[Weekend, RaceResult]:
    race = RACES[name]
    body = _load(race.results)
    respx.get(f"{JOLPICA_URL}/{race.season}/{race.round}/results/").mock(
        return_value=httpx.Response(200, json=body)
    )
    jolpica = JolpicaClient(http=httpx.Client(), cache=JsonCache(tmp_path / name), limiter=_fast())
    result = jolpica.results(race.season, race.round)
    assert result is not None
    row = body["MRData"]["RaceTable"]["Races"][0]
    start = datetime.fromisoformat(f"{row['date']}T{row['time'].replace('Z', '+00:00')}")
    weekend = Weekend(
        season=race.season,
        round=race.round,
        name=row["raceName"],
        slug=name,
        circuit_id=row["Circuit"]["circuitId"],
        circuit_name=row["Circuit"]["circuitName"],
        locality="",
        country="",
        race_start=start,
    )
    return weekend, result


def _serve_openf1(
    name: str,
    position: httpx.Response | None = None,
    race_control: list[dict[str, Any]] | None = None,
) -> None:
    race = RACES[name]
    served = {
        "sessions": _load(race.sessions),
        "race_control": _load(race.race_control) if race_control is None else race_control,
        "weather": _load(race.weather),
    }
    for endpoint, body in served.items():
        respx.get(f"{BASE_URL}/{endpoint}").mock(return_value=httpx.Response(200, json=body))
    respx.get(f"{BASE_URL}/position").mock(
        return_value=position or httpx.Response(200, json=_load(race.leader))
    )


def _openf1() -> OpenF1Client:
    return OpenF1Client(httpx.Client(), limiter=_fast(), sleep=lambda _: None)


@respx.mock
@pytest.mark.parametrize(
    ("name", "level", "reason"),
    [
        ("bahrain", 0, "a calm race: no safety car, no retirements"),
        ("australia", 1, "two virtual safety cars and 3 lead changes"),
        ("monaco", 4, "a red flag"),
        ("brazil", 4, "a red flag and wet running"),
        ("miami", 2, "a full safety car"),
    ],
)
def test_real_races(name, level, reason, tmp_path):
    weekend, result = _real(name, tmp_path)
    _serve_openf1(name)
    actual = actual_chaos(_openf1(), weekend, result)
    assert (actual.actual, actual.reason) == (level, reason)


@respx.mock
def test_real_inputs_are_kept_for_auditing(tmp_path):
    weekend, result = _real("brazil", tmp_path)
    _serve_openf1("brazil")
    inputs = actual_chaos(_openf1(), weekend, result).inputs
    # Two full safety cars, a VSC, and the red flag; Albon and Stroll ("W") never
    # started and Hulkenberg was disqualified, so Sainz and Colapinto are the retirements.
    assert inputs.model_dump() == {
        "safety_cars": 2,
        "virtual_safety_cars": 1,
        "red_flags": 1,
        "first_lap_yellow_or_vsc": False,
        "retirements": 2,
        "lead_changes": 3,
        "wet": True,
        "podium_from_top_six": True,
    }
    weekend, result = _real("monaco", tmp_path)
    _serve_openf1("monaco")
    monaco = actual_chaos(_openf1(), weekend, result).inputs
    # The four lap-1 crashers (laps 0) started, so they are retirements.
    assert (monaco.retirements, monaco.red_flags, monaco.wet) == (4, 1, False)


@respx.mock
def test_position_failure_drops_only_the_lead_change_condition(tmp_path):
    weekend, result = _real("bahrain", tmp_path)
    _serve_openf1("bahrain", position=httpx.Response(404, json={"detail": "No results found."}))
    actual = actual_chaos(_openf1(), weekend, result)
    assert actual.actual == 0
    assert actual.inputs.lead_changes is None
    assert actual.reason.endswith("(lead changes unavailable)")

    weekend, result = _real("australia", tmp_path)
    _serve_openf1("australia", position=httpx.Response(503))
    actual = actual_chaos(_openf1(), weekend, result)
    assert (actual.actual, actual.reason) == (1, "two virtual safety cars")


@respx.mock
def test_live_lockout_propagates(tmp_path):
    weekend, result = _real("bahrain", tmp_path)
    _serve_openf1("bahrain", position=httpx.Response(401, json={"detail": LIVE}))
    with pytest.raises(LiveSessionLockout):
        actual_chaos(_openf1(), weekend, result)


@respx.mock
def test_live_lockout_on_the_session_lookup_propagates(tmp_path):
    weekend, result = _real("bahrain", tmp_path)
    respx.get(f"{BASE_URL}/sessions").mock(return_value=httpx.Response(401, json={"detail": LIVE}))
    with pytest.raises(LiveSessionLockout):
        actual_chaos(_openf1(), weekend, result)


@respx.mock
def test_no_race_session_is_unavailable(tmp_path):
    weekend, result = _real("bahrain", tmp_path)
    _serve_openf1("bahrain")
    far = weekend.model_copy(update={"race_start": weekend.race_start + timedelta(days=2)})
    with pytest.raises(ChaosUnavailable, match="no race session"):
        actual_chaos(_openf1(), far, result)


@respx.mock
def test_rain_after_the_chequered_flag_is_not_wet_running(tmp_path):
    weekend, result = _real("miami", tmp_path)
    _serve_openf1("miami")
    actual = actual_chaos(_openf1(), weekend, result)
    # The only rain fell from 18:45Z, after SESSION FINISHED (18:37Z) but before the
    # scheduled end (19:00Z).
    assert actual.inputs.wet is False
    assert (actual.actual, actual.reason) == (2, "a full safety car")


@respx.mock
def test_without_session_finished_the_window_ends_at_the_scheduled_end(tmp_path):
    weekend, result = _real("miami", tmp_path)
    messages = _load(RACES["miami"].race_control)
    unfinished = [m for m in messages if m.get("message") != "SESSION FINISHED"]
    _serve_openf1("miami", race_control=unfinished)
    assert actual_chaos(_openf1(), weekend, result).inputs.wet is True


@respx.mock
def test_lights_out_is_the_first_session_started(tmp_path):
    weekend, result = _real("miami", tmp_path)
    _serve_openf1("miami")
    actual = actual_chaos(_openf1(), weekend, result)
    assert actual.lights_out == datetime(2026, 5, 3, 17, 4, 2, 493000, tzinfo=UTC)
    # Monaco was restarted after the red flag; lights out is still the first start.
    weekend, result = _real("monaco", tmp_path)
    _serve_openf1("monaco")
    monaco = actual_chaos(_openf1(), weekend, result)
    assert monaco.lights_out == datetime(2024, 5, 26, 13, 3, 11, 68000, tzinfo=UTC)


@respx.mock
def test_lights_out_is_none_without_race_control(tmp_path):
    weekend, result = _real("bahrain", tmp_path)
    _serve_openf1("bahrain", race_control=[])
    actual = actual_chaos(_openf1(), weekend, result)
    assert actual.lights_out is None
    assert actual.actual == 0
