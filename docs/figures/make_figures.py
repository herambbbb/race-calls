"""Draws the documentation figures from the committed records.

Reads predictions/ and scores/ (nothing else, no network) and writes PNGs to
docs/images/. Rerun after new races are scored:

    uv run --no-project --with matplotlib python docs/figures/make_figures.py

Colours: the first three slots of the reference categorical palette (validated for
all pairs on the light surface: worst CVD delta E 9.2, normal-vision 24.0). The aqua
slot is under 3:1 contrast, so every series also has its own marker shape and a
direct label, and each figure has a data table next to it in the docs.
"""

import json
from pathlib import Path

import matplotlib

matplotlib.use("Agg")
import matplotlib.pyplot as plt  # noqa: E402

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / "docs" / "images"

SURFACE = "#fcfcfb"
TEXT = "#0b0b0b"
TEXT_2 = "#52514e"
GRID = "#e4e3df"
SERIES = {
    "jev": ("Jev", "#2a78d6", "o"),
    "grid": ("Grid baseline", "#eb6834", "s"),
    "form": ("Form baseline", "#1baf7a", "D"),
}

plt.rcParams.update(
    {
        "figure.facecolor": SURFACE,
        "axes.facecolor": SURFACE,
        "axes.edgecolor": GRID,
        "axes.labelcolor": TEXT_2,
        "xtick.color": TEXT_2,
        "ytick.color": TEXT_2,
        "text.color": TEXT,
        "font.size": 10,
        "axes.spines.top": False,
        "axes.spines.right": False,
        "savefig.dpi": 160,
    }
)


def load(kind: str) -> list[tuple[dict, dict]]:
    """(prediction, score) pairs for every scored record of this kind, by round."""
    folder = "backtest" if kind == "backtest" else "2026"
    pairs = []
    for path in sorted((ROOT / "scores" / folder).glob("*.json")):
        score = json.loads(path.read_text())
        prediction = json.loads((ROOT / score["prediction"]).read_text())
        pairs.append((prediction, score))
    return pairs


def short(race_name: str) -> str:
    return race_name.replace(" Grand Prix", "")


def recessive(ax) -> None:
    ax.grid(axis="x", color=GRID, linewidth=0.8)
    ax.set_axisbelow(True)
    ax.tick_params(length=0)


def brier_by_race(pairs) -> None:
    fig, ax = plt.subplots(figsize=(8.5, 6.2))
    rows = list(reversed(pairs))  # round 1 at the top
    labels = [f"R{p['round']}  {short(p['race_name'])}" for p, _ in rows]
    for offset, (key, (name, colour, marker)) in zip((0.22, 0.0, -0.22), SERIES.items()):
        xs = [s["scores"][key]["podium_brier"] for _, s in rows]
        ys = [i + offset for i in range(len(rows))]
        ax.scatter(xs, ys, s=64, color=colour, marker=marker, label=name, zorder=3,
                   edgecolors=SURFACE, linewidths=1.5)
    ax.set_yticks(range(len(rows)), labels)
    ax.set_xlabel("Podium Brier score for the race (lower is better)")
    ax.set_xlim(left=0)
    recessive(ax)
    # Above the plot, so it never sits on a data point; shapes keep series apart without colour.
    ax.legend(loc="lower left", bbox_to_anchor=(0, 1.0), ncol=3, frameon=False, fontsize=9)
    ax.set_title("Podium Brier by race, 14 backtests", loc="left", fontsize=13, pad=28)
    fig.text(0.01, 0.01, "Backtests: the model may have seen these results. "
             "Source: scores/backtest/*.json", fontsize=8, color=TEXT_2)
    fig.tight_layout(rect=(0, 0.03, 1, 1))
    fig.savefig(OUT / "fig-brier-by-race.png")
    plt.close(fig)


