// The front page: what Race Calls is and the next race, the circuits still to come, and
// the ways in: the season, the backtests, and the method. Each is its own page.
import type { ReactNode } from 'react'
import { Link } from 'react-router'
import { Car } from '../components/art/Car'
import { SpeedBurst } from '../components/art/SpeedBurst'
import { TrackOutline } from '../components/art/TrackOutline'
import { Painting } from '../components/art/painting/Painting'
import { SCRIM_NARROW, SCRIM_WIDE } from '../components/art/painting/scrim'
import { TrackRibbon } from '../components/art/TrackRibbon'
import { NextRaceCard } from '../components/home/NextRaceCard'
import { StormBand } from '../components/home/StormBand'
import { Ticker } from '../components/home/Ticker'
import { RaceName } from '../components/RaceHero'
import { Stamp } from '../components/Stamp'
import { Sparkle } from '../components/Starburst'
import { StartLights } from '../components/StartLights'
import { StatusPill } from '../components/StatusPill'
import { useDocumentTitle } from '../components/useDocumentTitle'
import { useNow } from '../components/useNow'
import { CALENDAR, nextRace, SEASON, type CalendarRace } from '../data/calendar'
import { formatDay } from '../data/format'
import { byKind, RECORDS, SCORES } from '../data/load'
import type { ScoreRecord } from '../data/scores'
import { countedScores, seasonRows, type SeasonRow } from '../data/season'
import type { LoadedRecord } from '../data/types'

export function Landing({
  records = RECORDS,
  scores = SCORES,
  at,
  calendar = CALENDAR,
}: {
  records?: LoadedRecord[]
  scores?: ScoreRecord[]
  /** A fixed time, for tests and previews; otherwise the page keeps time. */
  at?: number
  calendar?: CalendarRace[]
}) {
  useDocumentTitle(null)
  const tick = useNow(60_000)
  const now = at ?? tick
  const rows = seasonRows(records, scores, now, calendar)
  const next = nextRace(now, calendar)
  const backtests = byKind(records, 'backtest')

  return (
    <div>
      {/*
        The hero fills the screen edge to edge, under the header, and closes into a card as
        the reader scrolls (index.css: .hero-*). Without scroll timelines, or with reduced
        motion, it is simply a full-bleed section.
      */}
      <section aria-labelledby="hero-heading" className="hero-scroll relative -mt-[var(--header-h,76px)]">
        <div className="hero-stage">
          <div className="hero-frame relative isolate overflow-hidden bg-ink">
            <Painting preset={{ kind: 'sky' }} seed={2026} className="absolute inset-0 -z-10" />
            <TrackRibbon className="absolute inset-0 -z-10 hidden h-full w-full lg:block" />
            {/* The scrim: text never sits on bare paint. */}
            <div aria-hidden="true" className="absolute inset-0 -z-10 lg:hidden" style={{ backgroundImage: SCRIM_NARROW }} />
            <div aria-hidden="true" className="absolute inset-0 -z-10 hidden lg:block" style={{ backgroundImage: SCRIM_WIDE }} />
            <div className="hero-inner mx-auto grid max-w-6xl gap-10 px-5 pt-[calc(var(--header-h,76px)+2.5rem)] pb-10 sm:px-10 lg:grid-cols-[minmax(0,7fr)_minmax(0,5fr)] lg:items-end lg:pb-14">
              <div className="hero-copy animate-rise space-y-6">
                <p className="tag inline-flex items-center gap-2 rounded-full border border-line bg-ink/80 py-1.5 pr-3 pl-2 text-muted backdrop-blur">
                  <span aria-hidden="true" className="animate-pulse-dot size-1.5 rounded-full bg-sector-green text-sector-green" />
                  Season {SEASON} // {calendar.length} live races // {next ? `next on ${formatDay(next.race_start)}` : 'complete'}
                </p>
                <h1
                  id="hero-heading"
                  className="font-display text-[clamp(3.25rem,min(11vw,13svh),8.5rem)] leading-[0.84] tracking-tight [text-shadow:0_2px_30px_rgb(7_13_28/0.9)]"
                >
                  <span className="sr-only">Race Calls: </span>
                  Called <span className="italic">before</span>
                  <br />
                  lights out.
                  <br />
                  <span className="text-star">Scored</span> after
                  <br />
                  the flag.
                </h1>
                <p className="max-w-md leading-relaxed text-muted [text-shadow:0_1px_12px_rgb(7_13_28/0.9)]">
                  Before every Grand Prix, an AI model called <span className="text-text">Jev</span> makes public,
                  timestamped calls about the race. After the flag, the calls are scored against what really happened,
                  and the season record keeps the misses as plainly as the hits.
                </p>
                {/* Phones get the road as a strip between the intro and the card. */}
                <TrackRibbon className="-mx-5 block h-auto w-[calc(100%+2.5rem)] sm:-mx-10 sm:w-[calc(100%+5rem)] lg:hidden" fit="meet" />
              </div>
              <div className="hero-card">
                <NextRaceCard rows={rows} now={now} at={at} calendar={calendar} />
              </div>
            </div>
          </div>
        </div>
      </section>
      <Ticker />
      <StormBand />

      <div className="mx-auto mt-20 max-w-6xl space-y-24 px-4 sm:px-6">
        <Circuits rows={rows} nextRound={next?.round} />
        <Doors counted={countedScores(rows).length} total={calendar.length} backtests={backtests} />
      </div>
    </div>
  )
}

