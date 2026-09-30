import { describe, expect, it } from 'vitest'
import example from '../../../contracts/prediction-record.example.json'
import scoreExample from '../../../contracts/score-record.example.json'
import type { ContenderScore, ScoreRecord } from './scores'
import { slimRecord } from './slim'
import { bestSides, callsVsReal, podiumEce, technical, technicalRace } from './technical'
import type { SlimRecord } from './types'

const record = slimRecord(example) as SlimRecord
const score = scoreExample as ScoreRecord

// A small race to check by hand: four drivers, one given a higher win chance than
// podium chance (DOO), and a chance for every chaos level.
const side = (s: Partial<ContenderScore>): ContenderScore => ({
  podium_brier: 0.2,
  winner_log_loss: 1.2,
  winner_hit: false,
  podium_pick: ['AAA', 'BEE', 'CEE'],
  podium_hits: 2,
  chaos_error: null,
  ...s,
})
const small: SlimRecord = {
  ...record,
  round: 7,
  race_name: 'Small Grand Prix',
  request: null,
  calls: {
    podium: { AAA: 0.9, BEE: 0.6, CEE: 0.3, DOO: 0.2 },
    winner: { choice: 'AAA', confidence: 0.4, probabilities: { AAA: 0.5, BEE: 0.15, CEE: 0.1, DOO: 0.25 } },
    chaos: { score: 1.5, confidence: 0.6 },
  },
  chaos_levels: { '0': 0.1, '1': 0.2, '2': 0.5, '3': 0.1, '4': 0.1 },
}
const smallScore: ScoreRecord = {
  season: 2026,
  round: 7,
  kind: 'live',
  scored_at: '2026-10-05T03:00:00Z',
  result: { winner: 'BEE', podium: ['BEE', 'AAA', 'DOO'], finish: { BEE: '1', AAA: '2', DOO: '3', CEE: '4' } },
  chaos: { actual: 2, reason: 'one full safety car' },
  scores: {
    jev: side({ podium_brier: 0.1, winner_log_loss: 1.9, chaos_error: 0.5 }),
    grid: side({ podium_brier: 0.3, winner_log_loss: 1.1, winner_hit: true, podium_hits: 3 }),
    form: side({ podium_brier: 0.25 }),
  },
}

describe('technicalRace', () => {
  it('reads the contract examples', () => {
    const r = technicalRace({ record, score })
    expect(r.scores).toBe(score.scores)
    expect(r.podium_sum).toBeCloseTo(1.54)
    expect(r.win_above_podium).toBe(0)
    expect(r.winner_confidence).toBe(0.12)
  })

  it('adds up the podium, counts win above podium, and keeps the pick confidence', () => {
    const r = technicalRace({ record: small, score: smallScore })
    expect(r.podium_sum).toBeCloseTo(2)
    expect(r.win_above_podium).toBe(1)
    expect(r.winner_confidence).toBe(0.4)
  })

  it('has no checks without calls', () => {
    const r = technicalRace({ record: { ...small, calls: null }, score: smallScore })
    expect([r.podium_sum, r.win_above_podium, r.winner_confidence]).toEqual([null, null, null])
  })
})

describe('podiumEce', () => {
  it('is the count-weighted mean gap over the ten bins', () => {
    // Bins: 0.9 said, 1 happened (0.1); 0.6 and 1 (0.4); 0.3 and 0 (0.3); and 0.2 and
    // 0.25 together, 0.225 said and 0.5 happened (0.275, two calls).
    // (0.1 + 0.4 + 0.3 + 2 * 0.275) / 5 = 0.27.
    const pairs: [number, boolean][] = [
      [0.9, true],
      [0.6, true],
      [0.3, false],
      [0.2, true],
      [0.25, false],
    ]
    expect(podiumEce(pairs)).toBeCloseTo(0.27)
  })

  it('is nothing with no calls, and 0 when every band is right', () => {
    expect(podiumEce([])).toBeNull()
    expect(podiumEce([[1, true], [0, false]])).toBe(0)
  })
})

