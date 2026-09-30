"""Shared data contracts.

Source models (Jolpica, f1db, OpenF1) are what the clients return; the snapshot is what
Jev sees; the prediction record is what gets committed to predictions/ and what the site
reads. Times are always timezone-aware UTC.
"""

from datetime import date, datetime
from enum import StrEnum
from typing import Any

from pydantic import AwareDatetime, BaseModel, ConfigDict, Field

SCHEMA_VERSION = 1


class Frozen(BaseModel):
    model_config = ConfigDict(frozen=True, extra="forbid")


# --- Jolpica ------------------------------------------------------------------------


class Weekend(Frozen):
    """One round of the calendar, with its session start times."""

    season: int
    round: int
    name: str  # "Bahrain Grand Prix in Malaysia"
    slug: str  # "bahrain-grand-prix-in-malaysia"; files are "<round>-<slug>.json"
    circuit_id: str  # "sepang"
    circuit_name: str
    locality: str
    country: str
    race_start: AwareDatetime
    qualifying_start: AwareDatetime | None = None
    sprint_start: AwareDatetime | None = None
    sprint_qualifying_start: AwareDatetime | None = None

    @property
    def is_sprint(self) -> bool:
        return self.sprint_start is not None

    @property
    def file_stem(self) -> str:
        return f"{self.round:02d}-{self.slug}"


class Driver(Frozen):
    driver_id: str  # "max_verstappen"
    code: str  # "VER"; the key for every per-driver question and answer
    number: int | None = None
    given_name: str
    family_name: str

    @property
    def name(self) -> str:
        return f"{self.given_name} {self.family_name}"


class Constructor(Frozen):
    constructor_id: str  # "red_bull"
    name: str  # "Red Bull"


class QualifyingEntry(Frozen):
    position: int
    driver: Driver
    constructor: Constructor
    q1: str | None = None  # raw lap time, "1:31.234"; see lap_seconds
    q2: str | None = None
    q3: str | None = None


class ResultEntry(Frozen):
    """One line of a race or sprint classification."""

    position: int  # classification order, including non-finishers
    position_text: str  # "1".."22", or "R" retired, "D" disqualified, "W", "N", "E", "F"
    points: float
    grid: int  # 0 means a pit-lane start
    laps: int
    status: str  # "Finished", "Lapped", "Retired", ...
    driver: Driver
    constructor: Constructor

    @property
    def classified(self) -> bool:
        return self.position_text.isdigit()


class RaceResult(Frozen):
    season: int
    round: int
    entries: tuple[ResultEntry, ...]


class DriverStanding(Frozen):
    position: int | None  # Jolpica shows "-" for some drivers
    points: float
    wins: int
    driver: Driver
    constructor: Constructor | None


class ConstructorStanding(Frozen):
    position: int | None
    points: float
    wins: int
    constructor: Constructor


class Standings(Frozen):
    """Championship standings after `after_round`."""

    season: int
    after_round: int
    drivers: tuple[DriverStanding, ...]
    constructors: tuple[ConstructorStanding, ...]


def lap_seconds(raw: str | None) -> float | None:
    """ "1:31.234" -> 91.234, "58.123" -> 58.123, blank or malformed -> None."""
    if not raw:
        return None
    try:
        minutes, _, seconds = raw.strip().rpartition(":")
        return (int(minutes) * 60 if minutes else 0) + float(seconds)
    except ValueError:
        return None


# --- f1db priors ----------------------------------------------------------------------


class GridSlotRate(Frozen):
    slot: int  # 1..22; 0 is a pit-lane start
    starts: int
    podiums: int
    wins: int

    @property
    def podium_rate(self) -> float:
        return self.podiums / self.starts if self.starts else 0.0

    @property
    def win_rate(self) -> float:
        return self.wins / self.starts if self.starts else 0.0


class CircuitHistory(Frozen):
    circuit_id: str  # Jolpica circuit id, e.g. "sepang"
    races: int  # championship races held here, all years
    last_held: int | None
    # Races (and the seasons they cover) with at least one full safety car, when known.
    safety_car_races: int | None = None
    safety_car_seasons: tuple[int, ...] = ()
    safety_car_source: str | None = None


class Priors(Frozen):
    """Historical rates computed from a pinned f1db release; committed under priors/."""

    source: str  # "f1db v2026.x.y"
    seasons: tuple[int, int]  # (2014, 2025)
    grid_slots: tuple[GridSlotRate, ...]
    circuits: tuple[CircuitHistory, ...]

    def slot(self, slot: int) -> GridSlotRate | None:
        return next((s for s in self.grid_slots if s.slot == slot), None)

    def circuit(self, circuit_id: str) -> CircuitHistory | None:
        return next((c for c in self.circuits if c.circuit_id == circuit_id), None)


# --- OpenF1 -------------------------------------------------------------------------


class SessionWeather(Frozen):
    session_key: int
    samples: int
    rainfall: bool  # any sample reported rain
    air_temp_c: float | None  # mean
    track_temp_c: float | None  # mean


class RaceControlSummary(Frozen):
    session_key: int
    safety_cars: int  # full safety car deployments
    virtual_safety_cars: int
    red_flags: int
    first_lap_yellow_or_vsc: bool
    messages: int


