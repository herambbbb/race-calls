import json
from datetime import UTC, datetime
from pathlib import Path

import pytest

from race_calls.models import (
    ChaosActual,
    ChaosInputs,
    Constructor,
    Driver,
    GridSlotRate,
    PredictionRecord,
    Priors,
    RaceResult,
    ResultEntry,
    ScoreRecord,
    Status,
)
from race_calls.score import (
    NotScorable,
    ScoreExists,
    form_baseline,
    grid_baseline,
    outcome,
    podium_pick,
    score_path,
    score_prediction,
    write_score,
)

CONTRACTS = Path(__file__).resolve().parents[2] / "contracts"
RECORD = PredictionRecord.model_validate_json(
    (CONTRACTS / "prediction-record.example.json").read_text()
)  # round 99: NOR (grid 1) 0.61, VER (2) 0.55, LEC (3) 0.38; winner NOR 0.41 VER 0.37 LEC 0.22
TEAM = Constructor(constructor_id="x", name="X")
PRIORS = Priors(
    source="f1db test",
    seasons=(2014, 2025),
    grid_slots=(
        GridSlotRate(slot=1, starts=10, podiums=8, wins=5),
        GridSlotRate(slot=2, starts=10, podiums=6, wins=3),
        GridSlotRate(slot=3, starts=10, podiums=5, wins=2),
    ),
    circuits=(),
)
CHAOS = ChaosActual(
    actual=2,
    reason="a full safety car",
    inputs=ChaosInputs(
        safety_cars=1,
        virtual_safety_cars=0,
        red_flags=0,
        first_lap_yellow_or_vsc=False,
        retirements=1,
        lead_changes=1,
        wet=False,
        podium_from_top_six=True,
    ),
)
AT = datetime(2026, 10, 5, 3, tzinfo=UTC)


def driver(code: str) -> Driver:
    return Driver(driver_id=code.lower(), code=code, given_name=code, family_name=code)


def race(round_: int, rows: list[tuple[str, str]], season: int = 2026) -> RaceResult:
    return RaceResult(
        season=season,
        round=round_,
        entries=tuple(
            ResultEntry(
                position=i,
                position_text=text,
                points=0,
                grid=i,
                laps=50,
                status="Finished" if text.isdigit() else "Retired",
                driver=driver(code),
                constructor=TEAM,
            )
            for i, (code, text) in enumerate(rows, start=1)
        ),
    )


RESULT = race(99, [("VER", "1"), ("HAM", "2"), ("NOR", "3"), ("LEC", "R")])


def test_outcome():
    o = outcome(RESULT)
    assert o.winner == "VER" and o.podium == ("VER", "HAM", "NOR")
    assert o.finish == {"VER": "1", "HAM": "2", "NOR": "3", "LEC": "R"}


def test_jev_scores_by_hand():
    s = score_prediction(RECORD, "predictions/2026/99-x.json", RESULT, [], PRIORS, CHAOS, AT)
    jev = s.scores["jev"]
    # NOR on podium (0.61 -> 0.39^2), VER on podium (0.45^2), LEC off (0.38^2)
    assert jev.podium_brier == pytest.approx((0.39**2 + 0.45**2 + 0.38**2) / 3)
    assert jev.winner_log_loss == pytest.approx(-__import__("math").log(0.37))
    assert jev.winner_hit is False
    assert jev.podium_pick == ("NOR", "VER", "LEC") and jev.podium_hits == 2
    assert jev.chaos_error == pytest.approx(abs(1.28 - 2))
    assert s.details["unscored_finishers"] == ["HAM"]  # finished but was not in the call
    assert s.details["podium_sum"] == pytest.approx(1.54)


def test_grid_baseline_uses_slot_rates():
    podium, win = grid_baseline(RECORD, PRIORS)
    assert podium == {"NOR": 0.8, "VER": 0.6, "LEC": 0.5}
    assert win == pytest.approx({"NOR": 0.5, "VER": 0.3, "LEC": 0.2})
    s = score_prediction(RECORD, "p", RESULT, [], PRIORS, CHAOS, AT)
    assert s.scores["grid"].chaos_error is None
    assert s.scores["grid"].podium_pick == ("NOR", "VER", "LEC")