function Circuits({ rows, nextRound }: { rows: SeasonRow[]; nextRound: number | undefined }) {
  return (
    <section aria-labelledby="circuits-heading">
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="tag flex items-center gap-2 text-muted">
            <span className="text-star">{rows.length} circuits</span>
            <span aria-hidden="true" className="h-px w-6 bg-line" />
            Rounds {rows[0]?.race.round} to {rows.at(-1)?.race.round}
          </p>
          <h2 id="circuits-heading" className="mt-2 font-display text-5xl leading-[0.9] sm:text-6xl">
            {rows.length} circuits, <span className="italic">{rows.length} calls</span>
          </h2>
        </div>
        <Link to="/season" className="text-sm text-link underline-offset-4 hover:underline">
          The whole season →
        </Link>
      </div>
      <ol className="grid grid-cols-2 gap-2 md:grid-cols-4">
        {rows.map((row) => {
          const next = row.race.round === nextRound
          return (
            <li key={row.race.round} className="view-tile">
              <Link
                to={`/race/${row.race.round}`}
                className={`group relative flex h-full flex-col gap-4 overflow-hidden rounded-[22px] border bg-panel p-4 transition-[border-color,transform] duration-300 hover:-translate-y-1 hover:border-faint sm:p-5 ${next ? 'border-star/60' : 'border-line'}`}
              >
                <span className="flex items-start justify-between gap-2">
                  <span className="telemetry text-xs text-muted">R{row.race.round}</span>
                  <span className="tag text-muted">{formatDay(row.race.race_start)}</span>
                </span>
                <TrackOutline
                  circuit={row.race.circuit_name}
                  className="mx-auto h-24 w-full text-text transition-colors duration-300 group-hover:text-star sm:h-28"
                  width={2}
                  draw="view"
                  start
                  {...(next ? { lap: true } : {})}
                />
                <span className="mt-auto">
                  <span className="block font-display text-2xl leading-[0.95]">
                    <RaceName name={row.race.race_name} />
                  </span>
                  <span className="mt-2 block">
                    <StatusPill status={row.status} live={next && row.status === 'upcoming'} />
                  </span>
                </span>
              </Link>
            </li>
          )
        })}
      </ol>
    </section>
  )
}

function Door({ to, label, title, body, art, className = '' }: { to: string; label: string; title: ReactNode; body: string; art: ReactNode; className?: string }) {
  return (
    <Link
      to={to}
      className={`rise-on-view group relative flex min-h-[26rem] flex-col justify-between overflow-hidden rounded-t-[999px] rounded-b-[22px] border p-6 pt-16 transition-transform duration-500 ease-[var(--ease-out-quint)] hover:-translate-y-1.5 sm:p-8 sm:pt-20 ${className}`}
    >
      <div aria-hidden="true" className="relative mx-auto flex h-44 w-full items-center justify-center transition-transform duration-700 ease-[var(--ease-out-quint)] group-hover:scale-105">
        {art}
      </div>
      <div className="relative">
        <p className="tag opacity-80">{label}</p>
        <p className="mt-2 font-display text-4xl leading-[0.95]">{title}</p>
        <p className="mt-3 text-sm leading-relaxed opacity-80">{body}</p>
        <p className="mt-5 inline-flex items-center gap-2 text-sm font-medium">
          Open
          <span aria-hidden="true" className="transition-transform group-hover:translate-x-1">
            →
          </span>
        </p>
      </div>
    </Link>
  )
}

function Doors({ counted, total, backtests }: { counted: number; total: number; backtests: LoadedRecord[] }) {
  return (
    <section aria-labelledby="doors-heading">
      <h2 id="doors-heading" className="sr-only">
        More
      </h2>
      <div className="grid gap-3 md:grid-cols-3">
        <Door
          to="/season"
          label="Season"
          title={
            <>
              The season <span className="italic">so far</span>
            </>
          }
          body={`Jev against two baselines over live races only: ${counted} of ${total} counted so far. Calibration, and every race with its status.`}
          className="border-line bg-panel text-text"
          art={
            <>
              <SpeedBurst className="absolute inset-0 m-auto h-56 w-56 text-star/50 [mask-image:radial-gradient(circle,black_30%,transparent_68%)]" />
              <Car className="relative h-40 rotate-[-18deg] text-text drop-shadow-[0_18px_20px_rgb(0_0_0/0.6)]" />
            </>
          }
        />
        <Door
          to="/backtests"
          label="Backtests"
          title={
            <>
              The first {backtests.length}, <span className="italic">after the fact</span>
            </>
          }
          body="Past races run to test the pipeline. The model may have seen these results, so they never count."
          className="paper on-paper border-transparent"
          art={
            <>
              <span className="grid grid-cols-3 gap-3">
                {backtests.slice(0, 6).map(({ record }) => (
                  <TrackOutline key={record.round} circuit={record.circuit_name} className="h-14 w-16 text-print" width={3.5} />
                ))}
              </span>
              <Stamp tone="cobalt" tilt={-8} className="absolute -bottom-2 left-1/2 -translate-x-1/2 whitespace-nowrap">
                May have seen
              </Stamp>
            </>
          }
        />
        <Door
          to="/method"
          label="Method"
          title={
            <>
              Three questions, <span className="italic">one request</span>
            </>
          }
          body="What Jev is asked, what it is told, how each call is committed before the start, and how it is scored."
          className="on-paper border-star bg-star text-ink"
          art={
            <>
              <Sparkle className="absolute top-2 right-6 size-8 text-ink/70" />
              <StartLights />
            </>
          }
        />
      </div>
    </section>
  )
}
