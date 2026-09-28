from race_calls.settings import JevTransport, Settings


def test_typesafe_is_the_default_transport(monkeypatch):
    monkeypatch.delenv("JEV_TRANSPORT", raising=False)
    settings = Settings(_env_file=None)
    assert settings.jev_transport is JevTransport.TYPESAFE


def test_key_follows_the_chosen_transport():
    settings = Settings(
        _env_file=None,
        ai_gateway_api_key="gateway-key",
        typesafe_api_key="typesafe-key",
        jev_transport="typesafe",
    )
    key = settings.jev_api_key()
    assert key is not None
    assert key.get_secret_value() == "typesafe-key"


def test_keys_are_never_rendered_in_repr():
    settings = Settings(_env_file=None, ai_gateway_api_key="super-secret-value")
    assert "super-secret-value" not in repr(settings)


def test_tests_cannot_reach_the_network_or_real_data():
    import httpx
    import pytest

    from race_calls.settings import PROJECT_ROOT, get_settings

    with pytest.raises(Exception, match="must not use the network"):
        httpx.get("https://ai-gateway.vercel.sh/")
    settings = get_settings()
    key = settings.jev_api_key()
    has_real_key = bool(key and key.get_secret_value())  # never display the value itself
    assert has_real_key is False
    assert settings.data_dir != PROJECT_ROOT / "data"
