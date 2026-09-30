"""The actual chaos level of a race, by the rubric in race_calls.rubric (design Decision 3).

The level is the highest rubric row whose condition holds:

- 4 bedlam: a red flag, or wet running, or no podium finisher started in grid slots 1 to 6
  (grid 0 is a pit-lane start, not a top-six start).
- 3 chaotic: two or more full safety cars, or 5 or more retirements.
- 2 eventful: one full safety car, or a first-lap yellow or VSC (the race-control rules
  in race_calls.openf1.sessions, including LONG_YELLOW).
- 1 lively: a virtual safety car, or 3 to 4 retirements, or 3 or more lead changes.
- 0 calm otherwise. The rubric's "winner led most laps" is not checked: with no safety
  car, few retirements, and fewer than 3 lead changes it nearly always holds.

Retirements are entries that started and were not classified, checked against the 2024
Bahrain, Australia, Monaco, and Brazil classifications:

- "R" (retired) and "N" (not classified: ran, but too far short of the distance) count.
- "W" (withdrawn) and "F" (failed to qualify) never started, and neither did any entry
  whose status says "Did not ..." or "Withdrew". The grid slot is no guide: in 2024
  Brazil, Albon and Stroll are "W" with grid 7 and 10. No real row showed an "R" that
  had not started, so a lap-1 crash (laps 0, as four drivers had in 2024 Monaco) counts.
- "D" (disqualified) and "E" (excluded) do not count: they are stewards' decisions, and
  most (a light car, a worn plank) take away a finish the driver actually made.

Lead changes come from OpenF1 /position rows with position 1, which appear only when
the leader changes. Each change of driver after lights out counts, pit-stop cycles
included: the rubric says lead changes, not overtakes for the lead. A leader who holds
P1 for less than MIN_LEAD is a timing blip and is dropped (2024 Bahrain shows Norris
leading for about a second at the start, which never happened on track).
"""

from collections.abc import Mapping, Sequence
from datetime import datetime, timedelta
from itertools import pairwise
from typing import Any

import httpx

from race_calls.models import ChaosActual, ChaosInputs, RaceControlSummary, RaceResult, Weekend
from race_calls.openf1.client import (
    LiveSessionLockout,
    OpenF1Client,
    OpenF1Error,
    SessionNotFound,
)
from race_calls.openf1.sessions import find_session, summarise_race_control

