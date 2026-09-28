import json
from datetime import UTC, datetime, timedelta
from pathlib import Path

import httpx
import pytest
import respx

from race_calls.cache import JsonCache
from race_calls.jolpica import BASE_URL, JolpicaClient, JolpicaError, jolpica_limiter, slugify
from race_calls.openf1.ratelimit import SlidingWindowLimiter

FIXTURES = Path(__file__).parent / "fixtures" / "jolpica"


def fixture(name: str) -> dict:
    return json.loads((FIXTURES / name).read_text())


class Clock:
    def __init__(self, now: datetime) -> None:
        self.now = now

    def __call__(self) -> datetime:
        return self.now


class Sleeps(list[float]):
    def __call__(self, seconds: float) -> None:
        self.append(seconds)


class CountingLimiter(SlidingWindowLimiter):
    def __init__(self) -> None:
        super().__init__([(1000, 1.0)])
        self.calls = 0

    def acquire(self) -> None:
        self.calls += 1


@pytest.fixture
def clock() -> Clock:
    return Clock(datetime(2026, 9, 28, 12, 0, tzinfo=UTC))


@pytest.fixture
def sleeps() -> Sleeps:
    return Sleeps()


@pytest.fixture
def limiter() -> CountingLimiter:
    return CountingLimiter()


@pytest.fixture
def client(tmp_path, clock, sleeps, limiter):
    with httpx.Client() as http:
        yield JolpicaClient(
            http=http,
            cache=JsonCache(tmp_path / "cache", clock=clock),
            limiter=limiter,
            sleep=sleeps,
            clock=clock,
        )


@pytest.fixture
def api():
    with respx.mock(base_url=BASE_URL, assert_all_called=False) as mock:
        yield mock


def test_slugify():
    assert slugify("Bahrain Grand Prix in Malaysia") == "bahrain-grand-prix-in-malaysia"
    assert slugify("  São Paulo -- Grand Prix! ") == "s-o-paulo-grand-prix"


def test_calendar_parses_every_round(client, api):
    route = api.get("/2026/races/").respond(json=fixture("2026_races.json"))
    calendar = client.calendar(2026)
    assert [w.round for w in calendar] == list(range(1, 24))
    assert route.calls[0].request.url.params["format"] == "json"
    assert route.calls[0].request.url.params["limit"] == "100"

    bahrain = calendar[15]
    assert bahrain.name == "Bahrain Grand Prix in Malaysia"
    assert bahrain.slug == "bahrain-grand-prix-in-malaysia"
    assert bahrain.file_stem == "16-bahrain-grand-prix-in-malaysia"
    assert bahrain.circuit_id == "sepang"
    assert bahrain.locality == "Kuala Lumpur"
    assert bahrain.country == "Malaysia"
    assert bahrain.race_start == datetime(2026, 10, 4, 7, 0, tzinfo=UTC)
    assert bahrain.qualifying_start == datetime(2026, 10, 3, 8, 0, tzinfo=UTC)
    assert not bahrain.is_sprint
    assert bahrain.sprint_qualifying_start is None

    singapore = calendar[16]
    assert singapore.is_sprint
    assert singapore.sprint_start is not None
    assert singapore.sprint_qualifying_start is not None
    assert [w.round for w in calendar if w.is_sprint] == [2, 4, 5, 9, 12, 17]


def test_weekend_and_missing_round(client, api):
    api.get("/2026/races/").respond(json=fixture("2026_races.json"))
    assert client.weekend(2026, 16).circuit_id == "sepang"
    with pytest.raises(JolpicaError, match="no round 30"):
        client.weekend(2026, 30)


def test_calendar_older_sprint_shootout_and_missing_session_time(client, api):
    race = {
        "season": "2023",
        "round": "4",
        "raceName": "Azerbaijan Grand Prix",
        "Circuit": {"circuitId": "baku", "circuitName": "Baku City Circuit", "Location": {}},
        "date": "2023-04-30",
        "time": "11:00:00Z",
        "Qualifying": {"date": "2023-04-28"},
        "Sprint": {"date": "2023-04-29", "time": "15:30:00Z"},
        "SprintShootout": {"date": "2023-04-29", "time": "11:30:00Z"},
    }
    api.get("/2023/races/").respond(json={"MRData": {"RaceTable": {"Races": [race]}}})
    [weekend] = client.calendar(2023)
    assert weekend.qualifying_start is None
    assert weekend.sprint_qualifying_start == datetime(2023, 4, 29, 11, 30, tzinfo=UTC)
    assert weekend.locality == ""


def test_race_without_time_is_an_error(client, api):
    race = {"season": "2026", "round": "1", "raceName": "X Grand Prix", "date": "2026-03-08"}
    api.get("/2026/races/").respond(json={"MRData": {"RaceTable": {"Races": [race]}}})
    with pytest.raises(JolpicaError, match="no race start"):
        client.calendar(2026)


