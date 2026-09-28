"""Scoring rules for race calls (design Decision 7).

Every function takes plain numbers, so results can be checked by hand and regenerated
from the committed predictions alone.

- Podium Brier: the mean over drivers of (p - y)^2, where y is 1 if the driver finished
  in the top three; 0 is perfect, 1 is certain and wrong on every driver.
- Winner log loss: -ln p(actual winner), with p floored at 1e-6 so one confident miss is
  finite. A winner missing from the distribution counts as p = 0.
- Top-1: the most likely driver won. Ties break by driver code, never by dict order.
- Reliability: predicted podium probabilities against the observed rate, in equal-width
  bins, with bins under 10 predictions flagged as low-sample rather than hidden.
- ECE: the count-weighted mean gap between predicted and observed rate across the bins.
"""

import math
from collections.abc import Iterable, Mapping, Sequence
from dataclasses import dataclass

LOG_FLOOR = 1e-6
LOW_SAMPLE = 10


def brier(p: float, happened: bool) -> float:
    return (p - (1.0 if happened else 0.0)) ** 2


def mean_brier(pairs: Iterable[tuple[float, bool]]) -> float:
    scores = [brier(p, y) for p, y in pairs]
    if not scores:
        raise ValueError("no predictions to score")
    return sum(scores) / len(scores)


def log_loss(probs: Mapping[str, float], actual: str) -> float:
    return -math.log(max(LOG_FLOOR, probs.get(actual, 0.0)))


def top_pick(probs: Mapping[str, float]) -> str:
    if not probs:
        raise ValueError("empty distribution")
    return max(sorted(probs), key=lambda k: probs[k])


def top1(probs: Mapping[str, float], actual: str) -> bool:
    return top_pick(probs) == actual


def _mean(values: Iterable[float]) -> float | None:
    values = list(values)
    return sum(values) / len(values) if values else None


@dataclass(frozen=True)
class Bin:
    lower: float
    upper: float
    mean_predicted: float | None
    observed: float | None
    count: int
    low_sample: bool


def reliability(pairs: Sequence[tuple[float, bool]], bins: int = 10) -> list[Bin]:
    grouped: list[list[tuple[float, bool]]] = [[] for _ in range(bins)]
    for p, y in pairs:
        grouped[min(bins - 1, max(0, int(p * bins)))].append((p, y))
    return [
        Bin(
            lower=i / bins,
            upper=(i + 1) / bins,
            mean_predicted=_mean(p for p, _ in group),
            observed=_mean(1.0 if y else 0.0 for _, y in group),
            count=len(group),
            low_sample=len(group) < LOW_SAMPLE,
        )
        for i, group in enumerate(grouped)
    ]


def ece(pairs: Sequence[tuple[float, bool]], bins: int = 10) -> float:
    total = len(pairs)
    if not total:
        return 0.0
    return sum(
        b.count / total * abs(b.mean_predicted - b.observed)
        for b in reliability(pairs, bins)
        if b.count and b.mean_predicted is not None and b.observed is not None
    )
