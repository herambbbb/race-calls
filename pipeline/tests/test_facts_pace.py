import json
from pathlib import Path
from typing import Any

import httpx
import pytest
import respx

from race_calls.facts.pace import PROXY_LINE, pace_facts, qualifying_laps
from race_calls.jolpica import BASE_URL as JOLPICA_URL
from race_calls.jolpica import JolpicaClient
from race_calls.models import Constructor, Driver, QualifyingEntry
from race_calls.openf1.client import BASE_URL, LiveSessionLockout, OpenF1Client
from race_calls.openf1.ratelimit import SlidingWindowLimiter
from race_calls.snapshot import LeakError

FIXTURES = Path(__file__).parent / "fixtures"
LIVE = (
    "Live F1 session in progress. Global API access (including past sessions) is "
    "restricted to authenticated users until the session ends."
)


def _laps() -> list[dict[str, Any]]:
    data: list[dict[str, Any]] = json.loads(
        (FIXTURES / "pace" / "laps_2026_azerbaijan_qualifying.json").read_text()
    )
    return data


@pytest.fixture
def baku() -> list[QualifyingEntry]:
    raw = json.loads((FIXTURES / "jolpica" / "2026_15_qualifying.json").read_text())
    with respx.mock, httpx.Client() as http:
        respx.get(f"{JOLPICA_URL}/2026/15/qualifying/").respond(json=raw)
        return JolpicaClient(http=http).qualifying(2026, 15)


def _entry(number: int | None, family: str, position: int = 1) -> QualifyingEntry:
    return QualifyingEntry(
        position=position,
        driver=Driver(
            driver_id=family.lower(),
            code=family[:3].upper(),
            number=number,
            given_name="Test",
            family_name=family,
        ),
        constructor=Constructor(constructor_id="team", name="Team"),
    )


def _lap(
    number: int,
    st: Any = None,
    s1: Any = None,
    s2: Any = None,
    s3: Any = None,
    pit_out: bool = False,
    session_key: int = 1,
) -> dict[str, Any]:
    return {
        "session_key": session_key,
        "driver_number": number,
        "st_speed": st,
        "duration_sector_1": s1,
        "duration_sector_2": s2,
        "duration_sector_3": s3,
        "is_pit_out_lap": pit_out,
    }


FIELD = [_entry(1, "Norris"), _entry(16, "Leclerc", 2), _entry(63, "Russell", 3)]


# --- real fixture: 2026 Azerbaijan qualifying ------------------------------------------


def test_real_fixture_sentences(baku):
    lines, facts = pace_facts(_laps(), baku)
    assert len(facts) == 22
    assert facts["russell"] == (
        "In qualifying, Russell was joint 2nd fastest through the speed trap (328 km/h) "
        "and ranked 1st, 1st and 1st in sectors one, two and three."
    )
    assert facts["ocon"] == (
        "In qualifying, Ocon was the fastest through the speed trap (330 km/h) "
        "and ranked 10th, 11th and 4th in sectors one, two and three."
    )
    assert facts["norris"] == (
        "In qualifying, Norris was joint 18th fastest through the speed trap (317 km/h) "
        "and ranked 5th, 2nd and 16th in sectors one, two and three."
    )
    assert lines == [
        PROXY_LINE,
        "Fastest through the qualifying speed trap: Ocon 330 km/h, Hamilton 328 km/h, "
        "Russell 328 km/h, Bottas 328 km/h.",
    ]


def test_proxy_line_is_honest():
    assert PROXY_LINE == (
        "Speed-trap and sector rankings from qualifying are a rough proxy for straight-line "
        "speed and cornering; they are not aero measurements."
    )


def test_real_fixture_pit_out_laps_are_skipped(baku):
    # Every driver's out lap has a null sector one; dropping out laps changes nothing
    # else, and keeping only out laps leaves nothing.
    out_laps = [lap for lap in _laps() if lap["is_pit_out_lap"]]
    assert out_laps
    assert pace_facts(out_laps, baku) == ([], {})


