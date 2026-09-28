// The palette's contrast, measured from the tokens in index.css (WCAG 2.2 relative
// luminance). A palette change that breaks AA fails here, not in a screenshot.
/// <reference types="node" />
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { BACKDROP } from '../components/art/backdropTones'
import { RAMP, TEXT_SCRIM } from '../components/art/painting/scrim'
import { teamColour } from './teams'

// Read from disk: Vitest stubs CSS imports, even as raw text.
const css = readFileSync(new URL('../index.css', import.meta.url), 'utf8')

const token = (name: string): string => {
  const m = new RegExp(`--color-${name}:\\s*(#[0-9a-fA-F]{6})`).exec(css)
  if (!m) throw new Error(`No --color-${name} token`)
  return m[1]!
}

function luminance(hex: string): number {
  const [r, g, b] = [1, 3, 5].map((i) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
  })
  return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!
}

function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x)
  return (hi! + 0.05) / (lo! + 0.05)
}

const DARK_SURFACES = ['ink', 'panel', 'raised']
const DARK_TEXT = ['text', 'muted', 'star', 'cerulean', 'sector-purple', 'sector-green', 'sector-amber', 'flag-red', 'link']
const PAPER_TEXT = ['print', 'print-muted', 'cobalt']
const TEAMS = ['mclaren', 'red_bull', 'ferrari', 'mercedes', 'aston_martin', 'alpine', 'williams', 'rb', 'sauber', 'audi', 'haas', 'cadillac']

describe('palette contrast (WCAG 2.2 AA)', () => {
  for (const surface of DARK_SURFACES) {
    for (const text of DARK_TEXT) {
      it(`${text} on ${surface} is at least 4.5:1`, () => {
        expect(contrast(token(text), token(surface))).toBeGreaterThanOrEqual(4.5)
      })
    }
  }

  for (const text of PAPER_TEXT) {
    it(`${text} on paper is at least 4.5:1`, () => {
      expect(contrast(token(text), token('paper'))).toBeGreaterThanOrEqual(4.5)
    })
  }

  it('ink text on the star accent (buttons) is at least 4.5:1', () => {
    expect(contrast(token('ink'), token('star'))).toBeGreaterThanOrEqual(4.5)
  })

  it('text on a cobalt surface is at least 4.5:1', () => {
    expect(contrast(token('text'), token('cobalt'))).toBeGreaterThanOrEqual(4.5)
  })

  for (const team of TEAMS) {
    it(`${team} fill is at least 3:1 on the bar track`, () => {
      expect(contrast(teamColour(team), token('raised'))).toBeGreaterThanOrEqual(3)
    })
  }

  // Text over a painting sits on the scrim; check it on the brightest paint there is.
  const blend = (top: string, alpha: number, under: string) =>
    '#' +
    [1, 3, 5]
      .map((i) => Math.round(parseInt(top.slice(i, i + 2), 16) * alpha + parseInt(under.slice(i, i + 2), 16) * (1 - alpha)))
      .map((v) => v.toString(16).padStart(2, '0'))
      .join('')
  for (const text of ['text', 'muted', 'star']) {
    it(`${text} over the scrim on the brightest paint is at least 4.5:1`, () => {
      const worst = RAMP.map((paint) => contrast(token(text), blend(token('ink'), TEXT_SCRIM, paint)))
      expect(Math.min(...worst)).toBeGreaterThanOrEqual(4.5)
    })
  }

  it("the backdrop's brightest point is no lighter than the raised surface", () => {
    // A light square, under the full sheen, inside the full glow.
    const lit = blend('#ffffff', BACKDROP.sheen, BACKDROP.square)
    const brightest = blend(BACKDROP.glow, BACKDROP.glowAlpha, lit)
    expect(luminance(brightest)).toBeLessThanOrEqual(luminance(token('raised')))
  })

  it('the late and miss amber is distinct from the star yellow', () => {
    // Different hue families: amber is noticeably redder than the accent.
    const hue = (hex: string) => {
      const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255) as [number, number, number]
      const max = Math.max(r, g, b)
      const min = Math.min(r, g, b)
      const d = max - min
      const h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4
      return (h * 60 + 360) % 360
    }
    expect(hue(token('star')) - hue(token('sector-amber'))).toBeGreaterThanOrEqual(12)
  })
})
