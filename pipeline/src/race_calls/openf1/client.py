import time
from collections.abc import Callable
from typing import Any

import httpx

from race_calls.openf1.ratelimit import SlidingWindowLimiter, openf1_free_tier_limiter

BASE_URL = "https://api.openf1.org/v1"
RETRYABLE_STATUS = {429, 500, 502, 503, 504}


class OpenF1Error(RuntimeError):
    pass


class SessionNotFound(OpenF1Error):
    """OpenF1 returns 404 for sessions with no data, such as scheduled future sessions."""


class LiveSessionLockout(OpenF1Error):
    """While any F1 session is live, OpenF1 refuses all unauthenticated requests, even for
    past sessions, with a 401. Nothing can be fetched until the live session ends."""


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
    ) -> None:
        self._http = http
        self._limiter = limiter or openf1_free_tier_limiter()
        self._max_retries = max_retries
        self._base_delay = base_delay
        self._sleep = sleep
        self._base_url = base_url.rstrip("/")

    def get(self, endpoint: str, params: dict[str, Any]) -> list[dict[str, Any]]:
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
        return self.get("sessions", {"year": year, "session_name": session_name})

    def race_control(self, session_key: int) -> list[dict[str, Any]]:
        return self.get("race_control", {"session_key": session_key})

    def drivers(self, session_key: int) -> list[dict[str, Any]]:
        return self.get("drivers", {"session_key": session_key})