def test_calendar_cache_expires_after_six_hours(client, api, clock):
    route = api.get("/2026/races/").respond(json=fixture("2026_races.json"))
    client.calendar(2026)
    clock.now += timedelta(hours=5)
    client.calendar(2026)
    assert route.call_count == 1
    clock.now += timedelta(hours=2)
    client.calendar(2026)
    assert route.call_count == 2


def test_qualifying_parses_q1_q2_q3(client, api):
    api.get("/2026/15/qualifying/").respond(json=fixture("2026_15_qualifying.json"))
    grid = client.qualifying(2026, 15)
    assert len(grid) == 22
    pole = grid[0]
    assert pole.position == 1
    assert pole.driver.code == "RUS"
    assert pole.driver.number == 63
    assert pole.driver.name == "George Russell"
    assert pole.constructor.constructor_id == "mercedes"
    assert (pole.q1, pole.q2, pole.q3) == ("1:43.615", "1:43.462", "1:42.526")
    last = grid[-1]
    assert last.position == 22
    assert last.driver.code == "BOT"
    assert last.q1 == "1:48.290"
    assert last.q2 is None and last.q3 is None


def test_empty_qualifying_is_empty_and_not_cached(client, api):
    route = api.get("/2026/16/qualifying/").respond(json=fixture("2026_16_qualifying_empty.json"))
    assert client.qualifying(2026, 16) == []
    assert client.qualifying(2026, 16) == []
    assert route.call_count == 2


def test_results_parse_including_retirements(client, api):
    api.get("/2026/15/results/").respond(json=fixture("2026_15_results.json"))
    result = client.results(2026, 15)
    assert result is not None
    assert (result.season, result.round, len(result.entries)) == (2026, 15, 22)
    winner = result.entries[0]
    assert winner.driver.code == "RUS"
    assert (winner.position, winner.position_text, winner.points) == (1, "1", 25.0)
    assert (winner.grid, winner.laps, winner.status) == (1, 51, "Finished")
    assert winner.classified
    retired = result.entries[16]
    assert retired.driver.code == "COL"
    assert (retired.position, retired.position_text, retired.status) == (17, "R", "Retired")
    assert retired.laps == 36
    assert not retired.classified
    assert [e.driver.code for e in result.entries if not e.classified] == [
        "COL",
        "GAS",
        "NOR",
        "ALB",
        "ALO",
        "STR",
    ]


def test_sprint_parse_and_absent(client, api):
    api.get("/2026/12/sprint/").respond(json=fixture("2026_12_sprint.json"))
    api.get("/2026/15/sprint/").respond(json=fixture("2026_15_sprint_empty.json"))
    sprint = client.sprint(2026, 12)
    assert sprint is not None
    assert sprint.entries[0].driver.code == "RUS"
    assert sprint.entries[0].points == 8.0
    assert client.sprint(2026, 15) is None


def test_results_not_published(client, api):
    api.get("/2026/16/results/").respond(
        json={"MRData": {"RaceTable": {"season": "2026", "round": "16", "Races": []}}}
    )
    assert client.results(2026, 16) is None


def test_standings_parse(client, api):
    api.get("/2026/races/").respond(json=fixture("2026_races.json"))
    api.get("/2026/15/driverStandings/").respond(json=fixture("2026_15_driver_standings.json"))
    api.get("/2026/15/constructorStandings/").respond(
        json=fixture("2026_15_constructor_standings.json")
    )
    standings = client.standings(2026, 15)
    assert standings is not None
    assert (standings.season, standings.after_round) == (2026, 15)
    assert len(standings.drivers) == 23
    leader = standings.drivers[0]
    assert (leader.position, leader.points, leader.wins) == (1, 302.0, 8)
    assert leader.driver.code == "ANT"
    assert leader.constructor is not None and leader.constructor.constructor_id == "mercedes"
    lawson = next(d for d in standings.drivers if d.driver.code == "LAW")
    # Moved mid-season: the last listed team is the current one.
    assert lawson.constructor is not None and lawson.constructor.constructor_id == "red_bull"
    assert standings.constructors[0].constructor.constructor_id == "mercedes"
    assert (standings.constructors[0].points, standings.constructors[0].wins) == (538.0, 11)


def test_standings_missing_position_and_no_constructor(client, api):
    api.get("/2026/races/").respond(json=fixture("2026_races.json"))
    driver_row = {
        "positionText": "-",
        "points": "0",
        "wins": "0",
        "Driver": {"driverId": "doe", "givenName": "Jane", "familyName": "doe"},
        "Constructors": [],
    }
    lists = [{"season": "2026", "round": "3", "DriverStandings": [driver_row]}]
    api.get("/2026/3/driverStandings/").respond(
        json={"MRData": {"StandingsTable": {"StandingsLists": lists}}}
    )
    constructor_lists = [{"season": "2026", "round": "3", "ConstructorStandings": []}]
    api.get("/2026/3/constructorStandings/").respond(
        json={"MRData": {"StandingsTable": {"StandingsLists": constructor_lists}}}
    )
    standings = client.standings(2026, 3)
    assert standings is not None
    [row] = standings.drivers
    assert row.position is None
    assert row.constructor is None
    assert row.driver.code == "DOE"
    assert row.driver.number is None


