"""Teammate head-to-head this season, in qualifying and in the race (Decision 2b).

Only earlier rounds count where both drivers took part for the same constructor, so a
driver who was replaced for a few rounds is compared with whoever sat alongside at each
round. A team with one driver, or three or more, on this weekend's grid gets no line.
"""

from collections.abc import Mapping, Sequence
from dataclasses import dataclass

from race_calls.models import Driver, QualifyingEntry, RaceResult, ResultEntry
from race_calls.snapshot import LeakError


@dataclass(frozen=True)
class HeadToHead:
    qualifying_wins: int
    qualifying_total: int
    race_wins: int
    race_total: int
    races_skipped: int  # both raced together but neither was classified


def _check_inputs(
    season: int,
    round: int,
    qualifying_by_round: Mapping[int, Sequence[QualifyingEntry]],
    results_by_round: Mapping[int, RaceResult],
) -> None:
    for key in qualifying_by_round:
        if key >= round:
            raise LeakError(f"qualifying for round {key} is not before round {round}")
    for key, result in results_by_round.items():
        if key >= round:
            raise LeakError(f"result for round {key} is not before round {round}")
        if result.season != season or result.round != key:
            raise LeakError(
                f"result for {result.season} round {result.round} is filed under "
                f"{season} round {key}"
            )


def _plural(n: int, word: str) -> str:
    return word if n == 1 else word + "s"


def _race_winner(a: ResultEntry, b: ResultEntry) -> ResultEntry | None:
    if a.classified and b.classified:
        return a if a.position < b.position else b
    if a.classified:
        return a
    if b.classified:
        return b
    return None


def head_to_head(
    driver_id: str,
    teammate_id: str,
    constructor_id: str,
    qualifying_by_round: Mapping[int, Sequence[QualifyingEntry]],
    results_by_round: Mapping[int, RaceResult],
) -> HeadToHead:
    q_wins = q_total = 0
    for entries in qualifying_by_round.values():
        pair = {
            e.driver.driver_id: e
            for e in entries
            if e.constructor.constructor_id == constructor_id
            and e.driver.driver_id in (driver_id, teammate_id)
        }
        if len(pair) == 2:
            q_total += 1
            q_wins += pair[driver_id].position < pair[teammate_id].position

    r_wins = r_total = skipped = 0
    for result in results_by_round.values():
        both = {
            e.driver.driver_id: e
            for e in result.entries
            if e.constructor.constructor_id == constructor_id
            and e.driver.driver_id in (driver_id, teammate_id)
        }
        if len(both) != 2:
            continue
        winner = _race_winner(both[driver_id], both[teammate_id])
        if winner is None:
            skipped += 1
            continue
        r_total += 1
        r_wins += winner.driver.driver_id == driver_id
    return HeadToHead(q_wins, q_total, r_wins, r_total, skipped)


def _sentence(season: int, me: Driver, mate: Driver, h: HeadToHead) -> str:
    name, other = me.family_name, mate.family_name
    if h.qualifying_total == 0 and h.race_total == 0:
        if h.races_skipped == 0:
            return f"{name} and {other} have not been teammates at an earlier round of {season}."
        return (
            f"In {season}, {name} and teammate {other} have raced together only in races "
            "where neither was classified."
        )

    race = ""
    if h.race_total:
        race = f"{h.race_wins} of {h.race_total} {_plural(h.race_total, 'race')}"
        if h.races_skipped:
            race += (
                f", leaving out {h.races_skipped} {_plural(h.races_skipped, 'race')} "
                "where neither was classified"
            )
    if not h.qualifying_total:
        return f"In {season}, {name} has finished ahead of teammate {other} in {race}."

    quali = (
        f"out-qualified teammate {other} in {h.qualifying_wins} of {h.qualifying_total} "
        f"qualifying {_plural(h.qualifying_total, 'session')}"
    )
    if h.race_total:
        return f"In {season}, {name} has {quali} and finished ahead in {race}."
    if h.races_skipped:
        return (
            f"In {season}, {name} has {quali}; no race together has counted yet, as neither "
            "was classified."
        )
    return f"In {season}, {name} has {quali}; no race together has a result yet."


def teammate_facts(
    season: int,
    round: int,
    current: Sequence[QualifyingEntry],
    qualifying_by_round: Mapping[int, Sequence[QualifyingEntry]],
    results_by_round: Mapping[int, RaceResult],
) -> dict[str, str]:
    """driver_id -> one sentence on the head-to-head with this weekend's teammate."""
    _check_inputs(season, round, qualifying_by_round, results_by_round)

    teams: dict[str, list[Driver]] = {}
    for entry in current:
        drivers = teams.setdefault(entry.constructor.constructor_id, [])
        if entry.driver not in drivers:
            drivers.append(entry.driver)

    facts: dict[str, str] = {}
    for constructor_id, drivers in teams.items():
        if len(drivers) != 2:
            continue
        for me, mate in (drivers, drivers[::-1]):
            h = head_to_head(
                me.driver_id, mate.driver_id, constructor_id, qualifying_by_round, results_by_round
            )
            facts[me.driver_id] = _sentence(season, me, mate, h)
    return facts
