"""An aero proxy from qualifying: speed-trap and sector rankings (Decision 2b).

No public aero data exists, so the snapshot uses what OpenF1 publishes for every lap: the
speed-trap reading (drag and power) and the three sector times (cornering), and it says
plainly that this is a proxy.

Only qualifying data goes in, which is pre-race by definition. qualifying_laps takes the
session_key of the qualifying session, which the caller finds with
find_session(client, year, "Qualifying", qualifying_start); never pass race, sprint, or
practice laps to pace_facts. pace_facts refuses laps from more than one session, so race
laps cannot be mixed in by accident.

Lap rules (checked against 2026 Azerbaijan qualifying, OpenF1 session 11373):

- Pit out laps are skipped: their sector one starts in the pit lane and their trap speed
  is often taken while still building up speed.
- Each value is read on its own: a lap with a null sector one (common on an out lap) can
  still give its sector two, three, and speed trap.
- A value counts only if it is a real number (not null, not a bool, not NaN) inside a
  plausible range: speed trap 50 to 400 km/h, each sector 5 to 300 seconds. Anything
  else is a timing glitch and is skipped. Slow cool-down and aborted laps need no rule:
  only each driver's best value counts.
- Laps OpenF1 has no flag for, such as ones deleted for track limits, still count; the
  car still did those speeds.

Ranking: best speed trap (highest) and best time in each sector (lowest) per driver,
ranked among the drivers who have that value. Equal values share a rank ("joint 2nd")
and the next rank skips (1, 2, 2, 4). The race-level top speed-trap readings list the
top three plus anyone tied with the third, so no one is dropped by car number. OpenF1
driver numbers are matched to this weekend's qualifying entries by car number; laps from
any other number are ignored.
A driver with no valid value at all gets no sentence.
"""

import math
from collections.abc import Callable, Mapping, Sequence
from typing import Any

from race_calls.models import QualifyingEntry
from race_calls.openf1.client import OpenF1Client
from race_calls.snapshot import LeakError, ordinal

SPEED_TRAP_KMH = (50.0, 400.0)
SECTOR_SECONDS = (5.0, 300.0)
SECTOR_FIELDS = ("duration_sector_1", "duration_sector_2", "duration_sector_3")
SECTOR_NAMES = ("one", "two", "three")
TOP_SPEEDS = 3
PROXY_LINE = (
    "Speed-trap and sector rankings from qualifying are a rough proxy for straight-line "
    "speed and cornering; they are not aero measurements."
)


def qualifying_laps(client: OpenF1Client, session_key: int) -> list[dict[str, Any]]:
    """OpenF1 laps of one qualifying session; find the key with find_session(client, year,
    "Qualifying", qualifying_start). LiveSessionLockout propagates: the caller reports the
    proxy as unavailable while a session is live."""
    return client.get("laps", {"session_key": session_key})


def _value(lap: Mapping[str, Any], field: str, low: float, high: float) -> float | None:
    raw = lap.get(field)
    if isinstance(raw, bool) or not isinstance(raw, int | float):
        return None
    value = float(raw)
    if math.isnan(value) or not low <= value <= high:
        return None
    return value


def _best(
    laps: Sequence[Mapping[str, Any]],
    field: str,
    bounds: tuple[float, float],
    pick: Callable[[list[float]], float],
) -> dict[int, float]:
    by_driver: dict[int, list[float]] = {}
    for lap in laps:
        value = _value(lap, field, *bounds)
        if value is not None:
            by_driver.setdefault(int(lap["driver_number"]), []).append(value)
    return {number: pick(values) for number, values in by_driver.items()}


def _ranks(best: Mapping[int, float], higher_is_better: bool) -> dict[int, tuple[int, bool]]:
    """Competition ranks (1, 2, 2, 4) and whether each is shared."""
    values = list(best.values())
    ranks = {}
    for number, value in best.items():
        better = sum(v > value if higher_is_better else v < value for v in values)
        ranks[number] = (better + 1, values.count(value) > 1)
    return ranks


def _place(rank: tuple[int, bool]) -> str:
    position, shared = rank
    return f"joint {ordinal(position)}" if shared else ordinal(position)


def _fastest(rank: tuple[int, bool]) -> str:
    position, shared = rank
    if position == 1:
        return "joint fastest" if shared else "the fastest"
    return f"{_place(rank)} fastest"


def _join(items: Sequence[str]) -> str:
    return items[0] if len(items) == 1 else f"{', '.join(items[:-1])} and {items[-1]}"


def _usable(laps: Sequence[Mapping[str, Any]], numbers: set[int]) -> list[Mapping[str, Any]]:
    sessions = {lap.get("session_key") for lap in laps}
    if len(sessions) > 1:
        raise LeakError(f"laps from more than one session: {sorted(map(str, sessions))}")
    return [
        lap
        for lap in laps
        if not lap.get("is_pit_out_lap")
        and isinstance(lap.get("driver_number"), int)
        and lap["driver_number"] in numbers
    ]


def pace_facts(
    laps: Sequence[Mapping[str, Any]], current: Sequence[QualifyingEntry]
) -> tuple[list[str], dict[str, str]]:
    """Race-level lines and one sentence per driver (keyed by driver_id), from the laps
    of this weekend's qualifying session only, by the rules in the module docstring.
    With no usable laps there are no lines and no sentences."""
    drivers = {e.driver.number: e.driver for e in current if e.driver.number is not None}
    usable = _usable(laps, set(drivers))
    speeds = _best(usable, "st_speed", SPEED_TRAP_KMH, max)
    sectors = [_best(usable, field, SECTOR_SECONDS, min) for field in SECTOR_FIELDS]
    speed_ranks = _ranks(speeds, higher_is_better=True)
    sector_ranks = [_ranks(best, higher_is_better=False) for best in sectors]

    facts: dict[str, str] = {}
    for number in sorted(drivers):
        clauses = []
        if number in speed_ranks:
            clauses.append(
                f"was {_fastest(speed_ranks[number])} through the speed trap "
                f"({speeds[number]:.0f} km/h)"
            )
        placed = [
            (_place(ranks[number]), name)
            for ranks, name in zip(sector_ranks, SECTOR_NAMES, strict=True)
            if number in ranks
        ]
        if placed:
            noun = "sector" if len(placed) == 1 else "sectors"
            clauses.append(
                f"ranked {_join([p for p, _ in placed])} in {noun} {_join([n for _, n in placed])}"
            )
        if clauses:
            driver = drivers[number]
            facts[driver.driver_id] = (
                f"In qualifying, {driver.family_name} {' and '.join(clauses)}."
            )

    if not facts:
        return [], {}
    lines = [PROXY_LINE]
    if speeds:
        # Everyone tied with the third reading is listed, so no one is dropped by car number.
        ordered = sorted(speeds, key=lambda n: (-speeds[n], n))
        cutoff = speeds[ordered[min(TOP_SPEEDS, len(ordered)) - 1]]
        top = [n for n in ordered if speeds[n] >= cutoff]
        lines.append(
            "Fastest through the qualifying speed trap: "
            + ", ".join(f"{drivers[n].family_name} {speeds[n]:.0f} km/h" for n in top)
            + "."
        )
    return lines, facts
