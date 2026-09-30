"""The pre-race snapshot: facts known after qualifying, as plain sentences (Decision 2).

Code computes every number and writes it into a sentence; Jev never does arithmetic.
The builder takes only pre-race inputs and refuses anything from the race itself: it has
no parameter for the race's results, and it rejects results or standings from this round
or later.
"""

from collections.abc import Mapping, Sequence
from datetime import datetime

from race_calls.models import (
    DriverFact,
    GridSlotRate,
    Priors,
    QualifyingEntry,
    RaceResult,
    ResultEntry,
    SessionWeather,
    Snapshot,
    Standings,
    Weekend,
    lap_seconds,
)

RECENT_RACES = 3
NOT_CLASSIFIED = {
    "R": "retired",
    "D": "was disqualified",
    "W": "withdrew",
    "N": "was not classified",
    "E": "was excluded",
    "F": "failed to qualify",
}


class LeakError(ValueError):
    """An input would let information from the race itself into the snapshot."""


def ordinal(n: int) -> str:
    suffix = "th" if 10 <= n % 100 <= 20 else {1: "st", 2: "nd", 3: "rd"}.get(n % 10, "th")
    return f"{n}{suffix}"


def _points(points: float) -> str:
    return f"{points:g} point{'' if points == 1 else 's'}"


def percent(x: float) -> str:
    return f"{round(x * 100)}%"


def best_lap(entry: QualifyingEntry) -> float | None:
    times = [t for t in (lap_seconds(entry.q1), lap_seconds(entry.q2), lap_seconds(entry.q3)) if t]
    return min(times) if times else None


def _finish(entry: ResultEntry) -> str:
    if entry.classified:
        return f"finished {ordinal(entry.position)}"
    return NOT_CLASSIFIED.get(entry.position_text, f"did not finish ({entry.status})")


def _check_inputs(
    weekend: Weekend,
    standings: Standings | None,
    previous: Sequence[RaceResult],
    sprint: RaceResult | None,
    priors: Priors,
) -> None:
    if priors.seasons[1] >= weekend.season:
        raise LeakError(f"priors run to {priors.seasons[1]}, into the {weekend.season} season")
    history = priors.circuit(weekend.circuit_id)
    last_held = history.last_held if history is not None else None
    if last_held is not None and last_held >= weekend.season:
        raise LeakError(f"circuit history includes {last_held}")
    for result in previous:
        if result.season != weekend.season or result.round >= weekend.round:
            raise LeakError(
                f"result for {result.season} round {result.round} is not before "
                f"round {weekend.round}"
            )
    if standings is not None and (
        standings.season != weekend.season or standings.after_round >= weekend.round
    ):
        raise LeakError(f"standings after round {standings.after_round} include this race")
    if sprint is not None and (
        not weekend.is_sprint or sprint.season != weekend.season or sprint.round != weekend.round
    ):
        raise LeakError("a sprint result must be this weekend's sprint")


def _driver_line(
    entry: QualifyingEntry,
    grid: int,
    pole_lap: float | None,
    standings: Standings | None,
    recent: Sequence[tuple[str, RaceResult]],
    slot: GridSlotRate | None,
    seasons: tuple[int, int],
) -> str:
    d, name, surname = entry.driver, entry.driver.name, entry.driver.family_name
    parts = [f"{name} ({entry.constructor.name}) starts {ordinal(grid)}"]
    lap = best_lap(entry)
    if grid == 1 and lap is not None:
        parts[0] += ", on pole."
    elif lap is not None and pole_lap is not None:
        parts[0] += f"; {surname}'s best qualifying lap was {lap - pole_lap:.3f} seconds slower "
        parts[0] += "than the pole lap."
    else:
        parts[0] += f"; {surname} set no qualifying lap time."

    standing = (
        next((s for s in standings.drivers if s.driver.driver_id == d.driver_id), None)
        if (standings)
        else None
    )
    if standing is None or standing.points == 0:
        parts.append(f"{surname} has no championship points yet.")
    else:
        where = f"{ordinal(standing.position)} in" if standing.position else "in"
        wins = (
            f", with {standing.wins} win{'s' if standing.wins != 1 else ''}"
            if standing.wins
            else ""
        )
        parts.append(
            f"{surname} is {where} the championship with {_points(standing.points)}{wins}."
        )

    finishes = []
    for race_name, result in recent:
        mine = next((e for e in result.entries if e.driver.driver_id == d.driver_id), None)
        finishes.append(
            f"{_finish(mine)} in the {race_name}" if mine else f"did not race in the {race_name}"
        )
    if finishes:
        parts.append(f"Last {len(finishes)} races: " + "; ".join(finishes) + ".")

    if slot is not None and slot.starts:
        parts.append(
            f"From {ordinal(grid)} on the grid in {seasons[0]} to {seasons[1]}, drivers finished "
            f"in the top three {percent(slot.podium_rate)} of the time and won "
            f"{percent(slot.win_rate)} of the time ({slot.starts} starts)."
        )
    return " ".join(parts)


