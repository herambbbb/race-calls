import time
from collections import deque
from collections.abc import Callable, Sequence
from typing import Any


class SlidingWindowLimiter:
    """Blocks until a request fits inside every (max_requests, window_seconds) limit.

    OpenF1's free tier allows 3 requests per second and 30 per minute. A sliding
    window over the timestamps of recent requests enforces both exactly, so no
    one-second or one-minute window ever exceeds its limit.
    """

    def __init__(
        self,
        limits: Sequence[tuple[int, float]],
        clock: Callable[[], float] = time.monotonic,
        sleep: Callable[[float], None] = time.sleep,
    ) -> None:
        if not limits:
            raise ValueError("at least one limit is required")
        self._limits = sorted(limits, key=lambda limit: limit[1])
        self._clock = clock
        self._sleep = sleep
        self._history: deque[float] = deque()

    def acquire(self) -> None:
        while True:
            now = self._clock()
            longest_window = self._limits[-1][1]
            while self._history and now - self._history[0] >= longest_window:
                self._history.popleft()

            wait = 0.0
            for max_requests, window in self._limits:
                recent = [t for t in self._history if now - t < window]
                if len(recent) >= max_requests:
                    oldest_blocking = recent[len(recent) - max_requests]
                    wait = max(wait, window - (now - oldest_blocking))

            if wait <= 0:
                self._history.append(now)
                return
            self._sleep(wait)


def openf1_free_tier_limiter(**kwargs: Any) -> SlidingWindowLimiter:
    return SlidingWindowLimiter([(3, 1.0), (30, 60.0)], **kwargs)
