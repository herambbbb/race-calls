"""Jev, TypeSafe's System One decision model, reached over HTTP.

One HTTP request per race. The request body is TypeSafe's native System One format
({model, state, questions}); the Vercel AI Gateway accepts exactly the same body, so the
two transports differ only in URL, model id, and key. Results always record who served
them, because the gateway cannot pin a model version.

Busy upstream: the gateway serves Jev from more than one provider and, on a 429 from the
one it picked, does not try the others. So gateway requests name the provider order
explicitly (TypeSafe first), and retries follow a RetryPolicy: QUICK for interactive use
and tests, PATIENT for long runs, waiting minutes rather than seconds for a busy spell to
pass. Failed attempts are not billed, and every success is cached, so waiting is free.
"""

import hashlib
import json
import time
from collections.abc import Callable
from dataclasses import dataclass, field
from datetime import UTC, datetime
from typing import Any

import httpx

from race_calls.http import make_client
from race_calls.settings import JevTransport, Settings, get_settings

GATEWAY_URL = "https://ai-gateway.vercel.sh/typesafe/v1/systemone"
GATEWAY_MODEL = "typesafe-ai/jev"
TYPESAFE_URL = "https://api.typesafe.ai/v1/systemone"
# OpenRouter's native decisions endpoint takes the same body and reports a dated model
# version (for example "typesafe/jev-1.13-20260917"), so results are pinned to a version.
OPENROUTER_URL = "https://openrouter.ai/api/alpha/decisions"
OPENROUTER_MODEL = "typesafe/jev-1.13"
TYPESAFE_MODEL = "jev-1.13.0"
# 520 to 524 are Cloudflare's transient origin errors; OpenRouter returned a 520 once
# during a backtest (2026-09-28), and it cleared on the next request.
RETRYABLE_STATUS = frozenset({429, 500, 502, 503, 504, 520, 521, 522, 523, 524, 529})
GATEWAY_PROVIDER_ORDER = ("typesafe-ai", "digitalocean")


@dataclass(frozen=True)
class RetryPolicy:
    """Seconds to wait before each retry; the number of attempts is len(delays) + 1.

    A server's Retry-After, when longer than the planned wait, is honoured instead,
    up to MAX_SERVER_WAIT.
    """

    delays: tuple[float, ...]

    @property
    def attempts(self) -> int:
        return len(self.delays) + 1

    @classmethod
    def exponential(cls, attempts: int, base: float) -> "RetryPolicy":
        return cls(tuple(base * 2**i for i in range(max(0, attempts - 1))))


QUICK = RetryPolicy.exponential(7, 1.0)  # about 1 minute in total
PATIENT = RetryPolicy((30, 60, 120, 240, 480, 600, 600, 600))  # about 45 minutes in total

# Called before each wait with (attempt just failed, attempts in total, problem, seconds).
RetryHook = Callable[[int, int, str, float], None]


MAX_SERVER_WAIT = 600.0  # a server's Retry-After is honoured up to 10 minutes


def _retry_after(response: httpx.Response) -> float | None:
    try:
        return min(MAX_SERVER_WAIT, max(0.0, float(response.headers.get("retry-after", ""))))
    except ValueError:
        return None


class JevError(RuntimeError):
    """A Jev request that could not be completed. Never carries the API key."""


@dataclass(frozen=True)
class JevResponse:
    body: dict[str, Any]
    latency_ms: int
    requested_at: datetime
    model_id: str | None
    provider: str | None
    generation_id: str | None
    cost_usd: float | None
    input_tokens: int | None
    output_tokens: int | None
    request_body: dict[str, Any] = field(repr=False)


def request_hash(body: dict[str, Any]) -> str:
    canonical = json.dumps(body, sort_keys=True, separators=(",", ":"), ensure_ascii=False)
    return hashlib.sha256(canonical.encode()).hexdigest()


def _float(value: Any) -> float | None:
    try:
        return float(value)
    except (TypeError, ValueError):
        return None


def _int(value: Any) -> int | None:
    return value if isinstance(value, int) and not isinstance(value, bool) else None


def _dict(value: Any) -> dict[str, Any]:
    return value if isinstance(value, dict) else {}


