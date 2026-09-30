"""The three typed questions, all in one request (design Decision 1), and their answers.

Question ids: "podium_<CODE>" per driver (noul), "winner" (choice over driver codes), and
"chaos" (score on the rubric). Beyond each driver's name and team, and the rubric's fixed
thresholds, the questions carry no facts; every fact lives in the snapshot.
"""

from collections.abc import Mapping, Sequence
from typing import Any

from race_calls.models import Calls, ChaosCall, DriverFact, WinnerCall
from race_calls.rubric import CHAOS_CRITERIA, CHAOS_INSTRUCTIONS, CHAOS_LEVELS

WINNER = "winner"
CHAOS = "chaos"
WINNER_INSTRUCTIONS = "Who will win this race?"


def podium_id(code: str) -> str:
    return f"podium_{code}"


def build_questions(drivers: Sequence[DriverFact]) -> dict[str, dict[str, Any]]:
    codes = [d.code for d in drivers]
    if len(set(codes)) != len(codes):
        raise ValueError(f"duplicate driver codes: {codes}")
    questions: dict[str, dict[str, Any]] = {
        podium_id(d.code): {
            "type": "noul",
            "instructions": f"Will {d.name} ({d.constructor}) finish this race in the top three?",
        }
        for d in drivers
    }
    questions[WINNER] = {
        "type": "choice",
        "instructions": WINNER_INSTRUCTIONS,
        "criteria": {d.code: f"{d.name} ({d.constructor}) wins the race." for d in drivers},
    }
    questions[CHAOS] = {
        "type": "score",
        "instructions": CHAOS_INSTRUCTIONS,
        "criteria": list(CHAOS_CRITERIA),
    }
    return questions


class AnswerError(ValueError):
    """Jev's answers are missing or malformed; the record is saved as failed."""


def _probability(value: Any, where: str) -> float:
    if isinstance(value, bool) or not isinstance(value, int | float):
        raise AnswerError(f"{where}: not a number")
    if not 0.0 <= float(value) <= 1.0:
        raise AnswerError(f"{where}: {value} is outside 0 to 1")
    return float(value)


def _answer(answers: Mapping[str, Any], key: str, kind: str) -> Mapping[str, Any]:
    answer = answers.get(key)
    if not isinstance(answer, Mapping):
        raise AnswerError(f"answer {key!r} is missing")
    if answer.get("type") not in (None, kind):
        raise AnswerError(f"answer {key!r} has type {answer.get('type')!r}, expected {kind!r}")
    return answer


def parse_calls(answers: Mapping[str, Any], codes: Sequence[str]) -> Calls:
    podium = {
        code: _probability(_answer(answers, podium_id(code), "noul").get("noul"), code)
        for code in codes
    }

    winner = _answer(answers, WINNER, "choice")
    raw = winner.get("probabilities")
    if not isinstance(raw, Mapping):
        raise AnswerError("winner answer has no probabilities")
    unknown = set(raw) - set(codes)
    if unknown:
        raise AnswerError(f"winner probabilities name unknown drivers: {sorted(unknown)}")
    probabilities = {code: _probability(raw.get(code, 0.0), f"winner {code}") for code in codes}
    choice = winner.get("choice")
    if choice not in codes:
        raise AnswerError(f"winner choice {choice!r} is not on the grid")

    chaos = _answer(answers, CHAOS, "score")
    score = chaos.get("score")
    if isinstance(score, bool) or not isinstance(score, int | float):
        raise AnswerError("chaos score is not a number")
    if not 0.0 <= float(score) <= CHAOS_LEVELS - 1:
        raise AnswerError(f"chaos score {score} is outside the rubric")

    return Calls(
        podium=podium,
        winner=WinnerCall(
            choice=str(choice),
            confidence=_optional_float(winner.get("confidence")),
            probabilities=probabilities,
        ),
        chaos=ChaosCall(score=float(score), confidence=_optional_float(chaos.get("confidence"))),
    )


def _optional_float(value: Any) -> float | None:
    if isinstance(value, bool) or not isinstance(value, int | float):
        return None
    return float(value)
