from datetime import UTC, datetime, timedelta

import httpx
import pytest
import respx

from race_calls.openf1.availability import available_at, is_available
from race_calls.openf1.client import (
    BASE_URL,
    LiveSessionLockout,
    OpenF1Client,
    OpenF1Error,
    SessionNotFound,
)
from race_calls.openf1.ratelimit import SlidingWindowLimiter, openf1_free_tier_limiter


class FakeClock:
    def __init__(self) -> None:
        self.now = 0.0
        self.sleeps: list[float] = []

    def __call__(self) -> float:
        return self.now

    def sleep(self, seconds: float) -> None:
        self.sleeps.append(seconds)
        self.now += seconds


def test_free_tier_limits_are_never_exceeded():
    clock = FakeClock()
    limiter = openf1_free_tier_limiter(clock=clock, sleep=clock.sleep)
    times = []
    for _ in range(95):
        limiter.acquire()
        times.append(clock.now)
    for i, t in enumerate(times):
        assert sum(1 for u in times[i:] if u - t < 1.0) <= 3
        assert sum(1 for u in times[i:] if u - t < 60.0) <= 30


def test_limiter_does_not_wait_when_under_limit():
    clock = FakeClock()
    limiter = SlidingWindowLimiter([(3, 1.0)], clock=clock, sleep=clock.sleep)
    for _ in range(3):
        limiter.acquire()
    assert clock.sleeps == []


def test_session_availability_window():
    end = datetime(2024, 3, 2, 17, 0, tzinfo=UTC)
    assert available_at(end) == end + timedelta(minutes=30)
    assert not is_available(end, end + timedelta(minutes=10))
    assert is_available(end, end + timedelta(minutes=30))
    with pytest.raises(ValueError):
        is_available(end.replace(tzinfo=None), end)


def _client(**kwargs) -> tuple[OpenF1Client, list[float]]:
    sleeps: list[float] = []
    limiter = SlidingWindowLimiter([(1000, 1.0)])
    return OpenF1Client(httpx.Client(), limiter=limiter, sleep=sleeps.append, **kwargs), sleeps


@respx.mock
def test_429_is_retried_with_backoff():
    route = respx.get(f"{BASE_URL}/race_control").mock(
        side_effect=[httpx.Response(429), httpx.Response(429), httpx.Response(200, json=[{"a": 1}])]
    )
    client, sleeps = _client(base_delay=1.0)
    assert client.race_control(9472) == [{"a": 1}]
    assert route.call_count == 3
    assert sleeps == [1.0, 2.0]


@respx.mock
def test_dropped_connections_are_retried():
    route = respx.get(f"{BASE_URL}/meetings").mock(
        side_effect=[
            httpx.ConnectError("Connection reset by peer"),
            httpx.ReadTimeout("timed out"),
            httpx.Response(200, json=[{"meeting_key": 1}]),
        ]
    )
    client, sleeps = _client(base_delay=1.0)
    assert client.get("meetings", {"year": 2024}) == [{"meeting_key": 1}]
    assert route.call_count == 3
    assert sleeps == [1.0, 2.0]


@respx.mock
def test_persistent_connection_failure_fails_clearly():
    respx.get(f"{BASE_URL}/meetings").mock(side_effect=httpx.ConnectError("reset"))
    client, _ = _client(max_retries=2)
    with pytest.raises(OpenF1Error, match="ConnectError"):
        client.get("meetings", {"year": 2024})


@respx.mock
def test_retry_budget_exhausted_fails_clearly():
    respx.get(f"{BASE_URL}/race_control").mock(return_value=httpx.Response(429))
    client, _ = _client(max_retries=2)
    with pytest.raises(OpenF1Error, match="still failing after 2 retries"):
        client.race_control(9472)


@respx.mock
def test_live_session_lockout_is_recognised():
    detail = (
        "Live F1 session in progress. Global API access (including past sessions) is "
        "restricted to authenticated users until the session ends."
    )
    respx.get(f"{BASE_URL}/sessions").mock(
        return_value=httpx.Response(401, json={"detail": detail})
    )
    client, sleeps = _client()
    with pytest.raises(LiveSessionLockout, match="Live F1 session in progress"):
        client.sessions(2023, "Race")
    assert sleeps == []  # a lockout lasts the whole session, so retrying immediately is pointless


@respx.mock
def test_other_401_is_a_plain_error():
    respx.get(f"{BASE_URL}/sessions").mock(
        return_value=httpx.Response(401, json={"detail": "bad key"})
    )
    client, _ = _client()
    with pytest.raises(OpenF1Error, match="bad key") as raised:
        client.sessions(2023, "Race")
    assert not isinstance(raised.value, LiveSessionLockout)


@respx.mock
def test_404_means_no_data():
    respx.get(f"{BASE_URL}/race_control").mock(return_value=httpx.Response(404))
    client, _ = _client()
    with pytest.raises(SessionNotFound):
        client.race_control(11377)