class JevClient:
    def __init__(
        self,
        settings: Settings | None = None,
        http: httpx.Client | None = None,
        max_attempts: int = 7,
        base_delay: float = 1.0,
        sleep: Callable[[float], None] = time.sleep,
        typesafe_model: str = TYPESAFE_MODEL,
        retry: RetryPolicy | None = None,
        on_retry: RetryHook | None = None,
        provider_order: tuple[str, ...] = GATEWAY_PROVIDER_ORDER,
    ) -> None:
        self._settings = settings or get_settings()
        self._http = http or make_client(timeout=60)
        self._retry = retry or RetryPolicy.exponential(max_attempts, base_delay)
        self._on_retry = on_retry
        self._sleep = sleep
        self._provider_order = provider_order
        if self._settings.jev_transport is JevTransport.GATEWAY:
            self.url, self.model = GATEWAY_URL, GATEWAY_MODEL
        elif self._settings.jev_transport is JevTransport.OPENROUTER:
            self.url, self.model = OPENROUTER_URL, OPENROUTER_MODEL
        else:
            self.url, self.model = TYPESAFE_URL, typesafe_model

    def build_body(self, state: str, questions: dict[str, dict[str, Any]]) -> dict[str, Any]:
        body: dict[str, Any] = {"model": self.model, "state": state, "questions": questions}
        if self.url == GATEWAY_URL and self._provider_order:
            body["providerOptions"] = {"gateway": {"order": list(self._provider_order)}}
        return body

    def send(self, body: dict[str, Any]) -> JevResponse:
        key = self._settings.jev_api_key()
        if key is None or not key.get_secret_value():
            raise JevError(
                f"no API key configured for the {self._settings.jev_transport} transport"
            )
        headers = {"Authorization": f"Bearer {key.get_secret_value()}"}
        requested_at = datetime.now(UTC)
        last_problem = "no attempt made"
        attempts = self._retry.attempts
        for attempt in range(attempts):
            started = time.monotonic()
            server_wait = None
            try:
                response = self._http.post(self.url, json=body, headers=headers)
            except httpx.HTTPError as error:
                last_problem = type(error).__name__
            else:
                if response.status_code == 200:
                    return self._parse(response, body, requested_at, started)
                last_problem = f"HTTP {response.status_code}"
                if response.status_code not in RETRYABLE_STATUS:
                    detail = response.text[:300].replace(key.get_secret_value(), "[redacted]")
                    raise JevError(f"Jev request rejected: {last_problem}: {detail}")
                server_wait = _retry_after(response)
            if attempt < attempts - 1:
                wait = max(self._retry.delays[attempt], server_wait or 0.0)
                if self._on_retry:
                    self._on_retry(attempt + 1, attempts, last_problem, wait)
                self._sleep(wait)
        raise JevError(f"Jev request failed after {attempts} attempts ({last_problem})")

    def _parse(
        self,
        response: httpx.Response,
        body: dict[str, Any],
        requested_at: datetime,
        started: float,
    ) -> JevResponse:
        try:
            data = response.json()
        except ValueError as error:
            raise JevError("Jev response was not JSON") from error
        if not isinstance(data, dict) or not isinstance(data.get("answers"), dict):
            raise JevError("Jev response has no answers object")
        gateway = _dict(_dict(data.get("provider_metadata")).get("gateway"))
        routing = _dict(gateway.get("routing"))
        usage = _dict(data.get("usage"))
        return JevResponse(
            body=data,
            latency_ms=round((time.monotonic() - started) * 1000),
            requested_at=requested_at,
            model_id=data.get("model"),
            provider=routing.get("finalProvider")
            or (data.get("provider") if isinstance(data.get("provider"), str) else None)
            or ("typesafe-ai" if self.url == TYPESAFE_URL else None),
            generation_id=gateway.get("generationId")
            or (data.get("id") if isinstance(data.get("id"), str) else None),
            cost_usd=_float(gateway.get("cost")) or _float(usage.get("cost")),
            input_tokens=_int(usage.get("input_tokens")),
            output_tokens=_int(usage.get("output_tokens")),
            request_body=body,
        )
