"""Power unit supplier per car, and each supplier's results this season (Decision 2b).

Run `python -m race_calls.facts.engines` to read the pinned f1db release from the local
cache (downloading and verifying it first if needed) and write priors/engines-2026.json,
which is committed. The supplier comes from f1db's entrant data, never typed by hand.

A constructor that changed engine during a season gets the one it used most recently:
the latest round in f1db's race results with that pairing. The file notes each change.
"""

import csv
import json
from collections import Counter
from collections.abc import Mapping, Sequence
from pathlib import Path

from race_calls.models import QualifyingEntry, RaceResult
from race_calls.priors import F1DB_VERSION, download_f1db
from race_calls.settings import PROJECT_ROOT, get_settings
from race_calls.snapshot import LeakError

SEASON = 2026
ENGINES_PATH = PROJECT_ROOT / "priors" / f"engines-{SEASON}.json"

# Jolpica constructor id -> f1db constructor id, for every 2026 constructor
# (https://api.jolpi.ca/ergast/f1/2026/constructors/).
JOLPICA_TO_F1DB_CONSTRUCTOR: dict[str, str] = {
    "alpine": "alpine",
    "aston_martin": "aston-martin",
    "audi": "audi",
    "cadillac": "cadillac",
    "ferrari": "ferrari",
    "haas": "haas",
    "mclaren": "mclaren",
    "mercedes": "mercedes",
    "rb": "racing-bulls",
    "red_bull": "red-bull",
    "williams": "williams",
}


def _rows(source: Path, name: str) -> list[dict[str, str]]:
    with (source / f"f1db-{name}.csv").open(encoding="utf-8", newline="") as f:
        return list(csv.DictReader(f))


def _build(source: Path, season: int) -> tuple[dict[str, str], list[str]]:
    """(jolpica constructor id -> manufacturer name, notes on mid-season engine changes)."""
    names = {row["id"]: row["name"] for row in _rows(source, "engine-manufacturers")}
    used: dict[str, set[str]] = {}
    for row in _rows(source, "seasons-entrants-engines"):
        if int(row["year"]) == season:
            used.setdefault(row["constructorId"], set()).add(row["engineManufacturerId"])
    last_round: dict[tuple[str, str], int] = {}
    for row in _rows(source, "races-race-results"):
        if int(row["year"]) == season:
            key = row["constructorId"], row["engineManufacturerId"]
            last_round[key] = max(int(row["round"]), last_round.get(key, 0))

    engines: dict[str, str] = {}
    notes: list[str] = []
    for jolpica_id, f1db_id in sorted(JOLPICA_TO_F1DB_CONSTRUCTOR.items()):
        makers = used.get(f1db_id)
        if not makers:
            continue
        # Latest round first; ties (no race yet) fall back to the id, for determinism.
        chosen = max(sorted(makers), key=lambda m: last_round.get((f1db_id, m), 0))
        engines[jolpica_id] = names[chosen]
        if len(makers) > 1:
            others = ", ".join(names[m] for m in sorted(makers) if m != chosen)
            notes.append(
                f"{jolpica_id} used {others} and {names[chosen]} in {season}; "
                f"{names[chosen]} is the most recent."
            )
    return engines, notes


def build_engines(source: Path, season: int = SEASON) -> dict[str, str]:
    """Jolpica constructor id -> power unit manufacturer name, from an extracted f1db."""
    return _build(source, season)[0]


def write_engines(
    engines: Mapping[str, str],
    path: Path = ENGINES_PATH,
    season: int = SEASON,
    notes: Sequence[str] = (),
) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    data = {
        "source": f"f1db {F1DB_VERSION}",
        "season": season,
        "engines": dict(engines),
        "notes": list(notes),
    }
    path.write_text(
        json.dumps(data, indent=2, sort_keys=True, ensure_ascii=False) + "\n", encoding="utf-8"
    )


def load_engines(path: Path = ENGINES_PATH) -> dict[str, str]:
    data = json.loads(path.read_text(encoding="utf-8"))
    return {str(k): str(v) for k, v in data["engines"].items()}


def _count(n: int, noun: str) -> str:
    return f"{n} {noun}{'s' if n != 1 else ''}"


def engine_facts(
    season: int,
    round: int,
    current: Sequence[QualifyingEntry],
    results_by_round: Mapping[int, RaceResult],
    engines: Mapping[str, str],
) -> tuple[list[str], dict[str, str]]:
    """(race-level lines, driver_id -> sentence) about power units, from earlier rounds only."""
    for key, result in results_by_round.items():
        if key >= round or result.round != key or result.season != season:
            raise LeakError(
                f"result keyed {key} is {result.season} round {result.round}, "
                f"not an earlier round of {season} before round {round}"
            )

    cars: Counter[str] = Counter()
    drivers: dict[str, str] = {}
    for entry in current:
        maker = engines.get(entry.constructor.constructor_id)
        if maker is None:
            continue
        cars[maker] += 1
        drivers[entry.driver.driver_id] = (
            f"{entry.driver.family_name}'s {entry.constructor.name} uses a {maker} power unit."
        )
    if not cars:
        return [], drivers

    wins: Counter[str] = Counter()
    podiums: Counter[str] = Counter()
    for result in results_by_round.values():
        for e in result.entries:
            maker = engines.get(e.constructor.constructor_id)
            if maker is None or not e.classified:
                continue
            wins[maker] += e.position == 1
            podiums[maker] += e.position <= 3

    order = sorted(cars, key=lambda m: (-wins[m], -podiums[m], -cars[m], m))
    if not results_by_round:
        line = (
            "Power units on the grid: "
            + "; ".join(f"{m} ({_count(cars[m], 'car')})" for m in order)
            + ". No race has been run yet this season."
        )
    else:
        line = (
            f"Power units this season, over {_count(len(results_by_round), 'race')}: "
            + "; ".join(
                f"{m} ({_count(cars[m], 'car')}) has {_count(wins[m], 'win')} and "
                f"{_count(podiums[m], 'podium')}"
                for m in order
            )
            + "."
        )
    return [line], drivers


def main() -> None:
    source = download_f1db(get_settings().data_dir / "f1db")
    engines, notes = _build(source, SEASON)
    write_engines(engines, notes=notes)
    print(f"wrote {ENGINES_PATH} from f1db {F1DB_VERSION}: {len(engines)} constructors")


if __name__ == "__main__":
    main()
