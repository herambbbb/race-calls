// Design-preview data, dev only. Outcomes and the Jev and grid-baseline scores are
// real (2026 results from Jolpica, scored with the pipeline's metrics). The form
// baseline, the actual chaos levels, and their reasons are placeholders until the
// scorer (task 3.1 to 3.3) writes real score records.
import { CALENDAR } from '../data/calendar'
import { byKind, RECORDS } from '../data/load'
import type { ContenderScore, ScoreRecord } from '../data/scores'
import type { LoadedRecord, SlimRecord } from '../data/types'
import outcomes from './backtest-outcomes.json'

interface Outcome {
  winner: string
  podium: string[]
  finish: Record<string, string>
  jev: { brier: number; log_loss: number; winner_hit: boolean; podium_hits: number }
  grid: { brier: number; log_loss: number; winner_hit: boolean; podium_hits: number }
}

const OUTCOMES = outcomes as Record<string, Outcome>

const PLACEHOLDER_CHAOS: [number, string][] = [
  [1, 'Placeholder: a virtual safety car on lap 31.'],
  [2, 'Placeholder: one full safety car after a first-lap incident.'],
  [0, 'Placeholder: no safety car, one retirement.'],
  [4, 'Placeholder: red flag on lap 12.'],
]

function contender(o: Outcome['jev'], pick: string[], chaos: number | null): ContenderScore {
  return {
    podium_brier: o.brier,
    winner_log_loss: o.log_loss,
    winner_hit: o.winner_hit,
    podium_pick: pick,
    podium_hits: o.podium_hits,
    chaos_error: chaos,
  }
}

/** A score record for a record, from the real outcome of its backtest round. */
export function sampleScore(record: SlimRecord, outcomeRound = record.round): ScoreRecord | undefined {
  const o = OUTCOMES[String(outcomeRound)]
  const calls = record.calls
  if (!o || !calls) return undefined
  const [actual, reason] = PLACEHOLDER_CHAOS[outcomeRound % PLACEHOLDER_CHAOS.length]!
  const pick = Object.entries(calls.podium)
    .sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1))
    .slice(0, 3)
    .map(([c]) => c)
  const grid = [...(record.drivers ?? [])].sort((a, b) => a.grid - b.grid).slice(0, 3).map((d) => d.code)
  // The form baseline is not built yet: a placeholder a little off the grid baseline.
  const form = { ...o.grid, brier: o.grid.brier * 1.06, log_loss: o.grid.log_loss * 1.1 }
  return {
    season: record.season,
    round: record.round,
    kind: record.kind,
    scored_at: new Date(Date.parse(record.race_start) + 20 * 3_600_000).toISOString(),
    result: { winner: o.winner, podium: o.podium, finish: o.finish },
    chaos: { actual, reason },
    scores: {
      jev: contender(o.jev, pick, Math.abs(calls.chaos.score - actual)),
      grid: contender(o.grid, grid, null),
      form: contender(form, grid, null),
    },
  }
}

export const BACKTESTS = byKind(RECORDS, 'backtest')
export const R14 = BACKTESTS.find((r) => r.record.round === 14)

/** Round 14 dressed as a live race, called the evening before. */
export function asLive(entry: LoadedRecord, patch: Partial<SlimRecord> = {}): LoadedRecord {
  const made = new Date(Date.parse(entry.record.race_start) - 18 * 3_600_000).toISOString()
  return {
    path: entry.path.replace('backtest/', `${entry.record.season}/`),
    record: { ...entry.record, kind: 'live', made_at: made, note: null, ...patch },
  }
}

/**
 * A mid-season picture: backtest rounds 11 to 14 replayed as live rounds 16 to 19, so
 * the leaderboard, calibration, and race list have something to show.
 */
export function midSeason(): { records: LoadedRecord[]; scores: ScoreRecord[]; at: number } {
  const replay = BACKTESTS.filter((r) => r.record.round >= 11 && r.record.round <= 14 && r.record.status === 'ok')
  const records: LoadedRecord[] = []
  const scores: ScoreRecord[] = []
  replay.forEach((entry, i) => {
    const slot = CALENDAR[i]!
    const live = asLive(entry, {
      round: slot.round,
      slug: slot.slug,
      race_name: slot.race_name,
      circuit_name: slot.circuit_name,
      race_start: slot.race_start,
      made_at: new Date(Date.parse(slot.race_start) - 18 * 3_600_000).toISOString(),
      // The third replayed race is late, to show that it is published but not counted.
      late: i === 2,
    })
    records.push(live)
    const s = sampleScore(live.record, entry.record.round)
    if (s) scores.push(s)
  })
  return { records, scores, at: Date.parse('2026-11-05T12:00:00Z') }
}
