from datetime import UTC, datetime

import pytest

from race_calls.models import (
    CircuitHistory,
    Constructor,
    ConstructorStanding,
    Driver,
    DriverStanding,
    GridSlotRate,
    Priors,
    QualifyingEntry,
    RaceResult,
    ResultEntry,
    SessionWeather,
    Standings,
    Weekend,
)
from race_calls.snapshot import LeakError, build_snapshot, ordinal

MCL = Constructor(constructor_id="mclaren", name="McLaren")
RBR = Constructor(constructor_id="red_bull", name="Red Bull")
NOR = Driver(driver_id="norris", code="NOR", number=4, given_name="Lando", family_name="Norris")
VER = Driver(
    driver_id="max_verstappen", code="VER", number=1, given_name="Max", family_name="Verstappen"
)
PIA = Driver(driver_id="piastri", code="PIA", number=81, given_name="Oscar", family_name="Piastri")


def weekend(round_: int, name: str, sprint: bool = False) -> Weekend:
    return Weekend(
        season=2026,
        round=round_,
        name=name,
        slug=name.lower().replace(" ", "-"),
        circuit_id="sepang" if round_ == 16 else f"c{round_}",
        circuit_name="Sepang International Circuit",
        locality="Kuala Lumpur",
        country="Malaysia",
        race_start=datetime(2026, 10, 4, 7, tzinfo=UTC),
        qualifying_start=datetime(2026, 10, 3, 8, tzinfo=UTC),
        sprint_start=datetime(2026, 10, 3, 4, tzinfo=UTC) if sprint else None,
    )


BAHRAIN = weekend(16, "Bahrain Grand Prix in Malaysia")
CALENDAR = [weekend(r, f"Race {r} Grand Prix") for r in range(12, 16)] + [BAHRAIN]
QUALI = [
    QualifyingEntry(
        position=1, driver=NOR, constructor=MCL, q1="1:33.1", q2="1:32.8", q3="1:32.500"
    ),
    QualifyingEntry(
        position=2, driver=VER, constructor=RBR, q1="1:33.0", q2="1:32.9", q3="1:32.713"
    ),
    QualifyingEntry(position=3, driver=PIA, constructor=MCL, q1=None, q2=None, q3=None),
]
STANDINGS = Standings(
    season=2026,
    after_round=15,
    drivers=(
        DriverStanding(position=1, points=250, wins=5, driver=NOR, constructor=MCL),
        DriverStanding(position=2, points=231.5, wins=1, driver=VER, constructor=RBR),
    ),
    constructors=(
        ConstructorStanding(position=1, points=480, wins=6, constructor=MCL),
        ConstructorStanding(position=2, points=300, wins=1, constructor=RBR),
    ),
)
PRIORS = Priors(
    source="f1db test",
    seasons=(2014, 2025),
    grid_slots=(
        GridSlotRate(slot=1, starts=100, podiums=76, wins=48),
        GridSlotRate(slot=2, starts=100, podiums=60, wins=24),
    ),
    circuits=(
        CircuitHistory(
            circuit_id="sepang",
            races=19,
            last_held=2017,
            safety_car_races=2,
            safety_car_seasons=(2016, 2017),
            safety_car_source="test",
        ),
    ),
)
BUILT = datetime(2026, 10, 3, 10, tzinfo=UTC)


def result(round_: int, rows: list[tuple[Driver, str]]) -> RaceResult:
    return RaceResult(
        season=2026,
        round=round_,
        entries=tuple(
            ResultEntry(
                position=i,
                position_text=text,
                points=0,
                grid=i,
                laps=50,
                status="Finished" if text.isdigit() else "Retired",
                driver=driver,
                constructor=MCL,
            )
            for i, (driver, text) in enumerate(rows, start=1)
        ),
    )


PREVIOUS = [
    result(15, [(NOR, "1"), (VER, "R")]),
    result(14, [(VER, "1"), (NOR, "2")]),
    result(13, [(NOR, "3")]),
    result(12, [(NOR, "20")]),  # older than the last three: must not appear
]


