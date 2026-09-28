"""Session lookup, weather, and race-control summaries from OpenF1.

Every function here lets LiveSessionLockout propagate: while any F1 session is live,
OpenF1 refuses all free requests (even for past sessions), and callers should turn that
into "unavailable, a session is live" rather than a missing or zero answer.

Race-control counting rules (checked against 2024 Bahrain, Australia, Monaco, and Brazil):

- Messages are read in date order.
- Safety cars: category "SafetyCar" with "SAFETY CAR DEPLOYED" in the message, and
  "VIRTUAL SAFETY CAR DEPLOYED" for a VSC. Only the transition counts: a repeated
  DEPLOYED while that kind is already out is ignored. A period ends on "IN THIS LAP",
  "ENDING", a red flag, or "TRACK CLEAR". "SAFETY CAR THROUGH THE PIT LANE" and the
  like are neither a deployment nor an end.
- Red flags: category "Flag", flag "RED". A repeat while the session is still suspended
  is ignored; the suspension ends on a SessionStatus "SESSION STARTED" or "SESSION
  RESUMED", or a green flag.
- Lap 1 runs from the first "SESSION STARTED" (lights out; OpenF1 numbers laps from
  there) until the first message with lap_number >= 2; messages with a null lap_number
  in between belong to it. first_lap_yellow_or_vsc is true when lap 1 has a VSC, a safety
  car, a red flag, a track-wide yellow or double yellow, or a sector yellow or double
  yellow that stays out for at least 30 seconds (cleared by that sector's CLEAR, a
  track-wide CLEAR, or a red flag; still out at the end of the data counts as long).
  Momentary sector yellows for a spin are shown on nearly every opening lap, so they do
  not count. With no "SESSION STARTED" there is no lap 1 and the answer is false.
"""

from collections.abc import Sequence
from datetime import datetime, timedelta
from statistics import fmean
from typing import Any

from race_calls.models import RaceControlSummary, SessionWeather
from race_calls.openf1.client import OpenF1Client, SessionNotFound

LONG_YELLOW = timedelta(seconds=30)
_YELLOWS = {"YELLOW", "DOUBLE YELLOW"}


def _when(raw: str) -> datetime:
    return datetime.fromisoformat(raw)


def _is_status(message: dict[str, Any], status: str) -> bool:
    return message.get("category") == "SessionStatus" and (
        str(message.get("message") or "").upper() == status
    )


def find_session(
    client: OpenF1Client,
    year: int,
    session_name: str,
    starts_near: datetime,
    tolerance: timedelta = timedelta(hours=6),
) -> int | None:
    """The session_key of the named session ("Race", "Qualifying", "Sprint", ...) starting
    within tolerance of starts_near, the closest if several; None when there is none.
    Cancelled sessions are skipped."""
    if starts_near.tzinfo is None:
        raise ValueError("starts_near must be timezone-aware")
    try:
        sessions = client.sessions(year, session_name)
    except SessionNotFound:
        return None
    best: tuple[timedelta, int] | None = None
    for session in sessions:
        if session.get("session_name") != session_name or session.get("is_cancelled"):
            continue
        if not session.get("date_start") or session.get("session_key") is None:
            continue
        gap = abs(_when(session["date_start"]) - starts_near)
        if gap <= tolerance and (best is None or gap < best[0]):
            best = (gap, int(session["session_key"]))
    return best[1] if best else None


def _mean(samples: Sequence[dict[str, Any]], field: str) -> float | None:
    values = [float(s[field]) for s in samples if isinstance(s.get(field), int | float)]
    return round(fmean(values), 2) if values else None


def weather_summary(client: OpenF1Client, session_key: int) -> SessionWeather | None:
    """Rain (any sample) and mean air and track temperatures; None when OpenF1 has no data.
    OpenF1's samples for a session start somewhat before it, so pre-session rain counts."""
    try:
        samples = client.weather(session_key)
    except SessionNotFound:
        return None
    if not samples:
        return None
    return SessionWeather(
        session_key=session_key,
        samples=len(samples),
        rainfall=any(bool(s.get("rainfall")) for s in samples),
        air_temp_c=_mean(samples, "air_temperature"),
        track_temp_c=_mean(samples, "track_temperature"),
    )


