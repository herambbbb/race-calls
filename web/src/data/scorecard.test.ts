import { describe, expect, it } from 'vitest'
import { best, METRICS } from './scorecard'
import type { ContenderScore } from './scores'

const side = (podium_brier: number, chaos_error: number | null = null): ContenderScore => ({
  podium_brier,
  winner_log_loss: 1,
  winner_hit: false,
  podium_pick: [],
  podium_hits: 2,
  chaos_error,
})

const brier = METRICS.find((m) => m.label === 'Podium Brier')!
const chaos = METRICS.find((m) => m.label === 'Chaos error')!

describe('best', () => {
  it('marks every side that ties on the figure as shown', () => {
    expect([...best(brier, { jev: side(0.0641), grid: side(0.0644), form: side(0.07) })]).toEqual(['jev', 'grid'])
  })

  it('marks nobody when all sides tie', () => {
    expect(best(brier, { jev: side(0.05), grid: side(0.05), form: side(0.05) }).size).toBe(0)
  })

  it('marks nobody when only one side has a value', () => {
    expect(best(chaos, { jev: side(0.1, 0.5), grid: side(0.1), form: side(0.1) }).size).toBe(0)
  })
})
