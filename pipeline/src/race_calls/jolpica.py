"""Jolpica (Ergast-compatible) client: calendar, qualifying, results, sprint, standings.

Jolpica documents a burst limit of 4 requests per second and 500 per hour, so the
limiter stays just under both. Responses are cached under settings.data_dir, but an
empty table is never cached (the data may simply not be published yet), and anything
that can still change gets a max_age.
"""

import re
import time
from collections.abc import Callable
from datetime import UTC, datetime, timedelta
from typing import Any

import httpx

from race_calls.cache import JsonCache
from race_calls.http import make_client
from race_calls.models import (
    Constructor,
    ConstructorStanding,
    Driver,
    DriverStanding,
    QualifyingEntry,
    RaceResult,
    ResultEntry,
    Standings,
    Weekend,
)
from race_calls.openf1.ratelimit import SlidingWindowLimiter
from race_calls.settings import get_settings

BASE_URL = "https://api.jolpi.ca/ergast/f1"
NAMESPACE = "jolpica"
PARAMS = {"format": "json", "limit": "100"}
RETRYABLE_STATUS = {429, 500, 502, 503, 504}
BASE_DELAY = 2.0
MAX_RETRY_AFTER = 60.0
CALENDAR_MAX_AGE = timedelta(hours=6)
# Post-race penalties amend results and standings for a few days after a race.
RECENT_RACE = timedelta(days=7)
RECENT_MAX_AGE = timedelta(hours=1)

Json = dict[str, Any]


class JolpicaError(RuntimeError):
    pass


def jolpica_limiter(**kwargs: Any) -> SlidingWindowLimiter:
    return SlidingWindowLimiter([(3, 1.0), (400, 3600.0)], **kwargs)


def _now() -> datetime:
    return datetime.now(UTC)


def slugify(name: str) -> str:
    return re.sub(r"[^a-z0-9]+", "-", name.lower()).strip("-")


def _int(value: Any) -> int | None:
    try:
        return int(value)
    except (TypeError, ValueError):
        return None


def _float(value: Any) -> float | None:
    try:
        return float(value)
    except (TypeError, ValueError):
        return None


def _str(value: Any) -> str:
    return value if isinstance(value, str) else ""


def _dict(value: Any) -> Json:
    return value if isinstance(value, dict) else {}


def _list(value: Any) -> list[Json]:
    return [v for v in value if isinstance(v, dict)] if isinstance(value, list) else []


def _utc(block: Any) -> datetime | None:
    """{"date": "2026-10-03", "time": "08:00:00Z"} -> 2026-10-03T08:00Z; no time -> None."""
    block = _dict(block)
    day, clock = block.get("date"), block.get("time")
    if not isinstance(day, str) or not isinstance(clock, str):
        return None
    try:
        parsed = datetime.fromisoformat(f"{day}T{clock}")
    except ValueError:
        return None
    return parsed.replace(tzinfo=UTC) if parsed.tzinfo is None else parsed.astimezone(UTC)


def _weekend(race: Json) -> Weekend:
    season, round_ = _int(race.get("season")), _int(race.get("round"))
    name = _str(race.get("raceName"))
    race_start = _utc(race)
    if season is None or round_ is None or not name:
        raise JolpicaError(f"calendar entry without season, round or name: {race}")
    if race_start is None:
        raise JolpicaError(f"{season} round {round_} has no race start time")
    circuit = _dict(race.get("Circuit"))
    location = _dict(circuit.get("Location"))
    return Weekend(
        season=season,
        round=round_,
        name=name,
        slug=slugify(name),
        circuit_id=_str(circuit.get("circuitId")),
        circuit_name=_str(circuit.get("circuitName")),
        locality=_str(location.get("locality")),
        country=_str(location.get("country")),
        race_start=race_start,
        qualifying_start=_utc(race.get("Qualifying")),
        sprint_start=_utc(race.get("Sprint")),
        sprint_qualifying_start=_utc(race.get("SprintQualifying") or race.get("SprintShootout")),
    )


def _driver(entry: Json) -> Driver | None:
    raw = _dict(entry.get("Driver"))
    driver_id, family = _str(raw.get("driverId")), _str(raw.get("familyName"))
    if not driver_id or not family:
        return None
    code = _str(raw.get("code")) or family[:3].upper()
    number = _int(raw.get("permanentNumber"))
    return Driver(
        driver_id=driver_id,
        code=code,
        number=number if number is not None else _int(entry.get("number")),
        given_name=_str(raw.get("givenName")),
        family_name=family,
    )


def _constructor(raw: Any) -> Constructor | None:
    raw = _dict(raw)
    constructor_id = _str(raw.get("constructorId"))
    if not constructor_id:
        return None
    return Constructor(constructor_id=constructor_id, name=_str(raw.get("name")) or constructor_id)