describe('technical', () => {
  const t = technical([
    { record, score },
    { record: small, score: smallScore },
  ])

  it('keeps a row per race, in order', () => {
    expect(t.races.map((r) => r.round)).toEqual([99, 7])
  })

  it('means each measure and totals the hits, per side', () => {
    const [jev, grid, form] = t.standings
    expect(jev!.contender).toBe('jev')
    expect(jev!.podium_brier).toBeCloseTo((0.16633333333333333 + 0.1) / 2)
    expect(jev!.winner_log_loss).toBeCloseTo((0.9942522733438669 + 1.9) / 2)
    expect(jev!.winner_hits).toBe(0)
    expect(jev!.podium_hits).toBe(4)
    expect(jev!.chaos_mae).toBeCloseTo((0.72 + 0.5) / 2)
    expect(grid!.winner_hits).toBe(1)
    expect(grid!.podium_hits).toBe(5)
    expect(grid!.chaos_mae).toBeNull()
    expect(form!.podium_brier).toBeCloseTo((0.3333333333333333 + 0.25) / 2)
  })

  it('means the Jev checks', () => {
    expect(t.podium_sum).toBeCloseTo((1.54 + 2) / 2)
    expect(t.win_above_podium).toBeCloseTo(0.5)
    expect(t.winner_confidence).toBeCloseTo(0.26)
  })

  it('computes the calibration error over every podium chance of both races', () => {
    // Example: NOR 0.61 yes, VER 0.55 yes, LEC 0.38 no. Small: AAA 0.9 yes, BEE 0.6 yes,
    // CEE 0.3 no, DOO 0.2 yes. The 0.6 bin holds 0.61 and 0.6, both yes (0.605 said,
    // gap 0.395); the 0.3 bin holds 0.38 and 0.3, both no (0.34 said, gap 0.34).
    // (0.45 + 2 * 0.34 + 0.1 + 2 * 0.395 + 0.8) / 7 = 2.82 / 7.
    expect(t.podium_calls).toBe(7)
    expect(t.ece).toBeCloseTo(2.82 / 7)
  })

  it('is empty over no races', () => {
    const none = technical([])
    expect(none.races).toEqual([])
    expect(none.ece).toBeNull()
    expect(none.standings.every((s) => s.races === 0)).toBe(true)
  })
})

describe('bestSides', () => {
  const show = (v: number) => v.toFixed(2)
  it('marks the best side, ties as shown, and nothing when all tie or one has a figure', () => {
    expect([...bestSides({ jev: 0.1, grid: 0.2, form: 0.3 }, 'lower', show)]).toEqual(['jev'])
    expect([...bestSides({ jev: 1, grid: 3, form: 3 }, 'higher', show)]).toEqual(['grid', 'form'])
    expect([...bestSides({ jev: 0.101, grid: 0.104, form: 0.3 }, 'lower', show)]).toEqual(['jev', 'grid'])
    expect(bestSides({ jev: 1, grid: 1, form: 1 }, 'higher', show).size).toBe(0)
    expect(bestSides({ jev: 0.5, grid: null, form: null }, 'lower', show).size).toBe(0)
  })
})

describe('callsVsReal', () => {
  it('sets each call beside the real result, from the contract examples', () => {
    const c = callsVsReal({ record, score })
    expect(c.podium.actual).toEqual([
      { code: 'VER', p: 0.55 },
      { code: 'HAM', p: null },
      { code: 'NOR', p: 0.61 },
    ])
    expect(c.podium.picks).toEqual([
      { code: 'NOR', p: 0.61, made: true },
      { code: 'VER', p: 0.55, made: true },
      { code: 'LEC', p: 0.38, made: false },
    ])
    expect(c.winner).toEqual({ actual: { code: 'VER', p: 0.37 }, pick: { code: 'NOR', p: 0.41 }, hit: false })
    expect(c.chaos).toMatchObject({ actual: 2, word: 'eventful', reason: 'a full safety car', called: 1.28 })
  })

  it('reads the chance on the actual chaos level from chaos_levels', () => {
    const c = callsVsReal({ record: small, score: smallScore })
    expect(c.chaos.on_actual).toBe(0.5)
    // No rubric on this record: the word comes from the fixed five.
    expect(c.chaos.word).toBe('eventful')
    expect(c.winner).toEqual({ actual: { code: 'BEE', p: 0.15 }, pick: { code: 'AAA', p: 0.5 }, hit: false })
  })

  it('leaves it not recorded when the record has no chaos_levels', () => {
    expect(record.chaos_levels).toBeUndefined()
    expect(callsVsReal({ record, score }).chaos.on_actual).toBeNull()
    expect(callsVsReal({ record: { ...small, chaos_levels: { '0': 1 } }, score: smallScore }).chaos.on_actual).toBeNull()
  })
})
