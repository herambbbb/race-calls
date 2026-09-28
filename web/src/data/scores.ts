// The score record the post-race job commits to scores/<season>/<round>-<slug>.json
// (task 3.2). Proposed shape: the site reads exactly these fields, and a record that
// does not match is skipped, so the race simply shows as not scored yet.
import type { Kind } from './types'

/** The three sides scored on the same race: Jev and the two baselines. */
export type Contender = 'jev' | 'grid' | 'form'
export const CONTENDERS: readonly Contender[] = ['jev', 'grid', 'form']

export interface ContenderScore {
  /** Mean over drivers of (p - y)^2; 0 is perfect. */
  podium_brier: number
  /** -ln p(actual winner), floored; lower is better. */
  winner_log_loss: number
  winner_hit: boolean
  /** The three drivers this side called for the podium, most likely first. */
  podium_pick: string[]
  /** How many of podium_pick finished in the top three, 0 to 3. */
  podium_hits: number
  /** |called - actual| on the 0 to 4 rubric; null if this side makes no chaos call. */
  chaos_error: number | null
}

export interface ScoreRecord {
  season: number
  round: number
  kind: Kind
  scored_at: string
  result: {
    winner: string
    /** Codes in finishing order, P1 to P3. */
    podium: string[]
    /** Driver code to classification text: "1" to "22", "R" retired, "D" disqualified. */
    finish: Record<string, string>
  }
  chaos: {
    /** The actual level, 0 to 4, from the rubric. */
    actual: number
    /** Plain words, e.g. "red flag on lap 12". */
    reason: string
  }
  scores: Record<Contender, ContenderScore>
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isContenderScore(value: unknown): value is ContenderScore {
  return (
    isObject(value) &&
    typeof value.podium_brier === 'number' &&
    typeof value.winner_log_loss === 'number' &&
    typeof value.winner_hit === 'boolean' &&
    Array.isArray(value.podium_pick) &&
    typeof value.podium_hits === 'number' &&
    (value.chaos_error === null || typeof value.chaos_error === 'number')
  )
}

export function isScoreRecord(value: unknown): value is ScoreRecord {
  if (!isObject(value)) return false
  const { season, round, kind, scored_at, result, chaos, scores } = value
  return (
    Number.isInteger(season) &&
    Number.isInteger(round) &&
    (kind === 'live' || kind === 'backtest') &&
    typeof scored_at === 'string' &&
    isObject(result) &&
    typeof result.winner === 'string' &&
    Array.isArray(result.podium) &&
    isObject(result.finish) &&
    isObject(chaos) &&
    typeof chaos.actual === 'number' &&
    typeof chaos.reason === 'string' &&
    isObject(scores) &&
    CONTENDERS.every((c) => isContenderScore(scores[c]))
  )
}

export function parseScores(modules: Record<string, unknown>): ScoreRecord[] {
  const out: ScoreRecord[] = []
  for (const [file, data] of Object.entries(modules)) {
    if (isScoreRecord(data)) out.push(data)
    else console.warn(`Skipping ${file}: not a score record this site can read`)
  }
  return out
}