def _first_race(data: Json, table: str) -> Json | None:
    """The single race in a round response, if it carries a non-empty `table`."""
    races = _list(_dict(data.get("RaceTable")).get("Races"))
    if not races or not _list(races[0].get(table)):
        return None
    return races[0]


def _result_entries(rows: list[Json]) -> tuple[ResultEntry, ...]:
    entries = []
    for index, row in enumerate(rows, start=1):
        driver, constructor = _driver(row), _constructor(row.get("Constructor"))
        if driver is None or constructor is None:
            continue
        position = _int(row.get("position"))
        entries.append(
            ResultEntry(
                position=position if position is not None else index,
                position_text=_str(row.get("positionText")) or str(position or index),
                points=_float(row.get("points")) or 0.0,
                grid=_int(row.get("grid")) or 0,
                laps=_int(row.get("laps")) or 0,
                status=_str(row.get("status")),
                driver=driver,
                constructor=constructor,
            )
        )
    return tuple(entries)


def _standings_list(data: Json, season: int, after_round: int) -> Json | None:
    lists = _list(_dict(data.get("StandingsTable")).get("StandingsLists"))
    if not lists:
        return None
    first = lists[0]
    # Asking for a round that has not been run can return nothing or another round.
    if _int(first.get("season")) != season or _int(first.get("round")) != after_round:
        return None
    return first