def build(**kwargs):
    args = dict(
        weekend=BAHRAIN,
        calendar=CALENDAR,
        qualifying=QUALI,
        standings=STANDINGS,
        previous=PREVIOUS,
        priors=PRIORS,
        built_at=BUILT,
        qualifying_weather=SessionWeather(
            session_key=1, samples=40, rainfall=False, air_temp_c=31.2, track_temp_c=44.9
        ),
    )
    args.update(kwargs)
    return build_snapshot(**args)


def test_driver_line_states_every_required_fact():
    snap = build()
    ver = snap.drivers[1]
    assert ver.code == "VER" and ver.grid == 2
    assert "starts 2nd" in ver.line
    assert "0.213 seconds slower than the pole lap" in ver.line
    assert "2nd in the championship with 231.5 points, with 1 win" in ver.line
    assert (
        "Last 3 races: retired in the Race 15 Grand Prix; finished 1st in the Race 14 "
        "Grand Prix; did not race in the Race 13 Grand Prix." in ver.line
    )
    assert "top three 60% of the time and won 24% of the time (100 starts)" in ver.line
    assert "Race 12" not in snap.text


def test_pole_and_no_time_and_no_points_lines():
    snap = build()
    assert "starts 1st, on pole." in snap.drivers[0].line
    assert "Piastri set no qualifying lap time" in snap.drivers[2].line
    assert "Piastri has no championship points yet" in snap.drivers[2].line


def test_race_lines():
    text = build().text
    assert "round 16 of 5 in the 2026 season" in text
    assert "07:00 UTC on 4 October 2026, with 3 drivers" in text
    assert "The grid is provisional" in text
    assert "held 19 championship races, most recently in 2017" in text
    assert "safety car came out in 2 of the 2 races held here from 2016 to 2017" in text
    assert "Qualifying was dry (air 31 C, track 45 C)." in text
    assert "1st McLaren 480 points; 2nd Red Bull 300 points" in text
    assert "Drivers, in grid order:" in text


def test_grid_follows_qualifying_order_not_input_order():
    snap = build(qualifying=list(reversed(QUALI)))
    assert [d.code for d in snap.drivers] == ["NOR", "VER", "PIA"]


@pytest.mark.parametrize(
    "kwargs",
    [
        {"previous": [result(16, [(NOR, "1")])]},  # this race's own result
        {"previous": [result(17, [(NOR, "1")])]},
        {"standings": STANDINGS.model_copy(update={"after_round": 16})},
        {"sprint": result(16, [(NOR, "1")])},  # not a sprint weekend
        {
            "weekend": weekend(16, "Bahrain Grand Prix in Malaysia", sprint=True),
            "sprint": result(16, [(NOR, "1")]).model_copy(update={"season": 2025}),
        },
        {"priors": PRIORS.model_copy(update={"seasons": (2014, 2026)})},
        {
            "priors": PRIORS.model_copy(
                update={
                    "circuits": (CircuitHistory(circuit_id="sepang", races=20, last_held=2026),)
                }
            )
        },
    ],
)
def test_no_race_day_data_can_enter(kwargs):
    with pytest.raises(LeakError):
        build(**kwargs)


def test_the_builder_has_no_way_to_receive_race_results():
    import inspect

    params = set(inspect.signature(build_snapshot).parameters)
    assert not params & {"results", "race_result", "race_control", "laps", "race_weather"}


def test_sprint_weekend_includes_the_sprint():
    sprint_weekend = weekend(16, "Bahrain Grand Prix in Malaysia", sprint=True)
    text = build(weekend=sprint_weekend, sprint=result(16, [(PIA, "1"), (NOR, "2")])).text
    assert "Sprint result: 1st Oscar Piastri; 2nd Lando Norris." in text


def test_missing_optional_data_is_stated_not_guessed():
    text = build(standings=None, qualifying_weather=None, previous=[]).text
    assert "Weather during qualifying is not available." in text
    assert "Last" not in text


def test_every_number_in_the_text_is_there_as_a_sentence_not_a_table():
    assert "|" not in build().text and "\t" not in build().text


def test_no_qualifying_means_no_snapshot():
    with pytest.raises(ValueError, match="no qualifying"):
        build(qualifying=[])


@pytest.mark.parametrize(
    ("n", "expected"), [(1, "1st"), (2, "2nd"), (3, "3rd"), (4, "4th"), (11, "11th"), (22, "22nd")]
)
def test_ordinal(n, expected):
    assert ordinal(n) == expected