def race_control_summary(client: OpenF1Client, session_key: int) -> RaceControlSummary:
    """Safety cars, VSCs, red flags, and whether lap 1 was interrupted, by the rules in the
    module docstring. A session with no race-control data summarises as all zeros."""
    try:
        messages = client.race_control(session_key)
    except SessionNotFound:
        messages = []
    return summarise_race_control(session_key, messages)


def summarise_race_control(
    session_key: int, messages: Sequence[dict[str, Any]]
) -> RaceControlSummary:
    ordered = sorted(messages, key=lambda m: _when(m["date"]))
    safety_cars = virtual_safety_cars = red_flags = 0
    sc_out = vsc_out = suspended = False
    for m in ordered:
        text = str(m.get("message") or "").upper()
        category = m.get("category")
        flag = m.get("flag")
        if category == "SafetyCar":
            if "VIRTUAL SAFETY CAR DEPLOYED" in text:
                virtual_safety_cars += not vsc_out
                vsc_out = True
            elif "SAFETY CAR DEPLOYED" in text:
                safety_cars += not sc_out
                sc_out = True
            elif "ENDING" in text or "IN THIS LAP" in text:
                sc_out = vsc_out = False
        elif category == "Flag" and flag == "RED":
            red_flags += not suspended
            suspended = True
            sc_out = vsc_out = False
        elif category == "Flag" and flag == "CLEAR" and m.get("scope") == "Track":
            sc_out = vsc_out = False
        elif (category == "Flag" and flag == "GREEN") or (
            _is_status(m, "SESSION STARTED") or _is_status(m, "SESSION RESUMED")
        ):
            suspended = False
    return RaceControlSummary(
        session_key=session_key,
        safety_cars=safety_cars,
        virtual_safety_cars=virtual_safety_cars,
        red_flags=red_flags,
        first_lap_yellow_or_vsc=_first_lap_interrupted(ordered),
        messages=len(messages),
    )


def _first_lap(ordered: Sequence[dict[str, Any]]) -> list[dict[str, Any]]:
    start = next((i for i, m in enumerate(ordered) if _is_status(m, "SESSION STARTED")), None)
    if start is None:
        return []
    lap = []
    for m in ordered[start:]:
        number = m.get("lap_number")
        if isinstance(number, int) and number >= 2:
            break
        lap.append(m)
    return lap


def _first_lap_interrupted(ordered: Sequence[dict[str, Any]]) -> bool:
    lap = _first_lap(ordered)
    if not lap:
        return False
    for m in lap:
        text = str(m.get("message") or "").upper()
        if m.get("category") == "SafetyCar" and "DEPLOYED" in text:
            return True
        if m.get("category") != "Flag":
            continue
        if m.get("flag") == "RED":
            return True
        if m.get("flag") in _YELLOWS:
            if m.get("scope") != "Sector":
                return True
            if _yellow_duration(ordered, m) >= LONG_YELLOW:
                return True
    return False


def _yellow_duration(ordered: Sequence[dict[str, Any]], shown: dict[str, Any]) -> timedelta:
    """How long a sector yellow stayed out: until that sector's CLEAR, a track-wide CLEAR,
    or a red flag; forever if nothing cleared it."""
    shown_at = _when(shown["date"])
    for m in ordered:
        if _when(m["date"]) <= shown_at:
            continue
        if m.get("category") != "Flag":
            continue
        if m.get("flag") == "RED":
            return _when(m["date"]) - shown_at
        if m.get("flag") == "CLEAR" and (
            m.get("scope") == "Track" or m.get("sector") == shown.get("sector")
        ):
            return _when(m["date"]) - shown_at
    return timedelta.max
