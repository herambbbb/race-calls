from datetime import datetime, timedelta

HISTORICAL_DELAY = timedelta(minutes=30)


def available_at(session_end: datetime) -> datetime:
    """When a session's data leaves OpenF1's live window and becomes free historical data."""
    return session_end + HISTORICAL_DELAY


def is_available(session_end: datetime, now: datetime) -> bool:
    if session_end.tzinfo is None or now.tzinfo is None:
        raise ValueError("session_end and now must be timezone-aware")
    return now >= available_at(session_end)
