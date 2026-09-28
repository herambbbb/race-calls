import pytest

from race_calls.facts.teammates import head_to_head, teammate_facts
from race_calls.models import Constructor, Driver, QualifyingEntry, RaceResult, ResultEntry
from race_calls.snapshot import LeakError

MCL = Constructor(constructor_id="mclaren", name="McLaren")
RBR = Constructor(constructor_id="red_bull", name="Red Bull")
NOR = Driver(driver_id="norris", code="NOR", number=4, given_name="Lando", family_name="Norris")
PIA = Driver(driver_id="piastri", code="PIA", number=81, given_name="Oscar", family_name="Piastri")
VER = Driver(
    driver_id="max_verstappen", code="VER", number=1, given_name="Max", family_name="Verstappen"
)
HAD = Driver(driver_id="hadjar", code="HAD", number=6, given_name="Isack", family_name="Hadjar")
TSU = Driver(driver_id="tsunoda", code="TSU", number=22, given_name="Yuki", family_name="Tsunoda")


def quali(*order: tuple[Driver, Constructor]) -> list[QualifyingEntry]:
    return [
        QualifyingEntry(position=i, driver=d, constructor=c)
        for i, (d, c) in enumerate(order, start=1)
    ]


def race(round_: int, *order: tuple[Driver, Constructor, str], season: int = 2026) -> RaceResult:
    """Each line is (driver, constructor, position_text); order is the classification."""
    return RaceResult(
        season=season,
        round=round_,
        entries=tuple(
            ResultEntry(
                position=i,
                position_text=text,
                points=0,
                grid=i,
                laps=50 if text.isdigit() else 10,
                status="Finished" if text.isdigit() else "Retired",
                driver=d,
                constructor=c,
            )
            for i, (d, c, text) in enumerate(order, start=1)
        ),
    )


CURRENT = quali((NOR, MCL), (VER, RBR), (PIA, MCL))


def test_counts_qualifying_and_races() -> None:
    qualifying = {
        1: quali((NOR, MCL), (PIA, MCL)),
        2: quali((PIA, MCL), (NOR, MCL)),
        3: quali((NOR, MCL), (VER, RBR), (PIA, MCL)),
    }
    results = {
        1: race(1, (NOR, MCL, "1"), (PIA, MCL, "2")),
        2: race(2, (PIA, MCL, "1"), (NOR, MCL, "2")),
        3: race(3, (NOR, MCL, "1"), (PIA, MCL, "2")),
    }
    facts = teammate_facts(2026, 4, CURRENT, qualifying, results)
    assert facts == {
        "norris": "In 2026, Norris has out-qualified teammate Piastri in 2 of 3 qualifying "
        "sessions and finished ahead in 2 of 3 races.",
        "piastri": "In 2026, Piastri has out-qualified teammate Norris in 1 of 3 qualifying "
        "sessions and finished ahead in 1 of 3 races.",
    }
    # Verstappen has no teammate on this grid: nothing to say.
    assert "max_verstappen" not in facts


def test_retirement_goes_to_the_classified_driver_and_neither_is_skipped() -> None:
    qualifying = {1: quali((NOR, MCL), (PIA, MCL)), 2: quali((NOR, MCL), (PIA, MCL))}
    results = {
        # Norris retired, but is listed first; Piastri was classified and wins it.
        1: race(1, (NOR, MCL, "R"), (PIA, MCL, "5")),
        # Both out: not counted.
        2: race(2, (PIA, MCL, "R"), (NOR, MCL, "D")),
    }
    h = head_to_head("norris", "piastri", "mclaren", qualifying, results)
    assert (h.race_wins, h.race_total, h.races_skipped) == (0, 1, 1)
    facts = teammate_facts(2026, 3, CURRENT, qualifying, results)
    assert facts["piastri"] == (
        "In 2026, Piastri has out-qualified teammate Norris in 0 of 2 qualifying sessions "
        "and finished ahead in 1 of 1 race, leaving out 1 race where neither was classified."
    )


def test_only_non_classified_races() -> None:
    results = {1: race(1, (NOR, MCL, "R"), (PIA, MCL, "R"))}
    facts = teammate_facts(2026, 2, CURRENT, {}, results)
    assert facts["norris"] == (
        "In 2026, Norris and teammate Piastri have raced together only in races where "
        "neither was classified."
    )
    qualifying = {1: quali((NOR, MCL), (PIA, MCL))}
    facts = teammate_facts(2026, 2, CURRENT, qualifying, results)
    assert facts["norris"] == (
        "In 2026, Norris has out-qualified teammate Piastri in 1 of 1 qualifying session; "
        "no race together has counted yet, as neither was classified."
    )