def test_no_prose_dashes_or_pronouns(baku):
    lines, facts = pace_facts(_laps(), baku)
    text = " ".join([*lines, *facts.values()])
    assert "\u2014" not in text and "\u2013" not in text
    sentences = f" {' '.join(facts.values()).lower()} "
    for pronoun in (" he ", " his ", " she ", " her ", " they ", " their "):
        assert pronoun not in sentences


# --- ranking ---------------------------------------------------------------------------


def test_best_values_and_ranks():
    laps = [
        _lap(1, st=320, s1=30.5, s2=40.0, s3=20.3),
        _lap(1, st=325, s1=30.1, s2=40.9, s3=20.9),  # best of each field, not best lap
        _lap(16, st=330, s1=30.3, s2=39.8, s3=20.1),
        _lap(63, st=318, s1=30.0, s2=40.5, s3=20.2),
    ]
    lines, facts = pace_facts(laps, FIELD)
    assert facts["norris"] == (
        "In qualifying, Norris was 2nd fastest through the speed trap (325 km/h) "
        "and ranked 2nd, 2nd and 3rd in sectors one, two and three."
    )
    assert facts["leclerc"] == (
        "In qualifying, Leclerc was the fastest through the speed trap (330 km/h) "
        "and ranked 3rd, 1st and 1st in sectors one, two and three."
    )
    assert facts["russell"] == (
        "In qualifying, Russell was 3rd fastest through the speed trap (318 km/h) "
        "and ranked 1st, 3rd and 2nd in sectors one, two and three."
    )
    assert lines[1] == (
        "Fastest through the qualifying speed trap: Leclerc 330 km/h, Norris 325 km/h, "
        "Russell 318 km/h."
    )


def test_ties_share_a_rank_and_ignore_input_order():
    laps = [
        _lap(1, st=325, s1=30.0),
        _lap(16, st=325, s1=30.0),
        _lap(63, st=320, s1=30.5),
    ]
    forwards = pace_facts(laps, FIELD)
    assert pace_facts(list(reversed(laps)), list(reversed(FIELD))) == forwards
    _, facts = forwards
    assert facts["norris"] == (
        "In qualifying, Norris was joint fastest through the speed trap (325 km/h) "
        "and ranked joint 1st in sector one."
    )
    assert facts["russell"] == (
        "In qualifying, Russell was 3rd fastest through the speed trap (320 km/h) "
        "and ranked 3rd in sector one."
    )
    assert list(facts) == ["norris", "leclerc", "russell"]  # by car number


def test_top_speeds_list_everyone_tied_at_the_cutoff():
    field = [*FIELD, _entry(44, "Hamilton", 4)]
    laps = [_lap(1, st=330), _lap(16, st=325), _lap(44, st=320), _lap(63, st=320)]
    lines, _ = pace_facts(laps, field)
    assert lines[1] == (
        "Fastest through the qualifying speed trap: Norris 330 km/h, Leclerc 325 km/h, "
        "Hamilton 320 km/h, Russell 320 km/h."
    )


# --- skipping laps and values -----------------------------------------------------------


def test_pit_out_laps_are_skipped():
    laps = [
        _lap(1, st=350, s1=20.0, s2=30.0, s3=10.0, pit_out=True),
        _lap(1, st=320, s1=30.5, s2=40.5, s3=20.5),
        _lap(16, st=325, s1=30.0, s2=40.0, s3=20.0),
    ]
    _, facts = pace_facts(laps, FIELD)
    assert facts["norris"] == (
        "In qualifying, Norris was 2nd fastest through the speed trap (320 km/h) "
        "and ranked 2nd, 2nd and 2nd in sectors one, two and three."
    )


