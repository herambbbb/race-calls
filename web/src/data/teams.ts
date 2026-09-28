// Team colours by Jolpica constructor_id. Used for swatches and bar fills only; text
// stays in the text tokens, so contrast never depends on a team colour. Every fill is
// at least 3:1 against the bar track (--color-raised), for the non-text contrast rule.
const TEAM_COLOURS: Record<string, string> = {
  mclaren: '#ff8000',
  red_bull: '#4781d7',
  ferrari: '#ed1131',
  mercedes: '#27f4d2',
  aston_martin: '#229971',
  alpine: '#ff87bc',
  williams: '#64c4ff',
  rb: '#6c98ff',
  sauber: '#52e252',
  audi: '#ff2d55',
  haas: '#b6babd',
  cadillac: '#e8c547',
}

const NEUTRAL = '#a3a3a8'

export function teamColour(constructorId: string): string {
  return TEAM_COLOURS[constructorId] ?? NEUTRAL
}

/**
 * A team's name for display, without a series name in it: "RB F1 Team" is shown as
 * "RB". Facts Jev was given are shown verbatim and never pass through here.
 */
export function teamName(constructor: string): string {
  return constructor.replace(/\s+F1 Team$/, '').replace(/\s+Formula One Team$/, '')
}
