import json
import time
from collections.abc import Callable
from datetime import timedelta
from typing import Any

import httpx

from race_calls.cache import JsonCache
from race_calls.openf1.ratelimit import SlidingWindowLimiter, openf1_free_tier_limiter

BASE_URL = "https://api.openf1.org/v1"
RETRYABLE_STATUS = {429, 500, 502, 503, 504}
CACHE_NAMESPACE = "openf1"
# A season's session list can still move (a rescheduled or cancelled round); a finished
# session's race control and weather cannot, once OpenF1 serves it at all.
SESSIONS_MAX_AGE = timedelta(hours=12)


class OpenF1Error(RuntimeError):
    pass


class SessionNotFound(OpenF1Error):
    """OpenF1 returns 404 for sessions with no data, such as scheduled future sessions."""


class LiveSessionLockout(OpenF1Error):
    """While any F1 session is live, OpenF1 refuses all unauthenticated requests, even for
    past sessions, with a 401. Nothing can be fetched until the live session ends.

    It is never retried and never cached; callers should report "unavailable, a session is
    live" and try again after the session."""


def _detail(response: httpx.Response) -> str:
    try:
        body = response.json()
    except ValueError:
        return response.text[:500]
    return str(body.get("detail", body)) if isinstance(body, dict) else str(body)


class OpenF1Client:
    def __init__(
        self,
        http: httpx.Client,
        limiter: SlidingWindowLimiter | None = None,
        max_retries: int = 5,
        base_delay: float = 2.0,
        sleep: Callable[[float], None] = time.sleep,
        base_url: str = BASE_URL,
        cache: JsonCache | None = None,
    ) -> None:
        self._http = http
        self._limiter = limiter or openf1_free_tier_limiter()
        self._max_retries = max_retries
        self._base_delay = base_delay
        self._sleep = sleep
        self._base_url = base_url.rstrip("/")
        self._cache = cache

    def get(
        self, endpoint: str, params: dict[str, Any], max_age: timedelta | None = None
    ) -> list[dict[str, Any]]:
        """GET an endpoint, from the cache when one is set and holds a fresh answer.

        Only non-empty lists are cached: an empty one may just mean the data is not
        published yet. Raises LiveSessionLockout while any session is live, SessionNotFound
        on a 404, and OpenF1Error for anything else that does not come right after retries.
        """
        if self._cache is None:
            return self._fetch(endpoint, params)
        key = f"{endpoint}?{json.dumps(params, sort_keys=True)}"
        cached = self._cache.get(CACHE_NAMESPACE, key, max_age=max_age)
        if isinstance(cached, list) and cached:
            return cached
        data = self._fetch(endpoint, params)
        if data:
            self._cache.put(CACHE_NAMESPACE, key, data)
        return data

    def _fetch(self, endpoint: str, params: dict[str, Any]) -> list[dict[str, Any]]:
        url = f"{self._base_url}/{endpoint}"
        last_problem = "no attempt made"
        for attempt in range(self._max_retries + 1):
            self._limiter.acquire()
            try:
                response = self._http.get(url, params=params)
            except httpx.TransportError as error:
                # Dropped connections and timeouts are transient; so is a proxy resetting one.
                last_problem = f"{type(error).__name__}: {error}"
                if attempt == self._max_retries:
                    break
                self._sleep(self._base_delay * 2**attempt)
                continue
            last_problem = f"status {response.status_code}"
            if response.status_code == 404:
                raise SessionNotFound(f"{endpoint} {params}: no data")
            if response.status_code == 401:
                detail = _detail(response)
                if "live" in detail.lower():
                    raise LiveSessionLockout(detail)
                raise OpenF1Error(f"{endpoint} {params}: 401 {detail}")
            if response.status_code in RETRYABLE_STATUS:
                if attempt == self._max_retries:
                    break
                self._sleep(self._base_delay * 2**attempt)
                continue
            response.raise_for_status()
            data = response.json()
            if not isinstance(data, list):
                raise OpenF1Error(
                    f"{endpoint} {params}: expected a list, got {type(data).__name__}"
                )
            return data
        raise OpenF1Error(
            f"{endpoint} {params}: still failing after {self._max_retries} retries "
            f"(last: {last_problem})"
        )

    def sessions(self, year: int, session_name: str) -> list[dict[str, Any]]:
        return self.get(
            "sessions", {"year": year, "session_name": session_name}, max_age=SESSIONS_MAX_AGE
        )

    def race_control(self, session_key: int) -> list[dict[str, Any]]:
        return self.get("race_control", {"session_key": session_key})

    def drivers(self, session_key: int) -> list[dict[str, Any]]:
        return self.get("drivers", {"session_key": session_key})

    def weather(self, session_key: int) -> list[dict[str, Any]]:
        return self.get("weather", {"session_key": session_key})
