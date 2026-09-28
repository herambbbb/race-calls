// How dark the scrim is behind any text laid over a painting, and the paint ramp it
// must hold against. palette.test.ts checks every text colour over this scrim on the
// brightest paint, so a lighter scrim or a brighter ramp that breaks AA fails there.
export const TEXT_SCRIM = 0.82

/** Night blue to chrome yellow, dark to light: the colours a painting may use. */
export const RAMP = ['#0a1733', '#10275a', '#17388a', '#1f4fa3', '#2c68bd', '#4a8fd4', '#78b4e4', '#b9d3c9', '#e5cf78', '#f5c542', '#fde8a0']

const ink = (a: number) => `rgb(7 13 28 / ${a})`

/** Wide screens: the copy column on the left is covered, the art on the right is not. */
export const SCRIM_WIDE = `linear-gradient(90deg, ${ink(0.92)} 0%, ${ink(TEXT_SCRIM)} 46%, ${ink(0.1)} 72%)`

/** Phones: the copy at the top and the card at the bottom are covered; the road strip between breathes. */
export const SCRIM_NARROW = `linear-gradient(180deg, ${ink(0.88)} 0%, ${ink(TEXT_SCRIM)} 58%, ${ink(0.5)} 70%, ${ink(TEXT_SCRIM)} 80%)`
