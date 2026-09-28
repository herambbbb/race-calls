// The next race as a timing-screen window: the circuit drawing itself in, the
// countdown to lights out, and when Jev's call lands. The pick itself stays hidden.
import { Link } from 'react-router'
import { nextRace, SEASON, SEASON_ROUNDS, type CalendarRace } from '../../data/calendar'
import { formatDay, formatLocal, formatUtc } from '../../data/format'
import type { SeasonRow } from '../../data/season'
import { TrackOutline } from '../art/TrackOutline'
import { Countdown } from '../Countdown'
import { RaceName } from '../RaceHero'
import { StartLights } from '../StartLights'

export function NextRaceCard({
  rows,
  now,
  at,
  calendar,
}: {
  rows: SeasonRow[]
  now: number
  at: number | undefined
  calendar: CalendarRace[]
}) {
  const next = nextRace(now, calendar)
  if (!next) {
    return (
      <div className="glass self-end rounded-[22px] border border-white/10 p-6">
        <p className="tag text-muted">Season complete</p>
        <p className="mt-2 font-display text-4xl">See you in {SEASON + 1}.</p>
      </div>
    )
  }
  const row = rows.find((r) => r.race.round === next.round)
  const called = row?.entry?.record.status === 'ok'
  return (
    <div className="animate-rise self-end overflow-hidden rounded-[22px] border border-white/10 bg-ink/80 shadow-[0_40px_80px_-40px_rgb(0_0_0/0.9)] backdrop-blur-md [animation-delay:120ms]">
      <p className="tag flex items-center justify-between border-b border-line px-4 py-2.5 text-muted">
        <span>
          Next race // round {next.round} of {SEASON_ROUNDS}
        </span>
        <span aria-hidden="true" className="flex gap-1">
          <span className="size-1.5 rounded-full bg-line" />
          <span className="size-1.5 rounded-full bg-line" />
          <span className="size-1.5 rounded-full bg-star" />
        </span>
      </p>
      <div className="space-y-5 p-5">
        <div className="grid grid-cols-[minmax(0,1fr)_6.5rem] items-center gap-4">
          <div>
            <h2 className="font-display text-4xl leading-[0.95]">
              <RaceName name={next.race_name} />
            </h2>
            <p className="mt-1 text-sm text-muted">
              {next.circuit_name}, {next.locality}
            </p>
          </div>
          <TrackOutline circuit={next.circuit_name} className="h-24 w-full text-text" draw lap start />
        </div>
        <div>
          <p className="tag mb-2 text-muted">Lights out in</p>
          <Countdown to={next.race_start} at={at} label={`Lights out for the ${next.race_name} in`} />
        </div>
        <dl className="space-y-1.5 text-sm">
          <div className="flex justify-between gap-4">
            <dt className="text-muted">Lights out</dt>
            <dd className="telemetry text-right">{formatUtc(next.race_start)}</dd>
          </div>
          <div className="flex justify-between gap-4">
            <dt className="text-muted">Your time</dt>
            <dd className="telemetry text-right">{formatLocal(next.race_start)}</dd>
          </div>
          <div className="flex justify-between gap-4">
            <dt className="text-muted">Jev's call</dt>
            <dd className="text-right">
              {called ? (
                <span className="text-sector-green">Committed. Pick hidden until you ask.</span>
              ) : (
                <span className="telemetry">after qualifying, {formatDay(next.qualifying_start)}</span>
              )}
            </dd>
          </div>
        </dl>
        <div className="flex items-center justify-between gap-3 border-t border-line pt-4">
          <StartLights size="sm" />
          <Link
            to={`/race/${next.round}`}
            className="group inline-flex items-center gap-2 rounded-full bg-text px-4 py-2 text-sm font-medium text-ink transition-transform duration-300 ease-[var(--ease-spring)] hover:scale-[1.04]"
          >
            {called ? 'See the call' : 'Race page'}
            <span aria-hidden="true" className="transition-transform group-hover:translate-x-0.5">
              →
            </span>
          </Link>
        </div>
      </div>
    </div>
  )
}