# --- Snapshot (what Jev sees) ---------------------------------------------------------


class DriverFact(Frozen):
    code: str
    name: str
    constructor: str
    grid: int  # provisional grid slot (qualifying order unless a penalty is known)
    line: str  # the plain sentence given to Jev


class Snapshot(Frozen):
    season: int
    round: int
    race_name: str
    built_at: AwareDatetime
    grid_provisional: bool
    drivers: tuple[DriverFact, ...]  # in grid order
    race_lines: tuple[str, ...]

    @property
    def text(self) -> str:
        driver_block = "\n".join(d.line for d in self.drivers)
        return "\n".join(self.race_lines) + "\n\nDrivers, in grid order:\n" + driver_block


# --- Prediction record (committed, read by the site) ----------------------------------


class Kind(StrEnum):
    LIVE = "live"
    BACKTEST = "backtest"  # the model may have seen these results


class Status(StrEnum):
    OK = "ok"
    NO_PREDICTION = "no_prediction"  # qualifying data never arrived in time
    FAILED = "failed"  # Jev could not be reached; carries an error, never a key


class WinnerCall(Frozen):
    choice: str  # driver code
    confidence: float | None
    probabilities: dict[str, float]  # driver code -> probability


class ChaosCall(Frozen):
    score: float  # 0..4
    confidence: float | None


class Calls(Frozen):
    podium: dict[str, float]  # driver code -> Jev's raw noul; not normalised
    winner: WinnerCall
    chaos: ChaosCall


class JevMeta(Frozen):
    url: str
    model_requested: str  # "typesafe/jev-1.13"
    model_id: str | None  # the dated version it reported, "typesafe/jev-1.13-20260917"
    provider: str | None
    generation_id: str | None
    cost_usd: float | None
    input_tokens: int | None
    output_tokens: int | None
    latency_ms: int
    requested_at: AwareDatetime


class RecordDriver(Frozen):
    code: str
    name: str
    number: int | None
    constructor: str
    constructor_id: str
    grid: int


class PredictionRecord(Frozen):
    schema_version: int = SCHEMA_VERSION
    season: int
    round: int
    slug: str
    race_name: str
    circuit_name: str
    race_start: AwareDatetime
    kind: Kind
    status: Status
    made_at: AwareDatetime  # when the record was written
    late: bool  # made_at is after race_start: published, never scored
    note: str | None = None
    grid_provisional: bool = True
    drivers: tuple[RecordDriver, ...] = ()  # in grid order
    snapshot_text: str | None = None
    request: dict[str, Any] | None = None
    request_hash: str | None = None  # SHA-256 of the canonical request body
    response: dict[str, Any] | None = None
    jev: JevMeta | None = None
    calls: Calls | None = None
    error: str | None = None
    extra: dict[str, Any] = Field(default_factory=dict)


def model_date(model_id: str | None) -> date | None:
    """ "typesafe/jev-1.13-20260917" -> 2026-09-17; anything else -> None."""
    if not model_id:
        return None
    tail = model_id.rsplit("-", 1)[-1]
    try:
        return datetime.strptime(tail, "%Y%m%d").date() if len(tail) == 8 else None
    except ValueError:
        return None


# --- Score record (committed under scores/, read by the site) ---------------------------


class RaceOutcome(Frozen):
    winner: str  # driver code
    podium: tuple[str, ...]  # codes in finishing order, P1 to P3
    finish: dict[str, str]  # code -> Jolpica positionText: "1".."22", "R", "D", "W", "N", "F", "E"


class ChaosInputs(Frozen):
    """What the actual chaos level was computed from, kept for auditing."""

    safety_cars: int
    virtual_safety_cars: int
    red_flags: int
    first_lap_yellow_or_vsc: bool
    retirements: int  # started but not classified (excludes did-not-start)
    lead_changes: int | None  # None when OpenF1 position data was unavailable
    wet: bool
    podium_from_top_six: bool  # at least one podium finisher started in the top six


class ChaosActual(Frozen):
    actual: int  # 0..4, the highest rubric row that holds
    reason: str  # plain words, e.g. "a red flag"
    inputs: ChaosInputs
    # When the race really started (race control's first SESSION STARTED). Races can be
    # moved without the calendar catching up (2026 Miami ran at 17:00Z, Jolpica said 20:00Z),
    # so a live call is checked against this too before it is scored.
    lights_out: AwareDatetime | None = None


class ContenderScore(Frozen):
    podium_brier: float
    winner_log_loss: float
    winner_hit: bool
    podium_pick: tuple[str, ...]  # three codes, most likely first
    podium_hits: int  # 0..3
    chaos_error: float | None  # None when this side makes no chaos call


class ScoreChaos(Frozen):
    actual: int
    reason: str


class ScoreRecord(Frozen):
    """The shape web/src/data/scores.ts reads; extra fields are ignored by the site."""

    schema_version: int = SCHEMA_VERSION
    season: int
    round: int
    kind: Kind
    scored_at: AwareDatetime
    prediction: str  # repository path of the scored prediction record
    result: RaceOutcome
    chaos: ScoreChaos
    scores: dict[str, ContenderScore]  # "jev", "grid", "form"
    details: dict[str, Any] = Field(default_factory=dict)  # chaos inputs, baseline notes
