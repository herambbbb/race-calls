import hashlib
import io
import zipfile
from pathlib import Path

import httpx
import pytest
import respx

from race_calls import priors as p

FIXTURE = Path(__file__).parent / "fixtures" / "f1db"

# From one request to https://api.jolpi.ca/ergast/f1/2026/circuits/?format=json
JOLPICA_2026_CIRCUITS = [
    "albert_park", "americas", "baku", "catalunya", "hungaroring", "interlagos", "jeddah",
    "losail", "madring", "marina_bay", "miami", "monaco", "monza", "red_bull_ring",
    "rodriguez", "sepang", "shanghai", "silverstone", "spa", "suzuka", "vegas",
    "villeneuve", "yas_marina", "zandvoort",
]  # fmt: skip


def test_grid_slots_count_2014_to_2025_races_only():
    priors = p.build_priors(FIXTURE)
    slots = {s.slot: (s.starts, s.podiums, s.wins) for s in priors.grid_slots}
    # The 2013 race and the sprint are ignored; the DNS from slot 2 is not a start.
    assert slots == {
        0: (2, 1, 0),  # pit-lane starts: P4 and P3
        1: (2, 2, 1),
        2: (1, 1, 0),
        3: (2, 1, 1),
        4: (2, 1, 0),  # P3 and a DNF
    }
    assert priors.slot(1) is not None and priors.slot(1).win_rate == 0.5  # type: ignore[union-attr]
    assert priors.source == f"f1db {p.F1DB_VERSION}"
    assert priors.seasons == (2014, 2025)


def test_circuits_count_all_years_and_no_safety_car_data():
    priors = p.build_priors(FIXTURE)
    sepang = priors.circuit("sepang")
    assert sepang is not None
    assert (sepang.races, sepang.last_held) == (2, 2017)
    marina_bay = priors.circuit("marina_bay")
    assert marina_bay is not None and (marina_bay.races, marina_bay.last_held) == (1, 2025)
    madring = priors.circuit("madring")  # first raced in 2026: no history before it
    assert madring is not None and (madring.races, madring.last_held) == (0, None)
    assert all(c.safety_car_races is None and c.safety_car_source is None for c in priors.circuits)


def test_circuit_history_stops_at_the_last_grid_season():
    # The fixture has 2026 races at Sepang and Madring; neither may count, or a 2026
    # snapshot would include the race it predicts.
    priors = p.build_priors(FIXTURE)
    assert all((c.last_held or 0) <= priors.seasons[1] for c in priors.circuits)
    sepang = priors.circuit("sepang")
    assert sepang is not None and sepang.races == 2
    # 2026 results never reach the grid-slot rates either (Norris won both from pole).
    assert priors.slot(1) is not None and priors.slot(1).starts == 2  # type: ignore[union-attr]


def test_every_2026_jolpica_circuit_is_mapped():
    assert set(JOLPICA_2026_CIRCUITS) <= set(p.JOLPICA_TO_F1DB)
    circuits = {c.circuit_id for c in p.build_priors(FIXTURE).circuits}
    assert set(JOLPICA_2026_CIRCUITS) <= circuits


def test_write_load_round_trip_is_deterministic(tmp_path):
    priors = p.build_priors(FIXTURE)
    path = tmp_path / "priors" / "priors.json"
    p.write_priors(priors, path)
    first = path.read_bytes()
    assert first.endswith(b"}\n")
    assert p.load_priors(path) == priors
    p.write_priors(p.load_priors(path), path)
    assert path.read_bytes() == first


def _zip_of_fixture() -> bytes:
    buffer = io.BytesIO()
    with zipfile.ZipFile(buffer, "w") as z:
        for f in sorted(FIXTURE.iterdir()):
            z.write(f, f.name)
    return buffer.getvalue()


@respx.mock
def test_download_rejects_a_checksum_mismatch(tmp_path):
    respx.get(p.F1DB_URL).mock(return_value=httpx.Response(200, content=b"not the release"))
    with httpx.Client() as client, pytest.raises(p.ChecksumError):
        p.download_f1db(tmp_path, client)
    assert not any(tmp_path.iterdir())


@respx.mock
def test_download_verifies_extracts_and_reuses(tmp_path, monkeypatch):
    content = _zip_of_fixture()
    monkeypatch.setattr(p, "F1DB_SHA256", hashlib.sha256(content).hexdigest())
    route = respx.get(p.F1DB_URL).mock(return_value=httpx.Response(200, content=content))
    with httpx.Client() as client:
        source = p.download_f1db(tmp_path, client)
        assert (source / "f1db-races.csv").exists()
        assert p.download_f1db(tmp_path, client) == source
    assert route.call_count == 1
    assert p.build_priors(source) == p.build_priors(FIXTURE)
