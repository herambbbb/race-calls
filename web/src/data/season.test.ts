import { describe, expect, it } from 'vitest'
import example from '../../../contracts/prediction-record.example.json'
import type { CalendarRace } from './calendar'
import { isScoreRecord, type ScoreRecord } from './scores'
import { countedScores, leaderboard, raceStatus, reliability, seasonRows } from './season'
import { slimRecord } from './slim'
import type { LoadedRecord, SlimRecord } from './types'

const record = slimRecord(example) as SlimRecord
const entry: LoadedRecord = { record, path: 'predictions/2026/99-example-grand-prix.json' }
const START = Date.parse(record.race_start)

function score(round: number, jevBrier: number, hit: boolean): ScoreRecord {
  const side = { podium_brier: jevBrier, winner_log_loss: 1, winner_hit: hit, podium_pick: ['NOR', 'VER', 'LEC'], podium_hits: 2, chaos_error: 1 }
  return {
    season: 2026,
    round,
    kind: 'live',
    scored_at: '2026-10-05T03:00:00Z',
    result: { winner: 'VER', podium: ['VER', 'NOR', 'HAM'], finish: {} },
    chaos: { actual: 2, reason: 'One safety car.' },
    scores: { jev: side, grid: { ...side, podium_brier: 0.2, chaos_error: null }, form: side },
  }
}

const race = (round: number): CalendarRace => ({
  season: 2026,
  round,
  slug: `r${round}`,
  race_name: `Race ${round}`,
  circuit_name: 'Circuit',
  locality: 'Town',
  country: 'Land',
  qualifying_start: record.race_start,
  race_start: record.race_start,
  sprint: false,
})

describe('raceStatus', () => {
  it('is upcoming with no record before the start, and no prediction after it', () => {
    expect(raceStatus(undefined, undefined, record.race_start, START - 1)).toBe('upcoming')
    expect(raceStatus(undefined, undefined, record.race_start, START + 1)).toBe('no_prediction')
  })

  it('is called, then scored', () => {
    expect(raceStatus(record, undefined, record.race_start, START + 1)).toBe('predicted')
    expect(raceStatus(record, score(99, 0.1, true), record.race_start, START + 1)).toBe('scored')
  })

  it('keeps a late call late even with a score', () => {
    expect(raceStatus({ ...record, late: true }, score(99, 0.1, true), record.race_start, START + 1)).toBe('late')
  })

  it('reports no prediction and failure from the record', () => {
    expect(raceStatus({ ...record, status: 'no_prediction' }, undefined, record.race_start, START)).toBe('no_prediction')
    expect(raceStatus({ ...record, status: 'failed' }, undefined, record.race_start, START)).toBe('failed')
  })
})

describe('leaderboard', () => {
  it('counts only live, on-time, scored races', () => {
    const late: LoadedRecord = { ...entry, record: { ...record, round: 98, late: true } }
    const rows = seasonRows([entry, late], [score(99, 0.1, true), score(98, 0.3, false)], START + 1, [race(99), race(98), race(97)])
    expect(rows.map((r) => r.status)).toEqual(['scored', 'late', 'no_prediction'])
    const standings = leaderboard(countedScores(rows))
    expect(standings.map((s) => s.races)).toEqual([1, 1, 1])
    expect(standings[0]).toMatchObject({ contender: 'jev', podium_brier: 0.1, winner_hits: 1, podium_hits: 2, chaos_mae: 1 })
    expect(standings[1]?.chaos_mae).toBeNull()
  })

  it('is empty but present before any race counts', () => {
    const standings = leaderboard([])
    expect(standings.map((s) => [s.contender, s.races, s.podium_brier])).toEqual([
      ['jev', 0, null],
      ['grid', 0, null],
      ['form', 0, null],
    ])
  })
})

describe('reliability', () => {
  it('bins calls in tenths, closes the last bin, and flags small bins', () => {
    const pairs: [number, boolean][] = [...Array.from({ length: 10 }, () => [0.05, false] as [number, boolean]), [1, true], [0.72, true]]
    const bins = reliability(pairs)
    expect(bins).toHaveLength(10)
    expect(bins[0]).toMatchObject({ count: 10, observed: 0, low_sample: false })
    expect(bins[7]).toMatchObject({ count: 1, observed: 1, low_sample: true })
    expect(bins[9]).toMatchObject({ count: 1, mean_predicted: 1 })
  })
})

describe('isScoreRecord', () => {
  it('accepts a full score and rejects a partial one', () => {
    expect(isScoreRecord(score(99, 0.1, true))).toBe(true)
    const { form: _form, ...partial } = score(99, 0.1, true).scores
    expect(isScoreRecord({ ...score(99, 0.1, true), scores: partial })).toBe(false)
  })
})
