import json

import httpx
import pytest
import respx

from race_calls.jev import (
    MAX_SERVER_WAIT,
    OPENROUTER_MODEL,
    OPENROUTER_URL,
    PATIENT,
    TYPESAFE_MODEL,
    TYPESAFE_URL,
    JevClient,
    JevError,
    RetryPolicy,
    request_hash,
)
from race_calls.settings import Settings

SECRET = "test-secret-key-do-not-leak"
QUESTIONS = {"podium_VER": {"type": "noul", "instructions": "Will VER finish in the top three?"}}
ANSWERS = {"podium_VER": {"type": "noul", "noul": 0.44}}


def settings(transport: str = "openrouter") -> Settings:
    return Settings(
        _env_file=None,
        ai_gateway_api_key=SECRET,
        typesafe_api_key=SECRET,
        openrouter_api_key=SECRET,
        jev_transport=transport,
    )


def client(transport: str = "openrouter", **kwargs) -> tuple[JevClient, list[float]]:
    sleeps: list[float] = []
    return (
        JevClient(settings(transport), http=httpx.Client(), sleep=sleeps.append, **kwargs),
        sleeps,
    )


def openrouter_ok(answers: dict | None = None) -> httpx.Response:
    # Shape of a real OpenRouter decisions response (2026-09-26), answers replaced.
    return httpx.Response(
        200,
        json={
            "model": "typesafe/jev-1.13-20260917",
            "usage": {"input_tokens": 787, "output_tokens": 164, "cost": 3.3054e-05},
            "id": "gen-dec-1790446238-test",
            "provider": "TypeSafe",
            "answers": answers or ANSWERS,
        },
    )


def body(c: JevClient, state: str = "Grid facts.") -> dict:
    return c.build_body(state, QUESTIONS)


@respx.mock
def test_openrouter_is_native_decisions_and_records_everything():
    route = respx.post(OPENROUTER_URL).mock(return_value=openrouter_ok())
    c, _ = client()
    response = c.send(body(c))
    sent = json.loads(route.calls[0].request.content)
    assert set(sent) == {"model", "state", "questions"}
    assert sent["model"] == OPENROUTER_MODEL
    assert route.calls[0].request.headers["authorization"] == f"Bearer {SECRET}"
    assert response.model_id == "typesafe/jev-1.13-20260917"
    assert response.provider == "TypeSafe"
    assert response.generation_id == "gen-dec-1790446238-test"
    assert response.cost_usd == pytest.approx(3.3054e-05)
    assert (response.input_tokens, response.output_tokens) == (787, 164)
    assert response.body["answers"] == ANSWERS


@respx.mock
def test_typesafe_transport_uses_its_url_and_pinned_model():
    route = respx.post(TYPESAFE_URL).mock(return_value=openrouter_ok())
    c, _ = client("typesafe")
    c.send(body(c))
    sent = json.loads(route.calls[0].request.content)
    assert sent["model"] == TYPESAFE_MODEL and "providerOptions" not in sent


@respx.mock
def test_429_and_dropped_connection_are_retried():
    route = respx.post(OPENROUTER_URL).mock(
        side_effect=[httpx.Response(429), httpx.ConnectError("reset"), openrouter_ok()]
    )
    c, sleeps = client()
    c.send(body(c))
    assert route.call_count == 3
    assert sleeps == [1.0, 2.0]


@respx.mock
def test_patient_policy_waits_minutes_and_reports_each_wait():
    respx.post(OPENROUTER_URL).mock(
        side_effect=[httpx.Response(429), httpx.Response(503), openrouter_ok()]
    )
    waits: list[tuple[int, int, str, float]] = []
    c, sleeps = client(retry=PATIENT, on_retry=lambda *a: waits.append(a))
    c.send(body(c))
    assert PATIENT.delays[:6] == (30, 60, 120, 240, 480, 600)
    assert sleeps == [30, 60]
    assert waits == [(1, 9, "HTTP 429", 30), (2, 9, "HTTP 503", 60)]


@respx.mock
def test_a_longer_retry_after_is_honoured_and_capped():
    respx.post(OPENROUTER_URL).mock(
        side_effect=[
            httpx.Response(429, headers={"retry-after": "90"}),
            httpx.Response(429, headers={"retry-after": "999999"}),
            openrouter_ok(),
        ]
    )
    c, sleeps = client(retry=RetryPolicy((5, 5)))
    c.send(body(c))
    assert sleeps == [90, MAX_SERVER_WAIT]


@respx.mock
def test_exhausted_retries_raise_a_clear_error():
    respx.post(OPENROUTER_URL).mock(return_value=httpx.Response(429))
    c, sleeps = client(max_attempts=3)
    with pytest.raises(JevError, match="3 attempts"):
        c.send(body(c))
    assert len(sleeps) == 2


@respx.mock
def test_rejected_request_is_not_retried_and_the_key_is_redacted():
    route = respx.post(OPENROUTER_URL).mock(
        return_value=httpx.Response(401, text=f"bad key {SECRET}")
    )
    c, sleeps = client()
    with pytest.raises(JevError) as error:
        c.send(body(c))
    assert route.call_count == 1 and sleeps == []
    assert SECRET not in str(error.value) and "[redacted]" in str(error.value)


def test_missing_key_fails_without_a_request():
    c = JevClient(Settings(_env_file=None), http=httpx.Client(), sleep=lambda _: None)
    with respx.mock(assert_all_called=False) as mock:
        route = mock.post(OPENROUTER_URL)
        with pytest.raises(JevError, match="no API key"):
            c.send(body(c))
    assert route.call_count == 0


@respx.mock
def test_key_never_appears_in_a_response():
    respx.post(OPENROUTER_URL).mock(return_value=openrouter_ok())
    c, _ = client()
    response = c.send(body(c))
    assert SECRET not in repr(response)
    assert SECRET not in json.dumps(response.body) + json.dumps(response.request_body)


@respx.mock
def test_malformed_json_and_missing_answers_raise():
    respx.post(OPENROUTER_URL).mock(
        side_effect=[
            httpx.Response(200, content=b"not json"),
            httpx.Response(200, json={"model": "x"}),
        ]
    )
    c, _ = client()
    with pytest.raises(JevError, match="not JSON"):
        c.send(body(c))
    with pytest.raises(JevError, match="no answers"):
        c.send(body(c))


@respx.mock
def test_malformed_metadata_is_tolerated():
    weird = {"answers": ANSWERS, "provider_metadata": "oops", "usage": ["bad"], "id": 7}
    respx.post(OPENROUTER_URL).mock(return_value=httpx.Response(200, json=weird))
    c, _ = client()
    response = c.send(body(c))
    assert response.cost_usd is None and response.input_tokens is None
    assert response.generation_id is None


def test_request_hash_is_stable_and_content_sensitive():
    c, _ = client()
    assert request_hash(body(c)) == request_hash(body(c))
    assert request_hash(body(c)) != request_hash(body(c, "Different facts."))


@respx.mock
def test_cloudflare_520_is_transient_and_retried():
    route = respx.post(OPENROUTER_URL).mock(
        side_effect=[
            httpx.Response(520, json={"error": {"message": "HTTP 520", "code": 520}}),
            openrouter_ok(),
        ]
    )
    c, sleeps = client()
    c.send(body(c))
    assert route.call_count == 2 and sleeps == [1.0]