class JolpicaClient:
    def __init__(
        self,
        http: httpx.Client | None = None,
        cache: JsonCache | None = None,
        limiter: SlidingWindowLimiter | None = None,
        sleep: Callable[[float], None] = time.sleep,
        clock: Callable[[], datetime] = _now,
        base_url: str = BASE_URL,
        max_retries: int = 5,
    ) -> None:
        self._http = http if http is not None else make_client()
        if cache is None:
            cache = JsonCache(get_settings().data_dir / "cache", clock=clock)
        self._cache = cache
        self._limiter = limiter if limiter is not None else jolpica_limiter(sleep=sleep)
        self._sleep = sleep
        self._clock = clock
        self._base_url = base_url.rstrip("/")
        self._max_retries = max_retries

    # --- public API -----------------------------------------------------------------

    def calendar(self, season: int) -> list[Weekend]:
        data = self._cached(
            f"{season}/races/",
            max_age=lambda _: CALENDAR_MAX_AGE,
            has_data=lambda d: bool(_list(_dict(d.get("RaceTable")).get("Races"))),
        )
        races = _list(_dict(data.get("RaceTable")).get("Races")) if data else []
        return sorted((_weekend(race) for race in races), key=lambda w: w.round)

    def weekend(self, season: int, round: int) -> Weekend:
        for weekend in self.calendar(season):
            if weekend.round == round:
                return weekend
        raise JolpicaError(f"{season} has no round {round}")

    def qualifying(self, season: int, round: int) -> list[QualifyingEntry]:
        race = self._round_table(season, round, "qualifying", "QualifyingResults")
        if race is None:
            return []
        entries = []
        for index, row in enumerate(_list(race.get("QualifyingResults")), start=1):
            driver, constructor = _driver(row), _constructor(row.get("Constructor"))
            if driver is None or constructor is None:
                continue
            entries.append(
                QualifyingEntry(
                    position=_int(row.get("position")) or index,
                    driver=driver,
                    constructor=constructor,
                    q1=_str(row.get("Q1")) or None,
                    q2=_str(row.get("Q2")) or None,
                    q3=_str(row.get("Q3")) or None,
                )
            )
        return entries

    def results(self, season: int, round: int) -> RaceResult | None:
        race = self._round_table(season, round, "results", "Results")
        if race is None:
            return None
        entries = _result_entries(_list(race.get("Results")))
        return RaceResult(season=season, round=round, entries=entries) if entries else None

    def sprint(self, season: int, round: int) -> RaceResult | None:
        race = self._round_table(season, round, "sprint", "SprintResults")
        if race is None:
            return None
        entries = _result_entries(_list(race.get("SprintResults")))
        return RaceResult(season=season, round=round, entries=entries) if entries else None

    def standings(self, season: int, after_round: int) -> Standings | None:
        if after_round < 1:
            return None

        def max_age(_: Json) -> timedelta:
            try:
                return self._round_max_age(self.weekend(season, after_round).race_start)
            except JolpicaError:
                return RECENT_MAX_AGE

        def has_data(data: Json) -> bool:
            return _standings_list(data, season, after_round) is not None

        driver_data = self._cached(
            f"{season}/{after_round}/driverStandings/", max_age=max_age, has_data=has_data
        )
        if driver_data is None:
            return None
        constructor_data = self._cached(
            f"{season}/{after_round}/constructorStandings/", max_age=max_age, has_data=has_data
        )
        if constructor_data is None:
            return None
        driver_list = _standings_list(driver_data, season, after_round) or {}
        constructor_list = _standings_list(constructor_data, season, after_round) or {}

        drivers = []
        for row in _list(driver_list.get("DriverStandings")):
            driver = _driver(row)
            if driver is None:
                continue
            constructors = _list(row.get("Constructors"))
            drivers.append(
                DriverStanding(
                    position=_int(row.get("position")),
                    points=_float(row.get("points")) or 0.0,
                    wins=_int(row.get("wins")) or 0,
                    driver=driver,
                    constructor=_constructor(constructors[-1]) if constructors else None,
                )
            )
        constructors_out = []
        for row in _list(constructor_list.get("ConstructorStandings")):
            constructor = _constructor(row.get("Constructor"))
            if constructor is None:
                continue
            constructors_out.append(
                ConstructorStanding(
                    position=_int(row.get("position")),
                    points=_float(row.get("points")) or 0.0,
                    wins=_int(row.get("wins")) or 0,
                    constructor=constructor,
                )
            )
        return Standings(
            season=season,
            after_round=after_round,
            drivers=tuple(drivers),
            constructors=tuple(constructors_out),
        )

    # --- caching --------------------------------------------------------------------

    def _round_max_age(self, race_start: datetime | None) -> timedelta:
        """Recent rounds refresh hourly. Older ones are final, but only a copy fetched once
        the round settled (race_start + 7 days) counts; an earlier copy is fetched again."""
        if race_start is None:
            return RECENT_MAX_AGE
        since_settled = self._clock() - (race_start + RECENT_RACE)
        return RECENT_MAX_AGE if since_settled < timedelta(0) else since_settled

    def _round_table(self, season: int, round: int, endpoint: str, table: str) -> Json | None:
        data = self._cached(
            f"{season}/{round}/{endpoint}/",
            # The response carries the race's own date and time, so no calendar lookup.
            max_age=lambda d: self._round_max_age(_utc(_first_race(d, table))),
            has_data=lambda d: _first_race(d, table) is not None,
        )
        return _first_race(data, table) if data else None

    def _cached(
        self,
        path: str,
        max_age: Callable[[Json], timedelta | None],
        has_data: Callable[[Json], bool],
    ) -> Json | None:
        """MRData for `path` from the cache when still fresh, else from Jolpica.

        Returns None when the table is empty; an empty table is never cached.
        """
        key = f"{self._base_url}/{path}"
        cached = self._cache.get(NAMESPACE, key)
        if isinstance(cached, dict) and has_data(cached):
            age = max_age(cached)
            if age is None or self._cache.get(NAMESPACE, key, max_age=age) is not None:
                return cached
        data = self._get(path)
        if not has_data(data):
            return None
        self._cache.put(NAMESPACE, key, data)
        return data

    # --- HTTP -----------------------------------------------------------------------

    def _get(self, path: str) -> Json:
        url = f"{self._base_url}/{path}"
        last_problem = "no attempt made"
        for attempt in range(self._max_retries + 1):
            self._limiter.acquire()
            try:
                response = self._http.get(url, params=PARAMS)
            except httpx.TransportError as error:
                last_problem = f"{type(error).__name__}: {error}"
                if attempt == self._max_retries:
                    break
                self._sleep(BASE_DELAY * 2.0**attempt)
                continue
            last_problem = f"status {response.status_code}"
            if response.status_code in RETRYABLE_STATUS:
                if attempt == self._max_retries:
                    break
                self._sleep(self._retry_delay(response, attempt))
                continue
            if response.status_code != 200:
                raise JolpicaError(f"{path}: {response.status_code} {response.text[:200]}")
            try:
                body = response.json()
            except ValueError as error:
                raise JolpicaError(f"{path}: response is not JSON") from error
            data = body.get("MRData") if isinstance(body, dict) else None
            if not isinstance(data, dict):
                raise JolpicaError(f"{path}: response has no MRData object")
            return data
        raise JolpicaError(
            f"{path}: gave up after {self._max_retries + 1} attempts ({last_problem})"
        )

    @staticmethod
    def _retry_delay(response: httpx.Response, attempt: int) -> float:
        retry_after = _float(response.headers.get("Retry-After"))
        if retry_after is not None and retry_after >= 0:
            return min(retry_after, MAX_RETRY_AFTER)
        return min(BASE_DELAY * 2.0**attempt, MAX_RETRY_AFTER)