def test_form_baseline_is_smoothed_and_uses_only_the_last_three_earlier_races():
    previous = [
        race(98, [("LEC", "1"), ("NOR", "2"), ("VER", "3")]),
        race(97, [("LEC", "1"), ("VER", "2"), ("NOR", "R")]),
        race(96, [("NOR", "1"), ("VER", "2"), ("LEC", "3")]),
        race(95, [("NOR", "1")]),  # older than the last three: ignored
        race(99, [("NOR", "1")]),  # the race itself: ignored
    ]
    podium, win = form_baseline(RECORD, previous)
    # NOR: 2 podiums in 3 races, plus one pseudo-race at 3 of 3 drivers
    assert podium["NOR"] == pytest.approx((2 + 1) / 4)
    assert podium["LEC"] == pytest.approx((3 + 1) / 4)
    raw = {"NOR": (1 + 1 / 3) / 4, "VER": (0 + 1 / 3) / 4, "LEC": (2 + 1 / 3) / 4}
    total = sum(raw.values())
    assert win == pytest.approx({k: v / total for k, v in raw.items()})


def test_podium_pick_ties():
    assert podium_pick({"B": 0.5, "A": 0.5, "C": 0.5, "D": 0.1}) == ("A", "B", "C")
    assert podium_pick({"B": 0.5, "A": 0.5, "C": 0.5}, {"C": 1, "B": 2, "A": 3}) == ("C", "B", "A")


@pytest.mark.parametrize(
    "update",
    [{"late": True}, {"status": Status.FAILED, "calls": None}, {"status": Status.NO_PREDICTION}],
)
def test_late_failed_and_missing_predictions_are_never_scored(update):
    with pytest.raises(NotScorable):
        score_prediction(RECORD.model_copy(update=update), "p", RESULT, [], PRIORS, CHAOS, AT)


def test_a_live_call_after_the_real_lights_out_is_never_scored():
    # The calendar said 4 October 07:00Z, but the race really started on 3 October at 09:00Z.
    moved = CHAOS.model_copy(update={"lights_out": datetime(2026, 10, 3, 9, tzinfo=UTC)})
    assert RECORD.kind == "live" and not RECORD.late  # made 2026-10-03 10:12Z
    with pytest.raises(NotScorable, match="real lights out"):
        score_prediction(RECORD, "p", RESULT, [], PRIORS, moved, AT)
    on_time = CHAOS.model_copy(update={"lights_out": datetime(2026, 10, 4, 7, tzinfo=UTC)})
    scored = score_prediction(RECORD, "p", RESULT, [], PRIORS, on_time, AT)
    assert scored.details["lights_out"] == "2026-10-04T07:00:00+00:00"  # kept for auditing


def test_a_result_for_another_race_is_refused():
    with pytest.raises(ValueError, match="different race"):
        score_prediction(
            RECORD, "p", race(98, [("A", "1"), ("B", "2"), ("C", "3")]), [], PRIORS, CHAOS, AT
        )


def test_write_score_path_and_no_silent_overwrite(tmp_path):
    s = score_prediction(RECORD, "p", RESULT, [], PRIORS, CHAOS, AT)
    path = write_score(tmp_path, RECORD, s)
    assert path == tmp_path / "2026" / "99-example-grand-prix.json"
    assert path == score_path(tmp_path, RECORD)
    with pytest.raises(ScoreExists):
        write_score(tmp_path, RECORD, s)
    write_score(tmp_path, RECORD, s, force=True)
    assert ScoreRecord.model_validate_json(path.read_text()) == s


def example_score() -> ScoreRecord:
    return score_prediction(
        RECORD, "predictions/2026/99-example-grand-prix.json", RESULT, [], PRIORS, CHAOS, AT
    )


def test_the_committed_example_is_what_the_scorer_writes():
    """contracts/score-record.example.json is read by the site's tests (web/)."""
    s = example_score()
    example = json.loads((CONTRACTS / "score-record.example.json").read_text())
    assert example == s.model_dump(mode="json"), (
        "regenerate with: cd pipeline && uv run python tests/test_score.py"
    )
    for side in ("jev", "grid", "form"):
        assert set(example["scores"][side]) == {
            "podium_brier",
            "winner_log_loss",
            "winner_hit",
            "podium_pick",
            "podium_hits",
            "chaos_error",
        }


if __name__ == "__main__":
    out = CONTRACTS / "score-record.example.json"
    out.write_text(json.dumps(example_score().model_dump(mode="json"), indent=2) + "\n")
    print(f"wrote {out}")
