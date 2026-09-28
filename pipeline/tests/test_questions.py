import pytest

from race_calls.models import DriverFact
from race_calls.questions import (
    CHAOS,
    WINNER,
    AnswerError,
    build_questions,
    parse_calls,
    podium_id,
)
from race_calls.rubric import CHAOS_CRITERIA

DRIVERS = (
    DriverFact(code="NOR", name="Lando Norris", constructor="McLaren", grid=1, line="x"),
    DriverFact(code="VER", name="Max Verstappen", constructor="Red Bull", grid=2, line="y"),
)
CODES = [d.code for d in DRIVERS]


def answers(**overrides):
    base = {
        "podium_NOR": {"type": "noul", "noul": 0.6},
        "podium_VER": {"type": "noul", "noul": 0.5},
        "winner": {
            "type": "choice",
            "choice": "NOR",
            "confidence": 0.1,
            "probabilities": {"NOR": 0.55, "VER": 0.45},
        },
        "chaos": {"type": "score", "score": 1.28, "confidence": 0.7, "legend": {}},
    }
    base.update(overrides)
    return base


def test_one_request_covers_every_driver_and_all_three_kinds():
    questions = build_questions(DRIVERS)
    assert set(questions) == {"podium_NOR", "podium_VER", WINNER, CHAOS}
    assert questions[podium_id("NOR")]["type"] == "noul"
    assert set(questions[WINNER]["criteria"]) == set(CODES)
    assert questions[CHAOS]["criteria"] == list(CHAOS_CRITERIA)


def test_instructions_hold_no_numbers():
    for question in build_questions(DRIVERS).values():
        assert not any(ch.isdigit() for ch in question["instructions"])


def test_duplicate_codes_are_refused():
    with pytest.raises(ValueError, match="duplicate"):
        build_questions((DRIVERS[0], DRIVERS[0]))


def test_parse_keeps_raw_values():
    calls = parse_calls(answers(), CODES)
    assert calls.podium == {"NOR": 0.6, "VER": 0.5}  # not normalised to sum to three
    assert calls.winner.choice == "NOR" and calls.winner.probabilities["VER"] == 0.45
    assert calls.chaos.score == 1.28 and calls.chaos.confidence == 0.7


@pytest.mark.parametrize(
    ("override", "message"),
    [
        ({"podium_VER": None}, "missing"),
        ({"podium_VER": {"type": "noul", "noul": 1.2}}, "outside"),
        ({"podium_VER": {"type": "noul", "noul": True}}, "not a number"),
        (
            {"winner": {"type": "choice", "choice": "HAM", "probabilities": {"NOR": 1.0}}},
            "not on the grid",
        ),
        (
            {"winner": {"type": "choice", "choice": "NOR", "probabilities": {"HAM": 1.0}}},
            "unknown drivers",
        ),
        ({"winner": {"type": "choice", "choice": "NOR"}}, "no probabilities"),
        ({"chaos": {"type": "score", "score": 5}}, "outside the rubric"),
        ({"chaos": {"type": "noul", "noul": 0.5}}, "expected 'score'"),
    ],
)
def test_malformed_answers_fail_clearly(override, message):
    with pytest.raises(AnswerError, match=message):
        parse_calls(answers(**override), CODES)


def test_a_driver_missing_from_the_distribution_counts_as_zero():
    calls = parse_calls(
        answers(winner={"type": "choice", "choice": "NOR", "probabilities": {"NOR": 1.0}}), CODES
    )
    assert calls.winner.probabilities == {"NOR": 1.0, "VER": 0.0}