def build_snapshot(
    weekend: Weekend,
    calendar: Sequence[Weekend],
    qualifying: Sequence[QualifyingEntry],
    standings: Standings | None,
    previous: Sequence[RaceResult],
    priors: Priors,
    built_at: datetime,
    sprint: RaceResult | None = None,
    qualifying_weather: SessionWeather | None = None,
    driver_extras: Mapping[str, Sequence[str]] | None = None,
    race_extras: Sequence[str] = (),
) -> Snapshot:
    """`previous` may hold every earlier round; the lines use the last three.

    driver_extras (driver_id -> sentences) and race_extras come from the fact modules in
    race_calls.facts, which check their own inputs for leaks.
    """
    if not qualifying:
        raise ValueError("no qualifying results: nothing to predict from")
    _check_inputs(weekend, standings, previous, sprint, priors)

    names = {w.round: w.name for w in calendar if w.season == weekend.season}
    recent = [
        (names.get(r.round, f"round {r.round}"), r)
        for r in sorted(previous, key=lambda r: r.round, reverse=True)[:RECENT_RACES]
    ]
    order = sorted(qualifying, key=lambda e: e.position)
    pole_lap = best_lap(order[0])

    drivers = tuple(
        DriverFact(
            code=entry.driver.code,
            name=entry.driver.name,
            constructor=entry.constructor.name,
            grid=grid,
            line=" ".join(
                [
                    _driver_line(
                        entry, grid, pole_lap, standings, recent, priors.slot(grid), priors.seasons
                    ),
                    *(driver_extras or {}).get(entry.driver.driver_id, ()),
                ]
            ),
        )
        for grid, entry in enumerate(order, start=1)
    )

    return Snapshot(
        season=weekend.season,
        round=weekend.round,
        race_name=weekend.name,
        built_at=built_at,
        grid_provisional=True,
        drivers=drivers,
        race_lines=(
            *_race_lines(
                weekend, calendar, standings, priors, sprint, qualifying_weather, len(order)
            ),
            *race_extras,
        ),
    )


def _race_lines(
    weekend: Weekend,
    calendar: Sequence[Weekend],
    standings: Standings | None,
    priors: Priors,
    sprint: RaceResult | None,
    weather: SessionWeather | None,
    starters: int,
) -> list[str]:
    rounds = sum(1 for w in calendar if w.season == weekend.season)
    start = weekend.race_start
    lines = [
        f"Race: the {weekend.name}, round {weekend.round} of {rounds} in the {weekend.season} "
        f"season, at {weekend.circuit_name} ({weekend.locality}, {weekend.country}).",
        f"The race starts at {start:%H:%M} UTC on {start.day} {start:%B %Y}, with {starters} "
        "drivers on the grid.",
        "The grid is provisional: it is the qualifying order, and grid penalties announced "
        "after qualifying are not included.",
        f"The {weekend.season} season is the first under new technical rules, so the historical "
        f"rates below come from {priors.seasons[0]} to {priors.seasons[1]} and are only a rough "
        "guide.",
    ]

    history = priors.circuit(weekend.circuit_id)
    if history is None or history.races == 0:
        lines.append("This circuit has not held a championship race before.")
    else:
        held = f"{history.races} championship race{'s' if history.races != 1 else ''}"
        last = f", most recently in {history.last_held}" if history.last_held else ""
        lines.append(f"This circuit has held {held}{last}.")
        if history.safety_car_races is not None and history.safety_car_seasons:
            n = len(history.safety_car_seasons)
            lines.append(
                f"A full safety car came out in {history.safety_car_races} of the {n} races "
                f"held here from {min(history.safety_car_seasons)} to "
                f"{max(history.safety_car_seasons)}."
            )

    if weekend.is_sprint:
        if sprint is None or not sprint.entries:
            lines.append("This is a sprint weekend; the sprint result is not available.")
        else:
            sprint_top = sorted(
                (e for e in sprint.entries if e.classified), key=lambda e: e.position
            )[:8]
            lines.append(
                "This is a sprint weekend. Sprint result: "
                + "; ".join(f"{ordinal(e.position)} {e.driver.name}" for e in sprint_top)
                + "."
            )

    if weather is None or not weather.samples:
        lines.append("Weather during qualifying is not available.")
    else:
        temps = []
        if weather.air_temp_c is not None:
            temps.append(f"air {weather.air_temp_c:.0f} C")
        if weather.track_temp_c is not None:
            temps.append(f"track {weather.track_temp_c:.0f} C")
        wet = "Rain fell during qualifying" if weather.rainfall else "Qualifying was dry"
        lines.append(wet + (f" ({', '.join(temps)})." if temps else "."))

    if standings is not None and standings.constructors:
        top = sorted(
            (c for c in standings.constructors if c.position),
            key=lambda c: c.position or 0,
        )[:5]
        lines.append(
            f"Constructors' championship after round {standings.after_round}: "
            + "; ".join(
                f"{ordinal(c.position or 0)} {c.constructor.name} {_points(c.points)}" for c in top
            )
            + "."
        )
    return lines
