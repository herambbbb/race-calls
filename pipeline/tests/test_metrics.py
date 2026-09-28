import math

import pytest

from race_calls.metrics import (
    LOG_FLOOR,
    brier,
    ece,
    log_loss,
    mean_brier,
    reliability,
    top1,
    top_pick,
)


def test_brier_by_hand():
    assert brier(0.8, True) == pytest.approx(0.04)
    assert brier(0.8, False) == pytest.approx(0.64)
    assert mean_brier([(0.8, True), (0.8, False)]) == pytest.approx(0.34)


def test_mean_brier_refuses_nothing():
    with pytest.raises(ValueError):
        mean_brier([])


def test_log_loss_floors_a_missing_or_zero_winner():
    assert log_loss({"VER": 0.5, "NOR": 0.5}, "VER") == pytest.approx(math.log(2))
    assert log_loss({"VER": 1.0}, "NOR") == pytest.approx(-math.log(LOG_FLOOR))


def test_top_pick_breaks_ties_by_code_not_dict_order():
    assert top_pick({"VER": 0.4, "NOR": 0.4, "LEC": 0.2}) == "NOR"
    assert top_pick({"NOR": 0.4, "VER": 0.4}) == "NOR"
    assert top1({"VER": 0.6, "NOR": 0.4}, "VER")


def test_reliability_keeps_and_flags_sparse_bins():
    pairs = [(0.05, False)] * 12 + [(0.95, True), (1.0, True)]
    bins = reliability(pairs)
    assert len(bins) == 10
    assert bins[0].count == 12 and not bins[0].low_sample
    assert bins[9].count == 2 and bins[9].low_sample and bins[9].observed == 1.0
    assert bins[5].count == 0 and bins[5].mean_predicted is None


def test_ece_is_the_weighted_gap():
    pairs = [(0.25, True), (0.25, False)]  # predicted 0.25, observed 0.5
    assert ece(pairs) == pytest.approx(0.25)
    assert ece([]) == 0.0
