// Season views: each race's status, the leaderboard over live races, and the
// reliability table of podium calls. Mirrors the pipeline's metrics (metrics.py):
// ten equal-width bins, and bins under ten predictions are flagged, not hidden.
import { CALENDAR, type CalendarRace } from './calendar'
import { CONTENDERS, type Contender, type ScoreRecord } from './scores'
import type { LoadedRecord, SlimRecord } from './types'

export type RaceStatus = 'upcoming' | 'predicted' | 'scored' | 'late' | 'no_prediction' | 'failed'

export const STATUS_LABEL: Record<RaceStatus, string> = {
  upcoming: 'Upcoming',
  predicted: 'Called',
  scored: 'Scored',
  late: 'Late, not scored',
  no_prediction: 'No prediction',
  failed: 'Failed',
}

/**
 * One record's status. With no record, a race still ahead is upcoming and a race
 * already started never got a call.
 */
export function raceStatus(
  record: SlimRecord | undefined,
  score: ScoreRecord | undefined,
  raceStart: string,
  now: number,
): RaceStatus {
  if (!record) return Date.parse(raceStart) > now ? 'upcoming' : 'no_prediction'
  if (record.status === 'no_prediction') return 'no_prediction'
  if (record.status === 'failed') return 'failed'
  if (record.late) return 'late'
  return score ? 'scored' : 'predicted'
}

export interface SeasonRow {
  race: CalendarRace
  entry: LoadedRecord | undefined
  score: ScoreRecord | undefined
  status: RaceStatus
}

export function seasonRows(
  records: LoadedRecord[],
  scores: ScoreRecord[],
  now: number,
  calendar: CalendarRace[] = CALENDAR,
): SeasonRow[] {
  return calendar.map((race) => {
    const entry = records.find(
      (r) => r.record.kind === 'live' && r.record.season === race.season && r.record.round === race.round,
    )
    const score = scores.find((s) => s.kind === 'live' && s.season === race.season && s.round === race.round)
    return { race, entry, score, status: raceStatus(entry?.record, score, race.race_start, now) }
  })
}

export interface Standing {
  contender: Contender
  races: number
  podium_brier: number | null
  winner_log_loss: number | null
  winner_hits: number
  podium_hits: number
  chaos_mae: number | null
}

function mean(values: number[]): number | null {
  return values.length ? values.reduce((a, b) => a + b, 0) / values.length : null
}

/**
 * Cumulative metrics per side over the given scores. Callers pass only the races that
 * count: live, on time, and scored.
 */
export function leaderboard(scores: ScoreRecord[]): Standing[] {
  return CONTENDERS.map((contender) => {
    const rows = scores.map((s) => s.scores[contender])
    return {
      contender,
      races: rows.length,
      podium_brier: mean(rows.map((r) => r.podium_brier)),
      winner_log_loss: mean(rows.map((r) => r.winner_log_loss)),
      winner_hits: rows.filter((r) => r.winner_hit).length,
      podium_hits: rows.reduce((a, r) => a + r.podium_hits, 0),
      chaos_mae: mean(rows.flatMap((r) => (r.chaos_error === null ? [] : [r.chaos_error]))),
    }
  })
}

/** The races that count: live, called on time, and scored. */
export function countedScores(rows: SeasonRow[]): ScoreRecord[] {
  return rows.flatMap((r) => (r.status === 'scored' && r.score ? [r.score] : []))
}

export const LOW_SAMPLE = 10

export interface Bin {
  lower: number
  upper: number
  count: number
  mean_predicted: number | null
  observed: number | null
  low_sample: boolean
}

/** Podium probability against whether the driver made the podium, one pair per driver. */
export function podiumPairs(record: SlimRecord, score: ScoreRecord): [number, boolean][] {
  const top3 = new Set(score.result.podium)
  return Object.entries(record.calls?.podium ?? {}).map(([code, p]) => [p, top3.has(code)])
}

/** The bin for a probability, as the pipeline does it: clamped, then floored. */
function binOf(p: number, bins: number): number {
  const clamped = Number.isFinite(p) ? Math.min(1, Math.max(0, p)) : 0
  return Math.min(bins - 1, Math.floor(clamped * bins))
}

export function reliability(pairs: [number, boolean][], bins = 10): Bin[] {
  return Array.from({ length: bins }, (_, i) => {
    const lower = i / bins
    const upper = (i + 1) / bins
    const inBin = pairs.filter(([p]) => binOf(p, bins) === i)
    return {
      lower,
      upper,
      count: inBin.length,
      mean_predicted: mean(inBin.map(([p]) => p)),
      observed: mean(inBin.map(([, y]) => (y ? 1 : 0))),
      low_sample: inBin.length < LOW_SAMPLE,
    }
  })
}