def test_qualifying_without_race_and_race_without_qualifying() -> None:
    facts = teammate_facts(2026, 2, CURRENT, {1: quali((PIA, MCL), (NOR, MCL))}, {})
    assert facts["piastri"] == (
        "In 2026, Piastri has out-qualified teammate Norris in 1 of 1 qualifying session; "
        "no race together has a result yet."
    )
    facts = teammate_facts(2026, 2, CURRENT, {}, {1: race(1, (PIA, MCL, "3"), (NOR, MCL, "4"))})
    assert (
        facts["norris"] == "In 2026, Norris has finished ahead of teammate Piastri in 0 of 1 race."
    )


def test_driver_swap_mid_season() -> None:
    """Tsunoda races rounds 1-11 and 15, Hadjar stands in for 12-14; Verstappen throughout."""
    qualifying: dict[int, list[QualifyingEntry]] = {}
    results: dict[int, RaceResult] = {}
    for r in range(1, 16):
        mate = HAD if 12 <= r <= 14 else TSU
        qualifying[r] = quali((VER, RBR), (mate, RBR))
        # The stand-in beats Verstappen once, in round 13.
        order = (
            [(mate, RBR, "1"), (VER, RBR, "2")] if r == 13 else [(VER, RBR, "1"), (mate, RBR, "2")]
        )
        results[r] = race(r, *order)
    current = quali((VER, RBR), (TSU, RBR), (NOR, MCL))
    facts = teammate_facts(2026, 16, current, qualifying, results)
    assert facts["max_verstappen"] == (
        "In 2026, Verstappen has out-qualified teammate Tsunoda in 12 of 12 qualifying "
        "sessions and finished ahead in 12 of 12 races."
    )
    assert facts["tsunoda"].startswith(
        "In 2026, Tsunoda has out-qualified teammate Verstappen in 0 of 12"
    )

    # Hadjar back in the car for round 16 would be compared only over rounds 12-14.
    current = quali((VER, RBR), (HAD, RBR))
    facts = teammate_facts(2026, 16, current, qualifying, results)
    assert facts["hadjar"] == (
        "In 2026, Hadjar has out-qualified teammate Verstappen in 0 of 3 qualifying "
        "sessions and finished ahead in 1 of 3 races."
    )


def test_rounds_with_a_different_team_do_not_count() -> None:
    """Earlier rounds where one of the pair drove for another team are not head-to-heads."""
    qualifying = {1: quali((HAD, MCL), (TSU, RBR)), 2: quali((HAD, RBR), (TSU, RBR))}
    results = {1: race(1, (HAD, MCL, "1"), (TSU, RBR, "2"))}
    current = quali((HAD, RBR), (TSU, RBR))
    facts = teammate_facts(2026, 3, current, qualifying, results)
    assert facts["hadjar"] == (
        "In 2026, Hadjar has out-qualified teammate Tsunoda in 1 of 1 qualifying session; "
        "no race together has a result yet."
    )


def test_new_pairing() -> None:
    qualifying = {1: quali((HAD, MCL), (TSU, RBR))}
    current = quali((HAD, RBR), (TSU, RBR))
    facts = teammate_facts(2026, 2, current, qualifying, {})
    assert facts == {
        "hadjar": "Hadjar and Tsunoda have not been teammates at an earlier round of 2026.",
        "tsunoda": "Tsunoda and Hadjar have not been teammates at an earlier round of 2026.",
    }
    # Round 1: nothing earlier at all.
    assert teammate_facts(2026, 1, current, {}, {})["hadjar"].startswith("Hadjar and Tsunoda")


def test_one_or_three_drivers_in_a_team_are_skipped() -> None:
    current = quali((NOR, MCL), (PIA, MCL), (HAD, MCL), (VER, RBR))
    assert teammate_facts(2026, 2, current, {}, {}) == {}


def test_leak_guard() -> None:
    q = {1: quali((NOR, MCL), (PIA, MCL))}
    with pytest.raises(LeakError):
        teammate_facts(2026, 5, CURRENT, {5: q[1]}, {})
    with pytest.raises(LeakError):
        teammate_facts(2026, 5, CURRENT, {}, {6: race(6, (NOR, MCL, "1"))})
    with pytest.raises(LeakError):
        teammate_facts(2026, 5, CURRENT, {}, {3: race(4, (NOR, MCL, "1"))})
    with pytest.raises(LeakError):
        teammate_facts(2026, 5, CURRENT, {}, {3: race(3, (NOR, MCL, "1"), season=2025)})


def test_sentences_are_plain() -> None:
    qualifying = {r: quali((NOR, MCL), (PIA, MCL)) for r in range(1, 15)}
    results = {r: race(r, (PIA, MCL, "1"), (NOR, MCL, "2")) for r in range(1, 14)}
    for line in teammate_facts(2026, 15, CURRENT, qualifying, results).values():
        assert len(line.split()) <= 40
        assert "\u2014" not in line and "\u2013" not in line
        assert not {"he", "she", "his", "her", "they", "their"} & set(line.lower().split())
