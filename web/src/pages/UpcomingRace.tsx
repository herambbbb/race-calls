// A race on the calendar with no record yet: before the start it is upcoming, with a
// countdown and when the call is due; after the start, no call was made.
import { Link } from 'react-router'
import { Banner } from '../components/Banner'
import { Countdown } from '../components/Countdown'
import { useNow } from '../components/useNow'
import { RaceHero } from '../components/RaceHero'
import { Stamp } from '../components/Stamp'
import { StartLights } from '../components/StartLights'
import { SEASON_ROUNDS, type CalendarRace } from '../data/calendar'
import { formatLocal, formatUtc } from '../data/format'

export function UpcomingRace({ race, at }: { race: CalendarRace; at?: number }) {
  const tick = useNow(60_000)
  const now = at ?? tick
  const started = Date.parse(race.race_start) <= now
  return (
    <article>
      <RaceHero
        eyebrow={`Live // ${race.season} // Round ${race.round} of ${SEASON_ROUNDS}${race.sprint ? ' // Sprint weekend' : ''}`}
        round={race.round}
        raceName={race.race_name}
        circuit={race.circuit_name}
        circuitLabel={`${race.circuit_name}, ${race.locality}`}
        raceStart={race.race_start}
        stamps={
          started ? (
            <Stamp tone="paper" tilt={-3}>
              No call
            </Stamp>
          ) : (
            <Stamp tone="paper" tilt={-3}>
              Upcoming
            </Stamp>
          )
        }
      />
      <div className="mx-auto mt-8 max-w-6xl space-y-8 px-4 sm:px-6">
        {started ? (
          <Banner tone="white" label="No prediction">
            No prediction for this race: no call was committed before lights out.
          </Banner>
        ) : (
          <div className="grid gap-4 lg:grid-cols-[minmax(0,7fr)_minmax(0,5fr)]">
            <section aria-labelledby="pending-heading" className="relative overflow-hidden rounded-[22px] border border-line bg-panel p-5 sm:p-8">
              <div aria-hidden="true" className="columns-rule absolute inset-0 text-text" />
              <div className="relative space-y-5">
                <StartLights />
                <h2 id="pending-heading" className="font-display text-4xl leading-none sm:text-5xl">
                  No call <span className="italic">yet</span>
                </h2>
                <p className="max-w-prose leading-relaxed text-muted">
                  Jev's call lands after qualifying, once the grid is published. It is committed to the public repository
                  before lights out, and this page will show it: a podium chance for every driver, a winner pick, and a
                  chaos rating.
                </p>
                <dl className="grid gap-3 text-sm sm:grid-cols-2">
                  <div>
                    <dt className="tag text-muted">Qualifying starts</dt>
                    <dd className="telemetry mt-1">{formatUtc(race.qualifying_start)}</dd>
                    <dd className="telemetry text-muted">{formatLocal(race.qualifying_start)}</dd>
                  </div>
                  <div>
                    <dt className="tag text-muted">Call due by</dt>
                    <dd className="telemetry mt-1">{formatUtc(race.race_start)}</dd>
                    <dd className="text-muted">Anything later is marked late and never scored.</dd>
                  </div>
                </dl>
              </div>
            </section>
            <section aria-label="Countdown" className="rounded-[22px] border border-line bg-panel p-5 sm:p-8">
              <p className="tag mb-4 text-muted">Lights out in</p>
              <Countdown to={race.race_start} at={at} label="Lights out in" />
            </section>
          </div>
        )}
        <p>
          <Link to="/season#races" className="group inline-flex items-center gap-2 text-sm text-muted hover:text-text">
            <span aria-hidden="true" className="transition-transform group-hover:-translate-x-1">
              ←
            </span>
            All races
          </Link>
        </p>
      </div>
    </article>
  )
}