def test_standings_before_round_one_and_not_published(client, api):
    assert client.standings(2026, 0) is None
    route = api.get("/2026/16/driverStandings/").respond(
        json={"MRData": {"StandingsTable": {"season": "2026", "StandingsLists": []}}}
    )
    assert client.standings(2026, 16) is None
    assert client.standings(2026, 16) is None
    assert route.call_count == 2


def test_cache_hit_avoids_second_request(tmp_path, clock, sleeps, limiter, api):
    route = api.get("/2026/15/qualifying/").respond(json=fixture("2026_15_qualifying.json"))
    with httpx.Client() as http:
        first = JolpicaClient(
            http=http, cache=JsonCache(tmp_path, clock=clock), limiter=limiter, clock=clock
        )
        second = JolpicaClient(
            http=http, cache=JsonCache(tmp_path, clock=clock), limiter=limiter, clock=clock
        )
        assert first.qualifying(2026, 15) == second.qualifying(2026, 15)
    assert route.call_count == 1


def test_recent_round_refreshes_hourly_old_round_is_kept(client, api, clock):
    # Round 15's race started 2026-09-26 11:00Z, two days before the clock.
    route = api.get("/2026/15/results/").respond(json=fixture("2026_15_results.json"))
    client.results(2026, 15)
    clock.now += timedelta(minutes=30)
    client.results(2026, 15)
    assert route.call_count == 1
    clock.now += timedelta(minutes=45)
    client.results(2026, 15)
    assert route.call_count == 2
    # Ten days after the race the cached copy is final.
    clock.now = datetime(2026, 10, 6, 12, 0, tzinfo=UTC)
    client.results(2026, 15)
    clock.now += timedelta(days=30)
    client.results(2026, 15)
    assert route.call_count == 3


def test_default_cache_lives_under_data_dir(tmp_path, api):
    api.get("/2026/15/sprint/").respond(json=fixture("2026_15_sprint_empty.json"))
    api.get("/2026/12/sprint/").respond(json=fixture("2026_12_sprint.json"))
    with httpx.Client() as http:
        JolpicaClient(http=http, limiter=CountingLimiter()).sprint(2026, 12)
    assert list((tmp_path / "data" / "cache" / "jolpica").glob("*.json"))


def test_429_honours_retry_after_capped(client, api, sleeps):
    route = api.get("/2026/15/qualifying/")
    route.side_effect = [
        httpx.Response(429, headers={"Retry-After": "7"}),
        httpx.Response(429, headers={"Retry-After": "600"}),
        httpx.Response(503),
        httpx.Response(200, json=fixture("2026_15_qualifying.json")),
    ]
    assert len(client.qualifying(2026, 15)) == 22
    assert sleeps == [7.0, 60.0, 8.0]


def test_transport_errors_retry_then_give_up(client, api, sleeps):
    api.get("/2026/races/").mock(side_effect=httpx.ConnectError("reset"))
    with pytest.raises(JolpicaError, match="gave up after 6 attempts"):
        client.calendar(2026)
    assert sleeps == [2.0, 4.0, 8.0, 16.0, 32.0]


def test_rate_limiter_is_used_for_every_request(client, api, limiter):
    api.get("/2026/16/qualifying/").respond(json=fixture("2026_16_qualifying_empty.json"))
    client.qualifying(2026, 16)
    client.qualifying(2026, 16)
    assert limiter.calls == 2


def test_default_limiter_stays_under_jolpica_limits():
    now = [0.0]

    def sleep(seconds: float) -> None:
        now[0] += seconds

    limiter = jolpica_limiter(clock=lambda: now[0], sleep=sleep)
    times = []
    for _ in range(10):
        limiter.acquire()
        times.append(now[0])
    for i, t in enumerate(times):
        assert sum(1 for u in times[i:] if u - t < 1.0) <= 3


def test_404_is_a_clear_error(client, api, sleeps):
    api.get("/2026/99/results/").respond(404, text="Not found")
    with pytest.raises(JolpicaError, match="404"):
        client.results(2026, 99)
    assert sleeps == []


@pytest.mark.parametrize(
    "response",
    [
        httpx.Response(200, text="<html>not json</html>"),
        httpx.Response(200, json=[1, 2, 3]),
        httpx.Response(200, json={"MRData": "nope"}),
    ],
)
def test_garbage_is_a_clear_error(client, api, response):
    api.get("/2026/15/results/").mock(return_value=response)
    with pytest.raises(JolpicaError):
        client.results(2026, 15)


def test_odd_but_valid_json_does_not_raise(client, api):
    races = [{"Results": [{"position": "1"}, "junk", {"Driver": {}, "Constructor": {}}]}]
    api.get("/2026/15/results/").respond(json={"MRData": {"RaceTable": {"Races": races}}})
    assert client.results(2026, 15) is None
    api.get("/2026/14/results/").respond(json={"MRData": {"RaceTable": {"Races": "x"}}})
    assert client.results(2026, 14) is None
