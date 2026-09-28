from pathlib import Path

import pytest

from race_calls.facts import engines as e
from race_calls.models import Constructor, Driver, QualifyingEntry, RaceResult, ResultEntry
from race_calls.priors import F1DB_VERSION
from race_calls.snapshot import LeakError

FIXTURE = Path(__file__).parent / "fixtures" / "engines"

# From one request to https://api.jolpi.ca/ergast/f1/2026/constructors/?format=json
JOLPICA_2026_CONSTRUCTORS = [
    "alpine", "aston_martin", "audi", "cadillac", "ferrari", "haas", "mclaren", "mercedes",
    "rb", "red_bull", "williams",
]  # fmt: skip

TEAMS = {
    "mclaren": Constructor(constructor_id="mclaren", name="McLaren"),
    "mercedes": Constructor(constructor_id="mercedes", name="Mercedes"),
    "ferrari": Constructor(constructor_id="ferrari", name="Ferrari"),
    "red_bull": Constructor(constructor_id="red_bull", name="Red Bull"),
    "newteam": Constructor(constructor_id="newteam", name="New Team"),
}
ENGINES = {
    "mclaren": "Mercedes",
    "mercedes": "Mercedes",
    "ferrari": "Ferrari",
    "red_bull": "Red Bull Ford",
}


def _driver(driver_id: str) -> Driver:
    return Driver(
        driver_id=driver_id,
        code=driver_id[:3].upper(),
        given_name="Given",
        family_name=driver_id.capitalize(),
    )


def _grid(*pairs: tuple[str, str]) -> list[QualifyingEntry]:
    return [
        QualifyingEntry(position=i, driver=_driver(d), constructor=TEAMS[t])
        for i, (d, t) in enumerate(pairs, start=1)
    ]


def _result(round: int, *finishers: tuple[str, str, str], season: int = 2026) -> RaceResult:
    """finishers: (driver_id, team, position_text) in classification order."""
    return RaceResult(
        season=season,
        round=round,
        entries=tuple(
            ResultEntry(
                position=i,
                position_text=text,
                points=0,
                grid=i,
                laps=50,
                status="Finished" if text.isdigit() else "Retired",
                driver=_driver(d),
                constructor=TEAMS[t],
            )
            for i, (d, t, text) in enumerate(finishers, start=1)
        ),
    )


GRID = _grid(
    ("norris", "mclaren"),
    ("russell", "mercedes"),
    ("leclerc", "ferrari"),
    ("piastri", "mclaren"),
    ("verstappen", "red_bull"),
    ("rookie", "newteam"),
)


def test_build_engines_maps_jolpica_ids_and_picks_latest_engine():
    engines = e.build_engines(FIXTURE, 2026)
    # The 2025 Renault row for McLaren is ignored; "not-in-jolpica" has no Jolpica id.
    # Williams switched to Renault (last used round 3); Aston Martin to Mercedes (round 2).
    assert engines == {
        "aston_martin": "Mercedes",
        "ferrari": "Ferrari",
        "mclaren": "Mercedes",
        "red_bull": "Red Bull Ford",
        "williams": "Renault",
    }


def test_build_engines_notes_mid_season_changes():
    _, notes = e._build(FIXTURE, 2026)
    assert notes == [
        "aston_martin used Honda and Mercedes in 2026; Mercedes is the most recent.",
        "williams used Mercedes and Renault in 2026; Renault is the most recent.",
    ]


def test_build_engines_other_season():
    assert e.build_engines(FIXTURE, 2025) == {"mclaren": "Renault"}


def test_mapping_covers_every_2026_constructor():
    assert sorted(e.JOLPICA_TO_F1DB_CONSTRUCTOR) == JOLPICA_2026_CONSTRUCTORS


def test_committed_file_covers_every_2026_constructor():
    engines = e.load_engines()
    assert sorted(engines) == JOLPICA_2026_CONSTRUCTORS
    assert engines["mclaren"] == "Mercedes"
    assert engines["aston_martin"] == "Honda"


def test_write_is_deterministic_and_round_trips(tmp_path):
    engines, notes = e._build(FIXTURE, 2026)
    first, second = tmp_path / "a.json", tmp_path / "b.json"
    e.write_engines(engines, first, notes=notes)
    e.write_engines(dict(reversed(list(engines.items()))), second, notes=notes)
    assert first.read_bytes() == second.read_bytes()
    assert e.load_engines(first) == engines
    assert f'"source": "f1db {F1DB_VERSION}"' in first.read_text(encoding="utf-8")


def test_engine_facts_counts_wins_podiums_and_cars():
    results = {
        1: _result(
            1,
            ("norris", "mclaren", "1"),
            ("leclerc", "ferrari", "2"),
            ("russell", "mercedes", "3"),
            ("verstappen", "red_bull", "R"),
        ),
        2: _result(
            2,
            ("leclerc", "ferrari", "1"),
            ("piastri", "mclaren", "2"),
            ("verstappen", "red_bull", "3"),
            ("norris", "mclaren", "4"),
        ),
        3: _result(
            3,
            ("russell", "mercedes", "1"),
            ("norris", "mclaren", "2"),
            ("rookie", "newteam", "3"),
            ("leclerc", "ferrari", "4"),
        ),
    }
    lines, drivers = e.engine_facts(2026, 4, GRID, results, ENGINES)
    assert lines == [
        "Power units this season, over 3 races: Mercedes (3 cars) has 2 wins and 5 podiums; "
        "Ferrari (1 car) has 1 win and 2 podiums; Red Bull Ford (1 car) has 0 wins and "
        "1 podium."
    ]
    assert drivers["norris"] == "Norris's McLaren uses a Mercedes power unit."
    assert drivers["verstappen"] == "Verstappen's Red Bull uses a Red Bull Ford power unit."
    assert "rookie" not in drivers  # unknown constructor: omitted, no crash
    assert len(drivers) == 5


def test_engine_facts_before_any_race():
    lines, drivers = e.engine_facts(2026, 1, GRID, {}, ENGINES)
    assert lines == [
        "Power units on the grid: Mercedes (3 cars); Ferrari (1 car); Red Bull Ford (1 car). "
        "No race has been run yet this season."
    ]
    assert len(drivers) == 5


def test_engine_facts_with_no_known_constructor():
    assert e.engine_facts(2026, 1, _grid(("rookie", "newteam")), {}, ENGINES) == ([], {})


@pytest.mark.parametrize(
    "results",
    [
        {4: _result(4, ("norris", "mclaren", "1"))},  # this round
        {5: _result(5, ("norris", "mclaren", "1"))},  # a later round
        {2: _result(3, ("norris", "mclaren", "1"))},  # key disagrees with round
        {2: _result(2, ("norris", "mclaren", "1"), season=2025)},  # another season
    ],
)
def test_engine_facts_rejects_leaks(results):
    with pytest.raises(LeakError):
        e.engine_facts(2026, 4, GRID, results, ENGINES)


def test_no_dashes_in_output():
    results = {1: _result(1, ("norris", "mclaren", "1"))}
    lines, drivers = e.engine_facts(2026, 2, GRID, results, ENGINES)
    text = " ".join([*lines, *drivers.values()])
    assert "\u2014" not in text and "\u2013" not in text
