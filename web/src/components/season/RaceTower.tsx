// Every race of the live season as a timing tower: round, race, and the status in words
// and a sector-coloured dot. No picks here: they stay behind each race's spoiler guard.
import { Link } from 'react-router'
import { formatDay } from '../../data/format'
import type { SeasonRow } from '../../data/season'
import { TrackOutline } from '../art/TrackOutline'
import { RaceName } from '../RaceHero'
import { StatusPill } from '../StatusPill'

export function RaceTower({ rows, nextRound }: { rows: SeasonRow[]; nextRound: number | undefined }) {
  return (
    <ol className="overflow-hidden rounded-[22px] border border-line bg-panel" aria-label="Races of the season">
      {rows.map((row, i) => {
        const next = row.race.round === nextRound
        return (
          <li key={row.race.round} className="border-b border-line/70 last:border-0">
            <Link
              to={`/race/${row.race.round}`}
              className={`group relative grid grid-cols-[3rem_1fr] items-center gap-x-3 gap-y-2 px-3 py-4 transition-colors hover:bg-raised/70 sm:grid-cols-[4rem_minmax(0,1fr)_5rem_auto] sm:px-5 ${next ? 'bg-raised/50' : ''}`}
            >
              {next && <span aria-hidden="true" className="absolute inset-y-0 left-0 w-[3px] bg-star" />}
              <span className={`telemetry grid h-10 place-items-center rounded-md text-sm font-semibold ${i % 2 ? 'bg-raised' : 'bg-ink'}`}>
                R{row.race.round}
              </span>
              <span className="min-w-0">
                <span className="block truncate font-display text-2xl leading-tight transition-transform duration-300 group-hover:translate-x-1">
                  <RaceName name={row.race.race_name} />
                </span>
                <span className="telemetry block truncate text-xs text-muted">
                  {formatDay(row.race.race_start)} · {row.race.locality}
                  {next && <span className="text-star"> · next</span>}
                </span>
              </span>
              <TrackOutline
                circuit={row.race.circuit_name}
                className="hidden h-12 w-20 text-muted transition-colors duration-300 group-hover:text-text sm:block"
                width={3}
              />
              <span className="col-start-2 sm:col-start-auto sm:justify-self-end">
                <StatusPill status={row.status} live={next && row.status === 'upcoming'} />
              </span>
            </Link>
          </li>
        )
      })}
    </ol>
  )
}
