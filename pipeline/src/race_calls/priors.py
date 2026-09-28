"""Historical priors from a pinned f1db release (https://github.com/f1db/f1db).

Run `python -m race_calls.priors` to download the pinned CSV release into the local cache,
verify its checksum, and write priors/priors.json, which is committed.

Grid slots: every championship race of 2014 to 2025 (sprints live in separate f1db files
and are never read). The slot is f1db's starting grid position, with a pit-lane start as
slot 0. A driver classified DNS (did not start) or DNP (did not take part) never took
the start, so they are not counted, even when the starting grid lists them.

Safety cars: this f1db release has no safety car, red flag, or interruption data, so
the circuit safety car fields stay empty here; OpenF1 can fill them.
"""

import csv
import hashlib
import json
import zipfile
from collections import Counter
from pathlib import Path

import httpx

from race_calls.http import make_client
from race_calls.models import CircuitHistory, GridSlotRate, Priors
from race_calls.settings import PROJECT_ROOT, get_settings

F1DB_VERSION = "v2026.15.1"
F1DB_ASSET = "f1db-csv.zip"
F1DB_SHA256 = "56c42ec173ee25d88457acf2378cbfbdd3aafbf97724f0d4eafbe71ae4b1f133"
F1DB_URL = f"https://github.com/f1db/f1db/releases/download/{F1DB_VERSION}/{F1DB_ASSET}"

FIRST_SEASON, LAST_SEASON = 2014, 2025
PRIORS_PATH = PROJECT_ROOT / "priors" / "priors.json"

# Classifications of drivers who never took the start.
NON_STARTERS = frozenset({"DNS", "DNP"})
PIT_LANE = "PL"

# Jolpica circuit id -> f1db circuit id: the 2026 calendar, plus Bahrain and Imola.
JOLPICA_TO_F1DB: dict[str, str] = {
    "albert_park": "melbourne",
    "americas": "austin",
    "bahrain": "bahrain",
    "baku": "baku",
    "catalunya": "catalunya",
    "hungaroring": "hungaroring",
    "imola": "imola",
    "interlagos": "interlagos",
    "jeddah": "jeddah",
    "losail": "lusail",
    "madring": "madring",
    "marina_bay": "marina-bay",
    "miami": "miami",
    "monaco": "monaco",
    "monza": "monza",
    "red_bull_ring": "spielberg",
    "rodriguez": "mexico-city",
    "sepang": "sepang",
    "shanghai": "shanghai",
    "silverstone": "silverstone",
    "spa": "spa-francorchamps",
    "suzuka": "suzuka",
    "vegas": "las-vegas",
    "villeneuve": "montreal",
    "yas_marina": "yas-marina",
    "zandvoort": "zandvoort",
}


class ChecksumError(RuntimeError):
    pass


def _sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as f:
        for chunk in iter(lambda: f.read(1 << 20), b""):
            digest.update(chunk)
    return digest.hexdigest()


def download_f1db(cache_dir: Path, http: httpx.Client | None = None) -> Path:
    """Download and extract the pinned f1db CSV release once; return the extracted dir."""
    archive = cache_dir / f"{F1DB_VERSION}-{F1DB_ASSET}"
    extracted = cache_dir / f"{F1DB_VERSION}-csv"
    if not (archive.exists() and _sha256(archive) == F1DB_SHA256):
        cache_dir.mkdir(parents=True, exist_ok=True)
        client = http or make_client(timeout=120.0, follow_redirects=True)
        try:
            response = client.get(F1DB_URL)
            response.raise_for_status()
        finally:
            if http is None:
                client.close()
        actual = hashlib.sha256(response.content).hexdigest()
        if actual != F1DB_SHA256:
            raise ChecksumError(
                f"{F1DB_ASSET} {F1DB_VERSION}: sha256 {actual}, expected {F1DB_SHA256}"
            )
        archive.write_bytes(response.content)
    if not (extracted / "f1db-races.csv").exists():
        with zipfile.ZipFile(archive) as z:
            z.extractall(extracted)
    return extracted


def _rows(source: Path, name: str) -> list[dict[str, str]]:
    with (source / f"f1db-{name}.csv").open(encoding="utf-8", newline="") as f:
        return list(csv.DictReader(f))


def build_priors(source: Path) -> Priors:
    """Grid-slot rates and circuit history from an extracted f1db CSV release."""
    grid: dict[tuple[str, str], int] = {}
    for row in _rows(source, "races-starting-grid-positions"):
        pit_lane = row["positionText"] == PIT_LANE
        grid[row["raceId"], row["driverId"]] = 0 if pit_lane else int(row["positionNumber"])

    starts: Counter[int] = Counter()
    podiums: Counter[int] = Counter()
    wins: Counter[int] = Counter()
    circuit_of = {row["id"]: row["circuitId"] for row in _rows(source, "races")}
    # f1db race id -> season, for every race with results up to LAST_SEASON; capping the
    # circuit history there keeps a 2026 race from counting itself, since each circuit
    # hosts at most once a season.
    seasons: dict[str, int] = {}

    for row in _rows(source, "races-race-results"):
        season = int(row["year"])
        if season > LAST_SEASON:
            continue
        seasons[row["raceId"]] = season
        if season < FIRST_SEASON or row["positionText"] in NON_STARTERS:
            continue
        start = grid.get((row["raceId"], row["driverId"]))
        if start is None:  # not on the starting grid at all
            continue
        position = int(row["positionNumber"]) if row["positionNumber"] else None
        starts[start] += 1
        podiums[start] += position is not None and position <= 3
        wins[start] += position == 1

    races_at: Counter[str] = Counter()
    last_held: dict[str, int] = {}
    for race_id, season in seasons.items():
        circuit = circuit_of[race_id]
        races_at[circuit] += 1
        last_held[circuit] = max(season, last_held.get(circuit, season))

    return Priors(
        source=f"f1db {F1DB_VERSION}",
        seasons=(FIRST_SEASON, LAST_SEASON),
        grid_slots=tuple(
            GridSlotRate(slot=s, starts=starts[s], podiums=podiums[s], wins=wins[s])
            for s in sorted(starts)
        ),
        circuits=tuple(
            CircuitHistory(
                circuit_id=jolpica_id,
                races=races_at[f1db_id],
                last_held=last_held.get(f1db_id),
            )
            for jolpica_id, f1db_id in sorted(JOLPICA_TO_F1DB.items())
        ),
    )


def write_priors(priors: Priors, path: Path = PRIORS_PATH) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    data = priors.model_dump(mode="json")
    path.write_text(
        json.dumps(data, indent=2, sort_keys=True, ensure_ascii=False) + "\n", encoding="utf-8"
    )


def load_priors(path: Path = PRIORS_PATH) -> Priors:
    return Priors.model_validate_json(path.read_text(encoding="utf-8"))


def main() -> None:
    source = download_f1db(get_settings().data_dir / "f1db")
    priors = build_priors(source)
    write_priors(priors)
    print(f"wrote {PRIORS_PATH} from {priors.source}")


if __name__ == "__main__":
    main()
