"""Similar-track form: results this season at circuits sharing a trait (Decision 2b).

Each circuit is tagged with a few traits from a fixed vocabulary in
priors/circuit-traits.json. The tags are this project's own judgement, and every
sentence that uses them says so. Only earlier rounds of the same season count.
"""

import json
from collections.abc import Mapping, Sequence
from pathlib import Path

from race_calls.models import QualifyingEntry, RaceResult, ResultEntry, Weekend
from race_calls.settings import PROJECT_ROOT
from race_calls.snapshot import NOT_CLASSIFIED, LeakError, ordinal

TRAITS_PATH = PROJECT_ROOT / "priors" / "circuit-traits.json"

# trait -> (phrase after "classed as having", short label)
TRAITS: dict[str, tuple[str, str]] = {
    "high_altitude": ("high altitude", "high altitude"),
    "long_straights": ("long straights", "long straights"),
    "street": ("a street layout", "street"),
    "high_downforce": ("high downforce demands", "high downforce"),
    "high_speed_corners": ("high-speed corners", "high-speed corners"),
    "hot": ("hot race conditions", "hot"),
}


def _check_traits(traits: Mapping[str, Sequence[str]]) -> None:
    for circuit_id, tags in traits.items():
        unknown = sorted(set(tags) - TRAITS.keys())
        if unknown:
            raise ValueError(f"circuit {circuit_id} has unknown traits: {', '.join(unknown)}")
        if not 1 <= len(tags) <= 3 or len(set(tags)) != len(tags):
            raise ValueError(f"circuit {circuit_id} needs 1 to 3 distinct traits")


def load_traits(path: Path = TRAITS_PATH) -> dict[str, tuple[str, ...]]:
    """Circuit id -> traits, validated against the vocabulary."""
    circuits = json.loads(path.read_text())["circuits"]
    traits = {cid: tuple(entry["traits"]) for cid, entry in circuits.items()}
    _check_traits(traits)
    return traits


def _check_inputs(weekend: Weekend, results_by_round: Mapping[int, RaceResult]) -> None:
    for key, result in results_by_round.items():
        if key >= weekend.round:
            raise LeakError(f"result for round {key} is not before round {weekend.round}")
        if result.season != weekend.season or result.round != key:
            raise LeakError(
                f"result for {result.season} round {result.round} is filed under "
                f"{weekend.season} round {key}"
            )


def _join(items: Sequence[str]) -> str:
    if len(items) <= 1:
        return "".join(items)
    return ", ".join(items[:-1]) + " and " + items[-1]


def _plural(n: int, word: str) -> str:
    return word if n == 1 else word + "s"


def _finish_in(entry: ResultEntry, race_name: str) -> str:
    if entry.classified:
        return f"finished {ordinal(entry.position)} in the {race_name}"
    return NOT_CLASSIFIED.get(entry.position_text, f"did not finish ({entry.status})") + (
        f" in the {race_name}"
    )


def _driver_sentence(entry: QualifyingEntry, similar: Sequence[tuple[str, RaceResult]]) -> str:
    surname = entry.driver.family_name
    finishes: list[str] = []
    positions: list[int] = []
    for race_name, result in similar:
        mine = next(
            (e for e in result.entries if e.driver.driver_id == entry.driver.driver_id), None
        )
        if mine is None:
            continue
        finishes.append(_finish_in(mine, race_name))
        if mine.classified:
            positions.append(mine.position)
    if not finishes:
        return f"{surname} has not raced at those circuits this season."
    if positions:
        average = round(sum(positions) / len(positions), 1)
        tail = (
            f", averaging {average:g} in the {len(positions)} "
            f"{_plural(len(positions), 'race')} finished"
        )
    else:
        tail = f", finishing none of {'it' if len(finishes) == 1 else 'them'}"
    return f"At those circuits, {surname} {_join(finishes)}{tail}."


def similar_track_facts(
    weekend: Weekend,
    calendar: Sequence[Weekend],
    current: Sequence[QualifyingEntry],
    results_by_round: Mapping[int, RaceResult],
    traits: Mapping[str, Sequence[str]],
) -> tuple[list[str], dict[str, str]]:
    """(race-level lines, driver_id -> one sentence) for this weekend's grid."""
    _check_inputs(weekend, results_by_round)
    _check_traits(traits)

    mine = list(traits.get(weekend.circuit_id, ()))
    if not mine:
        return [
            "This circuit has no traits in this project's own classification, so there is "
            "no similar-track form."
        ], {}

    described = f"This circuit is classed as having {_join([TRAITS[t][0] for t in mine])}"
    described += " (this project's own classification)."

    rounds = {w.round: w for w in calendar if w.season == weekend.season}
    similar: list[tuple[str, RaceResult]] = []
    labels: list[str] = []
    for key in sorted(results_by_round):
        earlier = rounds.get(key)
        if earlier is None:
            continue
        shared = [t for t in mine if t in traits.get(earlier.circuit_id, ())]
        if shared:
            similar.append((earlier.name, results_by_round[key]))
            labels.append(f"{earlier.name} ({', '.join(TRAITS[t][1] for t in shared)})")

    if not similar:
        return [described + " No earlier race this season was at a circuit sharing a trait."], {}

    line = described + " Earlier races this season at circuits sharing a trait: "
    line += ", ".join(labels) + "."
    drivers = {
        entry.driver.driver_id: _driver_sentence(entry, similar)
        for entry in sorted(current, key=lambda e: e.position)
    }
    return [line], drivers
