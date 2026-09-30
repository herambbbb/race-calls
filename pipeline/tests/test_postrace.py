from datetime import timedelta

import pytest
import respx
from test_predict import BEFORE, FakeData, client, ok
from test_score import CHAOS, race
from test_snapshot import BAHRAIN, PRIORS, QUALI, build

from race_calls.jev import OPENROUTER_URL
from race_calls.models import ScoreRecord
from race_calls.postrace import SCORE_AFTER, score_weekend, scoring_due
from race_calls.predict import make_prediction, no_prediction_record, write_record
from race_calls.score import NotScorable

RESULT_16 = race(16, [("VER", "1"), ("NOR", "2"), ("PIA", "3")])


class Results(FakeData):
    def __init__(self, result=RESULT_16):
        super().__init__(QUALI)
        self._result = result

    def results(self, season, round):
        return self._result if round == 16 else super().results(season, round)


@pytest.fixture
def dirs(tmp_path):
    return tmp_path / "predictions", tmp_path / "scores"


@pytest.fixture
def predicted(dirs):
    with respx.mock:
        respx.post(OPENROUTER_URL).mock(return_value=ok())
        record = make_prediction(BAHRAIN, build(), QUALI, client(), clock=lambda: BEFORE)
    write_record(dirs[0], BAHRAIN, record)
    return record


def after(hours: float):
    return BAHRAIN.race_start + timedelta(hours=hours)


def test_due_three_hours_after_the_start_and_only_once(dirs, predicted):
    predictions, scores = dirs
    assert scoring_due([BAHRAIN], after(2.9), predictions, scores) == []
    [item] = scoring_due([BAHRAIN], BAHRAIN.race_start + SCORE_AFTER, predictions, scores)
    path = score_weekend(
        Results(),
        lambda w, r: CHAOS,
        item.weekend,
        item.record,
        PRIORS,
        predictions,
        scores,
        after(3),
    )
    assert path == scores / "2026" / "16-bahrain-grand-prix-in-malaysia.json"
    score = ScoreRecord.model_validate_json(path.read_text())
    assert score.prediction == "predictions/2026/16-bahrain-grand-prix-in-malaysia.json"
    assert score.result.winner == "VER" and score.scores["jev"].podium_hits == 3
    assert scoring_due([BAHRAIN], after(4), predictions, scores) == []


def test_waits_for_the_official_result(dirs, predicted):
    predictions, scores = dirs
    [item] = scoring_due([BAHRAIN], after(3), predictions, scores)
    assert (
        score_weekend(
            Results(result=None),
            lambda w, r: CHAOS,
            item.weekend,
            item.record,
            PRIORS,
            predictions,
            scores,
            after(3),
        )
        is None
    )
    assert not scores.exists()


def test_no_prediction_and_late_records_are_never_due(dirs):
    predictions, scores = dirs
    write_record(predictions, BAHRAIN, no_prediction_record(BAHRAIN, after(-0.9)))
    assert scoring_due([BAHRAIN], after(5), predictions, scores) == []


def test_late_record_is_refused_even_if_asked_directly(dirs):
    predictions, scores = dirs
    with respx.mock:
        respx.post(OPENROUTER_URL).mock(return_value=ok())
        late = make_prediction(BAHRAIN, build(), QUALI, client(), clock=lambda: after(0.1))
    assert late.late
    write_record(predictions, BAHRAIN, late)
    assert scoring_due([BAHRAIN], after(5), predictions, scores) == []
    with pytest.raises(NotScorable):
        score_weekend(
            Results(), lambda w, r: CHAOS, BAHRAIN, late, PRIORS, predictions, scores, after(5)
        )
