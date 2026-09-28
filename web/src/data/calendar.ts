// The live part of the season: the races Jev calls in public. Copied from the Jolpica
// 2026 calendar (rounds 16 to 23); qualifying times are the scheduled starts, and the
// call lands once qualifying data is published, so "after qualifying" is approximate.
export interface CalendarRace {
  season: number
  round: number
  slug: string
  race_name: string
  circuit_name: string
  locality: string
  country: string
  qualifying_start: string
  race_start: string
  sprint: boolean
}

export const SEASON = 2026
export const SEASON_ROUNDS = 23

export const CALENDAR: CalendarRace[] = [
  race(16, 'bahrain-grand-prix', 'Bahrain Grand Prix in Malaysia', 'Sepang International Circuit', 'Kuala Lumpur', 'Malaysia', '2026-10-03T08:00:00Z', '2026-10-04T07:00:00Z'),
  race(17, 'singapore-grand-prix', 'Singapore Grand Prix', 'Marina Bay Street Circuit', 'Marina Bay', 'Singapore', '2026-10-10T13:00:00Z', '2026-10-11T12:00:00Z', true),
  race(18, 'united-states-grand-prix', 'United States Grand Prix', 'Circuit of the Americas', 'Austin', 'USA', '2026-10-24T21:00:00Z', '2026-10-25T20:00:00Z'),
  race(19, 'mexico-city-grand-prix', 'Mexico City Grand Prix', 'Autódromo Hermanos Rodríguez', 'Mexico City', 'Mexico', '2026-10-31T21:00:00Z', '2026-11-01T20:00:00Z'),
  race(20, 'brazilian-grand-prix', 'Brazilian Grand Prix', 'Autódromo José Carlos Pace', 'São Paulo', 'Brazil', '2026-11-07T18:00:00Z', '2026-11-08T17:00:00Z'),
  race(21, 'las-vegas-grand-prix', 'Las Vegas Grand Prix', 'Las Vegas Strip Street Circuit', 'Las Vegas', 'USA', '2026-11-21T04:00:00Z', '2026-11-22T04:00:00Z'),
  race(22, 'qatar-grand-prix', 'Qatar Grand Prix', 'Lusail International Circuit', 'Lusail', 'Qatar', '2026-11-28T18:00:00Z', '2026-11-29T16:00:00Z'),
  race(23, 'abu-dhabi-grand-prix', 'Abu Dhabi Grand Prix', 'Yas Marina Circuit', 'Abu Dhabi', 'UAE', '2026-12-05T14:00:00Z', '2026-12-06T13:00:00Z'),
]

function race(
  round: number,
  slug: string,
  race_name: string,
  circuit_name: string,
  locality: string,
  country: string,
  qualifying_start: string,
  race_start: string,
  sprint = false,
): CalendarRace {
  return { season: SEASON, round, slug, race_name, circuit_name, locality, country, qualifying_start, race_start, sprint }
}

export function calendarRace(round: number): CalendarRace | undefined {
  return CALENDAR.find((r) => r.round === round)
}

/** The first race whose start is still ahead, or undefined once the season is over. */
export function nextRace(now: number, calendar: CalendarRace[] = CALENDAR): CalendarRace | undefined {
  return calendar.find((r) => Date.parse(r.race_start) > now)
}
