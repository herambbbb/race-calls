import { describe, expect, it } from 'vitest'
import example from '../../../contracts/prediction-record.example.json'
import { podiumPick, rubricLine } from './record'

describe('podiumPick', () => {
  it('takes the three highest podium probabilities, most likely first', () => {
    expect(podiumPick(example.calls.podium)).toEqual([
      ['NOR', 0.61],
      ['VER', 0.55],
      ['LEC', 0.38],
    ])
  })

  it('breaks ties by driver code, whatever the key order', () => {
    const podium = { VER: 0.5, RUS: 0.3, ALO: 0.3, NOR: 0.5, LEC: 0.1 }
    expect(podiumPick(podium).map(([code]) => code)).toEqual(['NOR', 'VER', 'ALO'])
  })

  it('returns fewer than three when fewer drivers were called', () => {
    expect(podiumPick({ NOR: 0.4 })).toEqual([['NOR', 0.4]])
  })
})

describe('rubricLine', () => {
  it('reads the level and word from a full line and from a bare one', () => {
    expect(rubricLine('1: lively - a virtual safety car, or 3 to 4 retirements.')).toMatchObject({ level: 1, word: 'lively' })
    expect(rubricLine('4: bedlam')).toMatchObject({ level: 4, word: 'bedlam' })
    expect(rubricLine('3: full-on - two or more safety cars.')).toMatchObject({ level: 3, word: 'full-on' })
    expect(rubricLine('no level here')).toMatchObject({ level: null, word: null })
  })
})
