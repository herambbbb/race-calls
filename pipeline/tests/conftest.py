"""Every test runs offline and away from the real data.

- Real network connections are refused (respx mocks still work: they never open a
  socket), so a test can never reach Jolpica, OpenF1, f1db, or Jev.
- Settings point at temporary data, predictions, and scores directories with no API keys,
  so a test can never overwrite a committed prediction or spend on a real key.
"""

import socket

import pytest

from race_calls.settings import get_settings


class NetworkBlocked(RuntimeError):
    pass


def _refuse(*args, **kwargs):
    raise NetworkBlocked("tests must not use the network; mock it with respx")


@pytest.fixture(autouse=True)
def offline_and_isolated(monkeypatch, tmp_path):
    monkeypatch.setattr(socket.socket, "connect", _refuse)
    monkeypatch.setattr(socket.socket, "connect_ex", _refuse)
    monkeypatch.setattr(socket, "create_connection", _refuse)
    monkeypatch.setenv("AI_GATEWAY_API_KEY", "")
    monkeypatch.setenv("TYPESAFE_API_KEY", "")
    monkeypatch.setenv("OPENROUTER_API_KEY", "")
    monkeypatch.setenv("DATA_DIR", str(tmp_path / "data"))
    monkeypatch.setenv("PREDICTIONS_DIR", str(tmp_path / "predictions"))
    monkeypatch.setenv("SCORES_DIR", str(tmp_path / "scores"))
    get_settings.cache_clear()
    yield
    get_settings.cache_clear()
