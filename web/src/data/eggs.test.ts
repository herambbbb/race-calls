import { describe, expect, it } from 'vitest'
import { EGGS, listensTo, loadFound, loadKeysOn, pitStopTime, pressKey, RADIO, radioFor, saveFound, saveKeysOn, type EggId } from './eggs'

const type = (keys: string[]) => {
  let buffer: string[] = []
  const eggs: (EggId | null)[] = []
  for (const k of keys) {
    const r = pressKey(buffer, k)
    buffer = r.buffer
    eggs.push(r.egg)
  }
  return eggs.filter(Boolean)
}

describe('pressKey', () => {
  it('finds a sequence at the end of what was typed, in any case', () => {
    expect(type(['x', 'B', 'o', 'X'])).toEqual(['box'])
    expect(type(['d', 'r', 's'])).toEqual(['drs'])
  })

  it('needs the whole sequence in order', () => {
    expect(type(['b', 'x', 'o'])).toEqual([])
    expect(type(['d', 'x', 'r', 's'])).toEqual([])
  })

  it('knows the old cheat code', () => {
    const konami = ['ArrowUp', 'ArrowUp', 'ArrowDown', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'ArrowLeft', 'ArrowRight', 'b', 'a']
    expect(type(konami)).toEqual(['safety'])
  })

  it('starts fresh after a match', () => {
    expect(type(['b', 'o', 'x', 'o', 'x'])).toEqual(['box'])
  })
})

describe('the radio', () => {
  it('always returns a message, for any index', () => {
    expect(radioFor(0)).toBe(RADIO[0])
    expect(radioFor(RADIO.length)).toBe(RADIO[0])
    expect(radioFor(-1)).toBe(RADIO[RADIO.length - 1])
  })

  it('never names the series, and uses no dashes', () => {
    const all = RADIO.flat().map((m) => m.line).join(' ')
    expect(all).not.toMatch(/\bF1\b|Formula 1/)
    expect(all).not.toMatch(/[\u2013\u2014]/)
  })
})

describe('pitStopTime', () => {
  it('stays between 1.80 and 2.65 seconds', () => {
    expect(pitStopTime(0)).toBe(1.8)
    expect(pitStopTime(1)).toBe(2.65)
    expect(pitStopTime(0.5)).toBeGreaterThan(1.8)
  })
})

describe('found secrets', () => {
  it('round-trips, and ignores anything unknown or broken', () => {
    const store = new Map<string, string>()
    const storage = { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, v) }
    saveFound(storage, new Set<EggId>(['box', 'radio']))
    expect([...loadFound(storage)].sort()).toEqual(['box', 'radio'])
    store.set('race-calls:secrets', '["box","nonsense"]')
    expect([...loadFound(storage)]).toEqual(['box'])
    store.set('race-calls:secrets', '{not json')
    expect(loadFound(storage).size).toBe(0)
    expect(EGGS).toHaveLength(6)
  })
})

describe('listensTo', () => {
  const press = { key: 't', repeat: false, isComposing: false, metaKey: false, ctrlKey: false, altKey: false, inField: false }
  it('takes a plain key press', () => {
    expect(listensTo(press)).toBe(true)
  })
  it('ignores held keys, composition, chords, and typing in fields', () => {
    for (const k of ['repeat', 'isComposing', 'metaKey', 'ctrlKey', 'altKey', 'inField'] as const) {
      expect(listensTo({ ...press, [k]: true })).toBe(false)
    }
  })
})

describe('keyboard secrets switch', () => {
  it('is on by default and remembers being turned off', () => {
    const store = new Map<string, string>()
    const storage = { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, v) }
    expect(loadKeysOn(storage)).toBe(true)
    saveKeysOn(storage, false)
    expect(loadKeysOn(storage)).toBe(false)
    saveKeysOn(storage, true)
    expect(loadKeysOn(storage)).toBe(true)
  })
})
