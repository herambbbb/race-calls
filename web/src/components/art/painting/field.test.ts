import { describe, expect, it } from 'vitest'
import { chaosParams, makeField, noise2, presetParams, random, strokeLength } from './field'

describe('random', () => {
  it('gives the same sequence for the same seed, and a different one otherwise', () => {
    const a = random(14)
    const b = random(14)
    const c = random(15)
    const seqA = [a(), a(), a()]
    expect([b(), b(), b()]).toEqual(seqA)
    expect([c(), c(), c()]).not.toEqual(seqA)
    for (const v of seqA) expect(v).toBeGreaterThanOrEqual(0)
    for (const v of seqA) expect(v).toBeLessThan(1)
  })
})

describe('noise2', () => {
  it('is smooth and bounded', () => {
    const n = noise2(3)
    const here = n(10.2, 4.7)
    expect(Math.abs(here)).toBeLessThanOrEqual(1)
    expect(Math.abs(n(10.21, 4.7) - here)).toBeLessThan(0.05)
  })
})

describe('field', () => {
  it('is the same for the same seed', () => {
    const p = presetParams({ kind: 'sky' }, 7)
    const f = makeField(p, 800, 500, 7)
    const g = makeField(presetParams({ kind: 'sky' }, 7), 800, 500, 7)
    expect(f.angle(120, 80)).toBe(g.angle(120, 80))
    expect(f.light(500, 210)).toBe(g.light(500, 210))
  })

  it('is brightest near a vortex eye', () => {
    const f = makeField(presetParams({ kind: 'storm' }, 1), 1000, 1000, 1)
    expect(f.light(500, 500)).toBeGreaterThan(f.light(980, 40))
  })
})

describe('chaos', () => {
  const rand = () => 0.5
  it('adds vortices and turbulence as the level rises', () => {
    const calm = chaosParams(0, rand)
    const bedlam = chaosParams(4, rand)
    const swirling = (p: typeof calm) => p.vortices.filter((v) => v.spin !== 0).length
    expect(swirling(calm)).toBe(0)
    expect(swirling(bedlam)).toBeGreaterThanOrEqual(4)
    expect(bedlam.wobble).toBeGreaterThan(calm.wobble)
    expect(bedlam.driftStrength).toBeLessThan(calm.driftStrength)
  })

  it('interpolates between levels and clamps outside 0 to 4', () => {
    expect(chaosParams(0.92, rand).wobble).toBeGreaterThan(chaosParams(0, rand).wobble)
    expect(chaosParams(0.92, rand).wobble).toBeLessThan(chaosParams(2, rand).wobble)
    expect(chaosParams(9, rand)).toEqual(chaosParams(4, rand))
  })

  it('shortens strokes as chaos rises', () => {
    expect(strokeLength({ kind: 'chaos', level: 4 })).toBeLessThan(strokeLength({ kind: 'chaos', level: 0 }))
  })
})
