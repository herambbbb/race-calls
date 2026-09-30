// The technical views: every scored race with each side's measures and Jev's own
// consistency checks, and every call Jev made next to what really happened. Callers pass
// only the races that count on their page (live or backtest, never both).
import { levelWord, podiumPick } from './record'
import { CONTENDERS, type Contender, type ContenderScore, type ScoreRecord } from './scores'
import { leaderboard, podiumPairs, reliability, type Standing } from './season'
import type { SlimRecord } from './types'

export interface ScoredRace {
  record: SlimRecord
  score: ScoreRecord
}

/** The rubric's one-word names, used when the record carries no rubric of its own. */
export const CHAOS_WORDS = ['calm', 'lively', 'eventful', 'chaotic', 'bedlam'] as const

export interface TechnicalRace {
  season: number
  round: number
  race_name: string
  scores: Record<Contender, ContenderScore>
  /** Jev's podium chances added up; the true total is 3. */
  podium_sum: number | null
  /** Drivers Jev gave a higher win chance than podium chance (which cannot happen). */
  win_above_podium: number | null
  /** Jev's stated confidence in its winner pick. */
  winner_confidence: number | null
}

function mean(values: number[]): number | null {
  return values.length ? values.reduce((a, b) => a + b, 0) / values.length : null
}

export function technicalRace({ record, score }: ScoredRace): TechnicalRace {
  const calls = record.calls
  const podium = calls?.podium ?? {}
  const win = calls?.winner.probabilities ?? {}
  return {
    season: record.season,
    round: record.round,
    race_name: record.race_name,
    scores: score.scores,
    podium_sum: calls ? Object.values(podium).reduce((a, b) => a + b, 0) : null,
    win_above_podium: calls
      ? Object.entries(win).filter(([code, w]) => podium[code] !== undefined && w > podium[code]).length
      : null,
    winner_confidence: calls?.winner.confidence ?? null,
  }
}

/**
 * Podium expected calibration error: the count-weighted mean gap between the chance
 * said and how often it happened, over the same ten bins as the reliability chart.
 */
export function podiumEce(pairs: [number, boolean][]): number | null {
  if (!pairs.length) return null
  const gaps = reliability(pairs).reduce(
    (a, b) => (b.mean_predicted === null || b.observed === null ? a : a + b.count * Math.abs(b.mean_predicted - b.observed)),
    0,
  )
  return gaps / pairs.length
}

export interface TechnicalSummary {
  races: TechnicalRace[]
  /** Means per side, hits as totals: the leaderboard over the same races. */
  standings: Standing[]
  podium_sum: number | null
  win_above_podium: number | null
  winner_confidence: number | null
  ece: number | null
  /** How many podium chances the calibration error is over. */
  podium_calls: number
}

export function technical(scored: ScoredRace[]): TechnicalSummary {
  const races = scored.map(technicalRace)
  const pairs = scored.flatMap(({ record, score }) => podiumPairs(record, score))
  const jev = (pick: (r: TechnicalRace) => number | null) =>
    mean(races.flatMap((r) => {
      const v = pick(r)
      return v === null ? [] : [v]
    }))
  return {
    races,
    standings: leaderboard(scored.map((s) => s.score)),
    podium_sum: jev((r) => r.podium_sum),
    win_above_podium: jev((r) => r.win_above_podium),
    winner_confidence: jev((r) => r.winner_confidence),
    ece: podiumEce(pairs),
    podium_calls: pairs.length,
  }
}

/**
 * The sides that share the best value, judged on the figures as shown; none if fewer
 * than two sides have a value or all of them tie. The same rule as the leaderboard.
 */
export function bestSides(
  values: Record<Contender, number | null>,
  better: 'lower' | 'higher',
  show: (v: number) => string,
): Set<Contender> {
  const present = CONTENDERS.flatMap((c) => {
    const v = values[c]
    return v === null ? [] : [[c, v] as const]
  })
  if (present.length < 2) return new Set()
  const target = better === 'lower' ? Math.min(...present.map(([, v]) => v)) : Math.max(...present.map(([, v]) => v))
  const top = present.filter(([, v]) => show(v) === show(target)).map(([c]) => c)
  return new Set(top.length === present.length ? [] : top)
}

export interface Chance {
  code: string
  /** The chance Jev gave; null if Jev gave this driver none. */
  p: number | null
}

export interface CallsVsReal {
  season: number
  round: number
  race_name: string
  podium: {
    /** The real top three, in finishing order. */
    actual: Chance[]
    /** Jev's three podium picks, most likely first. */
    picks: (Chance & { made: boolean })[]
  }
  winner: { actual: Chance; pick: Chance; hit: boolean }
  chaos: {
    actual: number
    word: string
    reason: string
    /** Jev's score on the 0 to 4 scale. */
    called: number | null
    /** The chance Jev put on the level that happened; null if not recorded. */
    on_actual: number | null
  }
}

export function callsVsReal({ record, score }: ScoredRace): CallsVsReal {
  const podium = record.calls?.podium ?? {}
  const win = record.calls?.winner.probabilities ?? {}
  const top3 = new Set(score.result.podium)
  const choice = record.calls?.winner.choice ?? ''
  const criteria = record.request?.questions.chaos.criteria ?? []
  const actual = score.chaos.actual
  return {
    season: record.season,
    round: record.round,
    race_name: record.race_name,
    podium: {
      actual: score.result.podium.map((code) => ({ code, p: podium[code] ?? null })),
      picks: podiumPick(podium).map(([code, p]) => ({ code, p, made: top3.has(code) })),
    },
    winner: {
      actual: { code: score.result.winner, p: win[score.result.winner] ?? null },
      pick: { code: choice, p: win[choice] ?? null },
      hit: score.scores.jev.winner_hit,
    },
    chaos: {
      actual,
      word: levelWord(criteria, actual) ?? CHAOS_WORDS[actual] ?? '',
      reason: score.chaos.reason,
      called: record.calls?.chaos.score ?? null,
      on_actual: record.chaos_levels?.[String(actual)] ?? null,
    },
  }
}
