// The backdrop's tones, kept where palette.test.ts can check them. Everything the
// backdrop adds is capped so that its brightest possible point (a light square, under
// the sheen, inside a glow) is no lighter than the `raised` surface, which every text
// colour is already tested against. That is what keeps text contrast intact.
export const BACKDROP = {
  /** The lighter chequer square; the darker square is the page ink itself. */
  square: '#0d1730',
  /** Peak opacity of the white metallic sheen. */
  sheen: 0.025,
  /** A cerulean glow and its peak opacity. */
  glow: '#6fb6ee',
  glowAlpha: 0.04,
}
