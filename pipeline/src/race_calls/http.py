import ssl
from typing import Any

import httpx
import truststore

USER_AGENT = "race-calls/0.1 (non-commercial fan project; github.com/herambbbb/race-calls)"


def make_client(timeout: float = 30.0, **kwargs: Any) -> httpx.Client:
    """An httpx client that trusts the operating system's certificate store.

    Using the OS store instead of certifi makes TLS work behind corporate proxies
    that install their own root certificate, and changes nothing elsewhere.
    """
    return httpx.Client(
        verify=truststore.SSLContext(ssl.PROTOCOL_TLS_CLIENT),
        timeout=timeout,
        headers={"User-Agent": USER_AGENT},
        **kwargs,
    )