def chaos_called_vs_actual(pairs) -> None:
    fig, ax = plt.subplots(figsize=(11, 6.2))
    rows = list(reversed(pairs))
    blue_dark = "#1f5ea8"
    for i, (p, s) in enumerate(rows):
        called = p["calls"]["chaos"]["score"]
        actual = s["chaos"]["actual"]
        ax.plot([called, actual], [i, i], color=GRID, linewidth=2, zorder=1)
        last = i == len(rows) - 1
        ax.scatter([called], [i], s=64, facecolors=SURFACE, edgecolors=blue_dark,
                   linewidths=2, zorder=3, label="Jev's call" if last else None)
        ax.scatter([actual], [i], s=64, color=blue_dark, zorder=3,
                   label="Actual level" if last else None)
    ax.set_yticks(range(len(rows)), [f"R{p['round']}  {short(p['race_name'])}" for p, _ in rows])
    ax.set_xticks(range(5), ["0 calm", "1 lively", "2 eventful", "3 chaotic", "4 bedlam"])
    ax.set_xlim(-0.2, 4.2)
    ax.set_ylim(-0.6, len(rows) - 0.4)
    recessive(ax)
    # The reason for each actual level, as a right-hand axis so the layout sizes itself.
    why = ax.twinx()
    why.set_ylim(ax.get_ylim())
    why.set_yticks(range(len(rows)), [s["chaos"]["reason"] for _, s in rows], fontsize=8.5)
    why.tick_params(length=0, colors=TEXT_2)
    for side in ("top", "right", "left", "bottom"):
        why.spines[side].set_visible(False)
    ax.legend(loc="lower left", bbox_to_anchor=(0, 1.0), ncol=2, frameon=False, fontsize=9)
    ax.set_title("Chaos: Jev's call against the actual level (right: why)", loc="left",
                 fontsize=13, pad=28)
    fig.tight_layout()
    fig.savefig(OUT / "fig-chaos.png")
    plt.close(fig)


def winner_confidence(pairs) -> None:
    fig, ax = plt.subplots(figsize=(8.5, 6.2))
    rows = list(reversed(pairs))
    colour = SERIES["jev"][1]
    for i, (p, s) in enumerate(rows):
        pick = p["calls"]["winner"]["choice"]
        prob = p["calls"]["winner"]["probabilities"][pick]
        hit = s["scores"]["jev"]["winner_hit"]
        ax.barh(i, prob, height=0.55, color=colour if hit else SURFACE, edgecolor=colour,
                linewidth=1.5, hatch=None if hit else "////", zorder=2)
        verdict = "won" if hit else f"lost, {s['result']['winner']} won"
        ax.annotate(f"{pick} {prob:.0%}  ({verdict})", (prob, i), xytext=(6, 0),
                    textcoords="offset points", va="center", fontsize=8.5, color=TEXT)
    ax.axvline(0.54, color=TEXT_2, linewidth=1, linestyle=(0, (3, 3)), zorder=1)
    ax.annotate("pole wins 54% of the time\n(2014 to 2025)", (0.54, len(rows) - 0.4),
                xytext=(4, 0), textcoords="offset points", fontsize=8, color=TEXT_2)
    ax.set_yticks(range(len(rows)), [f"R{p['round']}  {short(p['race_name'])}" for p, _ in rows])
    ax.set_xlim(0, 1.25)
    ax.set_xticks([0, 0.25, 0.5, 0.75, 1.0], ["0%", "25%", "50%", "75%", "100%"])
    ax.set_xlabel("Jev's probability on its winner pick (solid: won, hatched: lost)")
    recessive(ax)
    ax.set_title("How sure Jev was of its winner pick", loc="left", fontsize=13, pad=12)
    fig.tight_layout()
    fig.savefig(OUT / "fig-winner-confidence.png")
    plt.close(fig)


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    pairs = load("backtest")
    if not pairs:
        raise SystemExit("no scored backtests found")
    brier_by_race(pairs)
    chaos_called_vs_actual(pairs)
    winner_confidence(pairs)
    print(f"wrote 3 figures from {len(pairs)} scored backtests to {OUT}")


if __name__ == "__main__":
    main()