MIN_LEAD = timedelta(seconds=10)
# With no session times at all, the race window is the scheduled start plus the maximum
# race duration (three hours, including any red flag).
RACE_WINDOW = timedelta(hours=3)
NOT_STARTED_CODES = {"W", "F"}
NOT_STARTED_STATUS = ("did not", "withdrew")
STEWARDS_CODES = {"D", "E"}
TOP_SIX = range(1, 7)
_WORDS = ("no", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine")


class ChaosUnavailable(RuntimeError):
    """The race could not be found on OpenF1, so there is no chaos level yet."""


def _when(raw: Any) -> datetime | None:
    try:
        return datetime.fromisoformat(str(raw))
    except ValueError:
        return None


def _count(n: int, one: str, many: str) -> str:
    """ "a red flag", "two full safety cars"; "a"/"an" follows the singular noun."""
    if n == 1:
        return f"{'an' if one[0] in 'aeiou' else 'a'} {one}"
    return f"{_WORDS[n] if n < len(_WORDS) else n} {many}"


def _plural(n: int, noun: str) -> str:
    return f"{n} {noun}" if n == 1 else f"{n} {noun}s"


# --- pure pieces --------------------------------------------------------------------


def lead_changes(
    leader_samples: Sequence[Mapping[str, Any]], race_start: datetime | None = None
) -> int:
    """How many times the driver in P1 changed after lights out.

    The leader at the start is the last row at or before race_start (the pole-sitter's
    grid row), or the first row when race_start is None; it is not a change. Later rows
    for the driver already leading are ignored, and so is a leader who held P1 for less
    than MIN_LEAD before the next row.
    """
    rows = sorted(
        (
            (when, row["driver_number"])
            for row in leader_samples
            if row.get("position", 1) == 1
            and row.get("driver_number") is not None
            and (when := _when(row.get("date"))) is not None
        ),
        key=lambda r: r[0],
    )
    if not rows:
        return 0
    if race_start is None:
        before, after = rows[:1], rows[1:]
    else:
        before = [r for r in rows if r[0] <= race_start]
        after = [r for r in rows if r[0] > race_start]
    held = [
        driver
        for i, (when, driver) in enumerate(after)
        if i + 1 == len(after) or after[i + 1][0] - when >= MIN_LEAD
    ]
    leaders = [before[-1][1], *held] if before else held
    return sum(1 for previous, current in pairwise(leaders) if current != previous)


def retirements(result: RaceResult) -> int:
    """Entries that started and were not classified, by the rules in the module docstring."""
    count = 0
    for entry in result.entries:
        code = entry.position_text.upper()
        if entry.classified or code in NOT_STARTED_CODES or code in STEWARDS_CODES:
            continue
        if entry.status.lower().startswith(NOT_STARTED_STATUS):
            continue
        count += 1
    return count


def podium_from_top_six(result: RaceResult) -> bool:
    """Whether at least one podium finisher started in grid slots 1 to 6."""
    podium = [e for e in result.entries if e.classified and e.position <= 3]
    if not podium:
        raise ValueError(f"{result.season} round {result.round} has no podium finishers")
    return any(e.grid in TOP_SIX for e in podium)


def race_wet(
    weather_rows: Sequence[Mapping[str, Any]], start: datetime, end: datetime | None
) -> bool:
    """Whether any weather sample from start to end (open-ended when None) reported rain.

    OpenF1's samples begin about 20 minutes before the session; rain then is not wet
    running, so those are left out.
    """
    for row in weather_rows:
        when = _when(row.get("date"))
        if when is None or when < start or (end is not None and when > end):
            continue
        if row.get("rainfall"):
            return True
    return False


def _retirements(n: int) -> str:
    return "no retirements" if n == 0 else _plural(n, "retirement")


def _triggers(inputs: ChaosInputs) -> list[list[str]]:
    """The conditions that hold on each rubric row, 0 to 4, in the rubric's order."""
    lively, eventful, chaotic, bedlam = [], [], [], []
    if inputs.virtual_safety_cars >= 1:
        lively.append(
            _count(inputs.virtual_safety_cars, "virtual safety car", "virtual safety cars")
        )
    if 3 <= inputs.retirements <= 4:
        lively.append(_retirements(inputs.retirements))
    if inputs.lead_changes is not None and inputs.lead_changes >= 3:
        lively.append(_plural(inputs.lead_changes, "lead change"))
    if inputs.safety_cars == 1:
        eventful.append("a full safety car")
    if inputs.first_lap_yellow_or_vsc:
        eventful.append("a first-lap yellow or virtual safety car")
    if inputs.safety_cars >= 2:
        chaotic.append(_count(inputs.safety_cars, "full safety car", "full safety cars"))
    if inputs.retirements >= 5:
        chaotic.append(_retirements(inputs.retirements))
    if inputs.red_flags >= 1:
        bedlam.append(_count(inputs.red_flags, "red flag", "red flags"))
    if inputs.wet:
        bedlam.append("wet running")
    if not inputs.podium_from_top_six:
        bedlam.append("a podium with none of the top six starters")
    return [[], lively, eventful, chaotic, bedlam]


def chaos_level(
    summary: RaceControlSummary, result: RaceResult, wet: bool, lead_changes: int | None
) -> ChaosActual:
    """The highest rubric row that holds, with the reason in plain words. With
    lead_changes None (no OpenF1 position data) the lead-change condition is not applied."""
    inputs = ChaosInputs(
        safety_cars=summary.safety_cars,
        virtual_safety_cars=summary.virtual_safety_cars,
        red_flags=summary.red_flags,
        first_lap_yellow_or_vsc=summary.first_lap_yellow_or_vsc,
        retirements=retirements(result),
        lead_changes=lead_changes,
        wet=wet,
        podium_from_top_six=podium_from_top_six(result),
    )
    triggers = _triggers(inputs)
    level = max(i for i, row in enumerate(triggers) if row or i == 0)
    if level:
        reason = " and ".join(triggers[level][:2])
    else:
        reason = f"a calm race: no safety car, {_retirements(inputs.retirements)}"
        if lead_changes is None:
            reason += " (lead changes unavailable)"
    return ChaosActual(actual=level, reason=reason, inputs=inputs)


# --- fetching -----------------------------------------------------------------------


def _session_times(
    client: OpenF1Client, season: int, session_key: int
) -> tuple[datetime | None, datetime | None]:
    try:
        sessions = client.sessions(season, "Race")
    except SessionNotFound:
        return None, None
    for session in sessions:
        if session.get("session_key") == session_key:
            return _when(session.get("date_start")), _when(session.get("date_end"))
    return None, None


def _status_time(messages: Sequence[Mapping[str, Any]], status: str, last: bool) -> datetime | None:
    times = sorted(
        when
        for m in messages
        if m.get("category") == "SessionStatus"
        and str(m.get("message") or "").upper() == status
        and (when := _when(m.get("date"))) is not None
    )
    if not times:
        return None
    return times[-1] if last else times[0]


def _leader_rows(client: OpenF1Client, session_key: int) -> list[dict[str, Any]] | None:
    try:
        rows = client.get("position", {"session_key": session_key, "position": 1})
    except LiveSessionLockout:
        raise
    except (OpenF1Error, httpx.HTTPError):
        return None
    return rows or None


def actual_chaos(client: OpenF1Client, weekend: Weekend, result: RaceResult) -> ChaosActual:
    """Fetch race control, weather, and the P1 rows for the weekend's race from OpenF1 and
    rate it. LiveSessionLockout propagates (the post-race job tries again later);
    ChaosUnavailable when OpenF1 has no such race.

    The race runs from lights out (the first "SESSION STARTED", else the session's start,
    else the calendar start) to the last "SESSION FINISHED", else the session's scheduled
    end, else RACE_WINDOW later. Rain counts only inside it: 2026 Miami's only rain fell
    after the chequered flag and before the scheduled end. Lead changes count from the
    same start, and lights_out is the first "SESSION STARTED" (None without one).
    """
    session_key = find_session(client, weekend.season, "Race", weekend.race_start)
    if session_key is None:
        raise ChaosUnavailable(
            f"{weekend.season} round {weekend.round}: OpenF1 has no race session "
            f"near {weekend.race_start.isoformat()}"
        )
    date_start, date_end = _session_times(client, weekend.season, session_key)
    try:
        messages = client.race_control(session_key)
    except SessionNotFound:
        messages = []
    summary = summarise_race_control(session_key, messages)

    lights_out = _status_time(messages, "SESSION STARTED", last=False)
    finished = _status_time(messages, "SESSION FINISHED", last=True)
    start = lights_out or date_start or weekend.race_start
    end = finished or date_end or start + RACE_WINDOW
    try:
        weather = client.weather(session_key)
    except SessionNotFound:
        weather = []
    wet = race_wet(weather, start, end)

    leader_rows = _leader_rows(client, session_key)
    changes = lead_changes(leader_rows, start) if leader_rows is not None else None
    actual = chaos_level(summary, result, wet, changes)
    return actual.model_copy(update={"lights_out": lights_out})
