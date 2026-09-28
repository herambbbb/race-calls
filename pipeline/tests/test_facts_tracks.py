import json
from datetime import UTC, datetime
from pathlib import Path

import pytest

from race_calls.facts.tracks import TRAITS, TRAITS_PATH, load_traits, similar_track_facts
from race_calls.models import (
    Constructor,
    Driver,
    QualifyingEntry,
    RaceResult,
    ResultEntry,
    Weekend,
)
from race_calls.snapshot import LeakError

FIXTURES = Path(__file__).parent / "fixtures"

# https://api.jolpi.ca/ergast/f1/2026/circuits/, fetched 2026-09-28.
JOLPICA_2026_CIRCUITS = {
    "albert_park", "americas", "baku", "catalunya", "hungaroring", "interlagos", "jeddah",
    "losail", "madring", "marina_bay", "miami", "monaco", "monza", "red_bull_ring",
    "rodriguez", "sepang", "shanghai", "silverstone", "spa", "suzuka", "vegas", "villeneuve",
    "yas_marina", "zandvoort",
}  # fmt: skip

MCL = Constructor(constructor_id="mclaren", name="McLaren")
RBR = Constructor(constructor_id="red_bull", name="Red Bull")
NOR = Driver(driver_id="norris", code="NOR", number=4, given_name="Lando", family_name="Norris")
VER = Driver(
    driver_id="max_verstappen", code="VER", number=1, given_name="Max", family_name="Verstappen"
)
PIA = Driver(driver_id="piastri", code="PIA", number=81, given_name="Oscar", family_name="Piastri")

TRAITS_MAP = {
    "monza": ("long_straights",),
    "baku": ("street", "long_straights"),
    "monaco": ("street", "high_downforce"),
    "silverstone": ("high_speed_corners",),
    "spa": ("long_straights", "high_speed_corners"),
    "hungaroring": ("high_downforce", "hot"),
}


def weekend(round_: int, name: str, circuit_id: str) -> Weekend:
    return Weekend(
        season=2026,
        round=round_,
        name=name,
        slug=name.lower().replace(" ", "-"),
        circuit_id=circuit_id,
        circuit_name=circuit_id,
        locality="x",
        country="x",
        race_start=datetime(2026, 1, 1, tzinfo=UTC),
    )


CALENDAR = [
    weekend(1, "Monaco Grand Prix", "monaco"),
    weekend(2, "Italian Grand Prix", "monza"),
    weekend(3, "British Grand Prix", "silverstone"),
    weekend(4, "Azerbaijan Grand Prix", "baku"),
    weekend(5, "Hungarian Grand Prix", "hungaroring"),
    weekend(6, "Belgian Grand Prix", "spa"),
]
SPA = CALENDAR[5]
GRID = [
    QualifyingEntry(position=2, driver=VER, constructor=RBR),
    QualifyingEntry(position=1, driver=NOR, constructor=MCL),
    QualifyingEntry(position=3, driver=PIA, constructor=MCL),
]


def entry(driver: Driver, position: int, text: str | None = None) -> ResultEntry:
    return ResultEntry(
        position=position,
        position_text=text or str(position),
        points=0,
        grid=position,
        laps=50,
        status="Finished" if text is None else "Retired",
        driver=driver,
        constructor=MCL if driver is not VER else RBR,
    )


def result(round_: int, *entries: ResultEntry) -> RaceResult:
    return RaceResult(season=2026, round=round_, entries=entries)


RESULTS = {
    1: result(1, entry(NOR, 1), entry(VER, 2)),
    2: result(2, entry(NOR, 1), entry(VER, 2)),
    3: result(3, entry(VER, 1), entry(NOR, 20, "R")),
    4: result(4, entry(NOR, 4), entry(VER, 19, "R")),
    5: result(5, entry(NOR, 3), entry(VER, 5)),
}


def test_selects_rounds_sharing_a_trait_in_round_order():
    lines, drivers = similar_track_facts(SPA, CALENDAR, GRID, RESULTS, TRAITS_MAP)
    assert lines == [
        "This circuit is classed as having long straights and high-speed corners (this "
        "project's own classification). Earlier races this season at circuits sharing a trait: "
        "Italian Grand Prix (long straights), British Grand Prix (high-speed corners), "
        "Azerbaijan Grand Prix (long straights)."
    ]
    assert drivers["norris"] == (
        "At those circuits, Norris finished 1st in the Italian Grand Prix, retired in the "
        "British Grand Prix and finished 4th in the Azerbaijan Grand Prix, averaging 2.5 in "
        "the 2 races finished."
    )
    assert drivers["max_verstappen"] == (
        "At those circuits, Verstappen finished 2nd in the Italian Grand Prix, finished 1st in "
        "the British Grand Prix and retired in the Azerbaijan Grand Prix, averaging 1.5 in the "
        "2 races finished."
    )
    assert drivers["piastri"] == "Piastri has not raced at those circuits this season."
    assert list(drivers) == ["norris", "max_verstappen", "piastri"]  # grid order


