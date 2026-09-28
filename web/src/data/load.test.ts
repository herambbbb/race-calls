import { describe, expect, it } from 'vitest'
import example from '../../../contracts/prediction-record.example.json'
import { byKind, findRecord, isRecord, parseRecords } from './load'

describe('loader', () => {
  it('accepts the contract example and keeps its repository path', () => {
    expect(isRecord(example)).toBe(true)
    const records = parseRecords({ '../../../predictions/2026/99-example-grand-prix.json': example })
    expect(records).toHaveLength(1)
    expect(records[0]?.path).toBe('predictions/2026/99-example-grand-prix.json')
    expect(findRecord(records, 'live', 99)?.record.race_name).toBe('Example Grand Prix')
  })

  it('rejects an unknown schema_version and keeps the rest', () => {
    const records = parseRecords({
      '../../../predictions/2026/98-future.json': { ...example, round: 98, schema_version: 2 },
      '../../../predictions/2026/99-example-grand-prix.json': example,
      '../../../predictions/2026/97-junk.json': { hello: 'world' },
    })
    expect(records.map((r) => r.record.round)).toEqual([99])
  })

  it('separates live races from backtests by kind', () => {
    const records = parseRecords({
      '../../../predictions/2026/99-example-grand-prix.json': example,
      '../../../predictions/backtest/3-example.json': { ...example, round: 3, kind: 'backtest' },
    })
    expect(byKind(records, 'live').map((r) => r.record.round)).toEqual([99])
    expect(byKind(records, 'backtest').map((r) => r.path)).toEqual(['predictions/backtest/3-example.json'])
    expect(findRecord(records, 'live', 3)).toBeUndefined()
  })

  it('yields an empty list when there are no records', () => {
    expect(parseRecords({})).toEqual([])
  })
})