@pytest.mark.parametrize("bad", [None, 0, -1, 1.0, 999, 5000.0, float("nan"), True, "320"])
def test_invalid_values_are_skipped(bad):
    laps = [
        _lap(1, st=bad, s1=bad, s2=bad, s3=bad),
        _lap(1, st=315, s1=31.0, s2=41.0, s3=21.0),
        _lap(16, st=320, s1=30.0, s2=40.0, s3=20.0),
    ]
    _, facts = pace_facts(laps, FIELD)
    assert facts["norris"] == (
        "In qualifying, Norris was 2nd fastest through the speed trap (315 km/h) "
        "and ranked 2nd, 2nd and 2nd in sectors one, two and three."
    )


def test_each_value_is_read_on_its_own():
    # A null sector one (typical of an aborted lap) keeps the rest of the lap.
    laps = [_lap(1, st=None, s1=None, s2=40.0, s3=None), _lap(16, st=320, s1=30.0)]
    _, facts = pace_facts(laps, FIELD)
    assert facts["norris"] == "In qualifying, Norris ranked 1st in sector two."
    assert facts["leclerc"] == (
        "In qualifying, Leclerc was the fastest through the speed trap (320 km/h) "
        "and ranked 1st in sector one."
    )


def test_partial_sectors_and_speed_only():
    laps = [_lap(1, st=320, s1=30.0, s3=20.0), _lap(16, st=321)]
    _, facts = pace_facts(laps, FIELD)
    assert facts["norris"] == (
        "In qualifying, Norris was 2nd fastest through the speed trap (320 km/h) "
        "and ranked 1st and 1st in sectors one and three."
    )
    assert facts["leclerc"] == (
        "In qualifying, Leclerc was the fastest through the speed trap (321 km/h)."
    )


def test_driver_with_no_valid_values_gets_no_sentence():
    laps = [_lap(1, st=320), _lap(16, st=None, s1=None), _lap(63, st=330, pit_out=True)]
    _, facts = pace_facts(laps, FIELD)
    assert list(facts) == ["norris"]


# --- matching drivers -------------------------------------------------------------------


def test_unknown_driver_numbers_are_omitted():
    laps = [
        _lap(1, st=320, s1=30.0),
        _lap(99, st=340, s1=29.0),  # not in this weekend's qualifying
        {"session_key": 1, "driver_number": None, "st_speed": 345},
        {"session_key": 1, "st_speed": 346},
    ]
    field = [*FIELD, _entry(None, "Nobody", 4)]
    lines, facts = pace_facts(laps, field)
    assert facts == {
        "norris": (
            "In qualifying, Norris was the fastest through the speed trap (320 km/h) "
            "and ranked 1st in sector one."
        )
    }
    assert lines[1] == "Fastest through the qualifying speed trap: Norris 320 km/h."


def test_no_laps_means_no_facts():
    assert pace_facts([], FIELD) == ([], {})
    assert pace_facts([_lap(1, st=320)], []) == ([], {})


def test_laps_from_more_than_one_session_are_refused():
    laps = [_lap(1, st=320, session_key=11373), _lap(16, st=321, session_key=11380)]
    with pytest.raises(LeakError, match="more than one session"):
        pace_facts(laps, FIELD)


# --- fetching ---------------------------------------------------------------------------


def _client() -> OpenF1Client:
    return OpenF1Client(httpx.Client(), limiter=SlidingWindowLimiter([(1000, 1.0)]))


@respx.mock
def test_qualifying_laps_fetches_one_session():
    route = respx.get(f"{BASE_URL}/laps", params={"session_key": "11373"}).mock(
        return_value=httpx.Response(200, json=_laps())
    )
    assert len(qualifying_laps(_client(), 11373)) == 373
    assert route.call_count == 1


@respx.mock
def test_live_session_lockout_propagates():
    respx.get(f"{BASE_URL}/laps").mock(return_value=httpx.Response(401, json={"detail": LIVE}))
    with pytest.raises(LiveSessionLockout):
        qualifying_laps(_client(), 11373)