def test_no_similar_rounds():
    hungary = CALENDAR[4]
    only_fast = {3: RESULTS[3]}
    lines, drivers = similar_track_facts(hungary, CALENDAR, GRID, only_fast, TRAITS_MAP)
    assert lines == [
        "This circuit is classed as having high downforce demands and hot race conditions "
        "(this project's own classification). No earlier race this season was at a circuit "
        "sharing a trait."
    ]
    assert drivers == {}


def test_circuit_without_traits():
    lines, drivers = similar_track_facts(
        weekend(6, "Mystery Grand Prix", "nowhere"), CALENDAR, GRID, RESULTS, TRAITS_MAP
    )
    assert "no traits" in lines[0]
    assert drivers == {}


def test_only_retirements():
    results = {2: result(2, entry(NOR, 20, "R")), 4: result(4, entry(NOR, 19, "D"))}
    _, drivers = similar_track_facts(SPA, CALENDAR, GRID[1:2], results, TRAITS_MAP)
    assert drivers["norris"] == (
        "At those circuits, Norris retired in the Italian Grand Prix and was disqualified in "
        "the Azerbaijan Grand Prix, finishing none of them."
    )
    _, drivers = similar_track_facts(
        SPA, CALENDAR, GRID[1:2], {2: result(2, entry(NOR, 3))}, TRAITS_MAP
    )
    assert drivers["norris"] == (
        "At those circuits, Norris finished 3rd in the Italian Grand Prix, averaging 3 in the 1 "
        "race finished."
    )


def test_leak_guard():
    with pytest.raises(LeakError):
        similar_track_facts(SPA, CALENDAR, GRID, {**RESULTS, 6: result(6)}, TRAITS_MAP)
    with pytest.raises(LeakError):
        similar_track_facts(SPA, CALENDAR, GRID, {2: result(3)}, TRAITS_MAP)
    other_season = RaceResult(season=2025, round=2, entries=())
    with pytest.raises(LeakError):
        similar_track_facts(SPA, CALENDAR, GRID, {2: other_season}, TRAITS_MAP)


def test_deterministic():
    first = similar_track_facts(SPA, CALENDAR, GRID, RESULTS, TRAITS_MAP)
    shuffled = dict(reversed(list(RESULTS.items())))
    second = similar_track_facts(SPA, list(reversed(CALENDAR)), GRID[::-1], shuffled, TRAITS_MAP)
    assert first == second
    assert list(first[1]) == list(second[1])


def test_rejects_unknown_or_too_many_traits():
    with pytest.raises(ValueError, match="unknown traits"):
        similar_track_facts(SPA, CALENDAR, GRID, RESULTS, {"spa": ("bumpy",)})
    with pytest.raises(ValueError, match="1 to 3"):
        similar_track_facts(SPA, CALENDAR, GRID, RESULTS, {"spa": ()})


def test_committed_file_covers_the_2026_calendar_with_known_traits():
    traits = load_traits()
    assert set(traits) >= JOLPICA_2026_CIRCUITS
    races = json.loads((FIXTURES / "jolpica" / "2026_races.json").read_text())
    calendar_ids = {r["Circuit"]["circuitId"] for r in races["MRData"]["RaceTable"]["Races"]}
    assert set(traits) >= calendar_ids
    for tags in traits.values():
        assert 1 <= len(tags) <= 3
        assert set(tags) <= TRAITS.keys()

    raw = json.loads(TRAITS_PATH.read_text())
    assert raw["reviewed"] and raw["version"] and "own judgement" in raw["note"]
    assert all(entry["reason"] for entry in raw["circuits"].values())
    text = TRAITS_PATH.read_text()
    assert "\u2014" not in text and "\u2013" not in text


def test_load_traits_rejects_bad_vocabulary(tmp_path):
    bad = tmp_path / "traits.json"
    bad.write_text(json.dumps({"circuits": {"monza": {"traits": ["fast"], "reason": "x"}}}))
    with pytest.raises(ValueError, match="unknown traits"):
        load_traits(bad)
