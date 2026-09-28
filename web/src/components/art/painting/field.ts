// The maths behind the painted art, kept free of the DOM so it can be tested: a seeded
// random source, smooth value noise, and a flow field made of vortices plus a drift.
// Brushstrokes follow the field; their colour follows how close they are to a vortex.

/** mulberry32: small, fast, and the same sequence for the same seed. */
export function random(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** Smooth 2D value noise in [-1, 1], from a seeded lattice. */
export function noise2(seed: number): (x: number, y: number) => number {
  const rand = random(seed)
  const SIZE = 256
  const lattice = Float32Array.from({ length: SIZE * SIZE }, () => rand() * 2 - 1)
  const at = (i: number, j: number) => lattice[((j & (SIZE - 1)) * SIZE + (i & (SIZE - 1))) | 0]!
  const fade = (t: number) => t * t * (3 - 2 * t)
  return (x, y) => {
    const i = Math.floor(x)
    const j = Math.floor(y)
    const u = fade(x - i)
    const v = fade(y - j)
    const a = at(i, j) + (at(i + 1, j) - at(i, j)) * u
    const b = at(i, j + 1) + (at(i + 1, j + 1) - at(i, j + 1)) * u
    return a + (b - a) * v
  }
}

export interface Vortex {
  /** Centre, as a fraction of the width and height. */
  x: number
  y: number
  /** Radius of influence, as a fraction of the shorter side. */
  r: number
  /** Swirl strength; the sign sets the direction of turn. */
  spin: number
  /** How much light it gives off, 0 to 1: the eye of a swirl, or a star. */
  glow: number
}

export interface FieldParams {
  vortices: Vortex[]
  /** The general direction the paint flows, in radians. */
  drift: number
  /** Strength of the drift relative to the vortices. */
  driftStrength: number
  /** How much noise bends the flow, in radians. */
  wobble: number
  /** Noise scale: larger is finer turbulence. */
  grain: number
}

export interface Field {
  /** The flow direction at a point, in radians. */
  angle(x: number, y: number): number
  /** The light at a point, 0 to 1. */
  light(x: number, y: number): number
}

/** A field over a width by height canvas. */
export function makeField(params: FieldParams, width: number, height: number, seed: number): Field {
  const n = noise2(seed)
  const unit = Math.min(width, height)
  const vs = params.vortices.map((v) => ({ cx: v.x * width, cy: v.y * height, r: v.r * unit, spin: v.spin, glow: v.glow }))
  const scale = params.grain / unit
  return {
    angle(x, y) {
      let fx = Math.cos(params.drift) * params.driftStrength
      let fy = Math.sin(params.drift) * params.driftStrength
      for (const v of vs) {
        const dx = x - v.cx
        const dy = y - v.cy
        const d = Math.hypot(dx, dy) || 1
        const fall = 1 / (1 + (d / v.r) ** 2)
        // Tangential swirl, with a slight pull inward so strokes spiral.
        fx += (-dy / d) * v.spin * fall - (dx / d) * Math.abs(v.spin) * 0.18 * fall
        fy += (dx / d) * v.spin * fall - (dy / d) * Math.abs(v.spin) * 0.18 * fall
      }
      return Math.atan2(fy, fx) + n(x * scale, y * scale) * params.wobble
    },
    light(x, y) {
      let l = 0
      for (const v of vs) {
        const d = Math.hypot(x - v.cx, y - v.cy)
        l += v.glow / (1 + (d / (v.r * 0.75)) ** 2)
      }
      return Math.min(1, l)
    },
  }
}

/** The painting presets: a night sky, one great storm, and chaos from 0 to 4. */
export type Preset = { kind: 'sky' } | { kind: 'storm' } | { kind: 'chaos'; level: number }

export function presetParams(preset: Preset, seed: number): FieldParams {
  const rand = random(seed ^ 0x9e3779b9)
  if (preset.kind === 'sky') {
    // A moon, one great swirl, a smaller one, and a scatter of stars.
    const stars: Vortex[] = Array.from({ length: 9 }, () => ({
      x: 0.04 + rand() * 0.92,
      y: 0.04 + rand() * 0.6,
      r: 0.045 + rand() * 0.035,
      spin: 1.5 * (rand() > 0.5 ? 1 : -1),
      glow: 1,
    }))
    return {
      vortices: [
        { x: 0.88, y: 0.14, r: 0.1, spin: 1.1, glow: 1 },
        { x: 0.52, y: 0.5, r: 0.34, spin: 2.2, glow: 0.6 },
        { x: 0.2, y: 0.28, r: 0.17, spin: -1.6, glow: 0.5 },
        ...stars,
      ],
      drift: 0.15,
      driftStrength: 0.9,
      wobble: 0.55,
      grain: 3.2,
    }
  }
  if (preset.kind === 'storm') {
    return {
      vortices: [
        { x: 0.5, y: 0.5, r: 0.55, spin: 3, glow: 0.8 },
        { x: 0.16, y: 0.2, r: 0.07, spin: 1.5, glow: 0.8 },
        { x: 0.86, y: 0.78, r: 0.06, spin: -1.5, glow: 0.8 },
      ],
      drift: 0,
      driftStrength: 0.25,
      wobble: 0.4,
      grain: 2.6,
    }
  }
  return chaosParams(preset.level, rand)
}

/**
 * Chaos on the 0 to 4 rubric as paint. 0: long, near-parallel strokes and one slow
 * drift. 2: eddies appear. 4: several tight vortices and broken strokes. Values between
 * levels interpolate.
 */
export function chaosParams(level: number, rand: () => number): FieldParams {
  const t = Math.max(0, Math.min(4, level)) / 4
  const count = Math.round(t * 5)
  const vortices: Vortex[] = Array.from({ length: count }, (_, i) => ({
    x: 0.15 + rand() * 0.7,
    y: 0.15 + rand() * 0.7,
    r: 0.34 - t * 0.18 + rand() * 0.08,
    spin: (0.8 + t * 2.6) * (i % 2 ? -1 : 1),
    glow: 0.35 + t * 0.4,
  }))
  // A still moon in the corner: light without swirl, so even a calm race has a glow.
  const moon: Vortex = { x: 0.84, y: 0.22, r: 0.16, spin: 0, glow: 0.85 }
  return {
    vortices: [moon, ...vortices],
    drift: -0.12,
    driftStrength: 1.4 - t * 1.1,
    wobble: 0.2 + t * 0.9,
    grain: 1.6 + t * 3.5,
  }
}

/** Stroke length multiplier for a preset: calm paint runs long, chaos breaks it up. */
export function strokeLength(preset: Preset): number {
  return preset.kind === 'chaos' ? 1.5 - (Math.max(0, Math.min(4, preset.level)) / 4) * 0.8 : 1
}
