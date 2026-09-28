// The race poster: round and kind, the race name in display type, circuit, and lights
// out in UTC and the visitor's own time. Status stamps sit in the corner.
import type { ReactNode } from 'react'
import { formatLocal, formatUtc } from '../data/format'
import { TrackOutline } from './art/TrackOutline'
import { Sparkle, Starburst } from './Starburst'

/** "Spanish Grand Prix" with "Grand Prix" set in italic, poster style. */
export function RaceName({ name }: { name: string }) {
  const at = name.indexOf('Grand Prix')
  if (at < 0) return <>{name}</>
  return (
    <>
      {name.slice(0, at)}
      <span className="italic">Grand Prix</span>
      {name.slice(at + 'Grand Prix'.length)}
    </>
  )
}

export function RaceHero({
  eyebrow,
  round,
  raceName,
  circuit,
  circuitLabel,
  raceStart,
  stamps,
  children,
}: {
  eyebrow: string
  round: number
  raceName: string
  /** Jolpica's circuit name: picks the outline, and is shown unless a label is given. */
  circuit: string
  circuitLabel?: string
  raceStart: string
  stamps?: ReactNode
  children?: ReactNode
}) {
  return (
    <header className="px-3 pt-4 sm:px-6">
      <div className="relative mx-auto max-w-6xl overflow-hidden rounded-[28px] border border-line bg-panel">
        <div aria-hidden="true" className="columns-rule absolute inset-0 text-text" />
        <div aria-hidden="true" className="halftone absolute inset-0 text-star/35" />
        <Starburst className="absolute -top-72 -right-72 size-[34rem] text-cobalt/40 sm:-top-40 sm:-right-40 sm:text-cobalt/45" />
        <TrackOutline
          circuit={circuit}
          className="absolute top-24 right-4 hidden h-[62%] w-[44%] text-text/85 md:block"
          width={0.9}
          draw
          lap
          start
        />
        <p
          aria-hidden="true"
          className="telemetry absolute right-4 -bottom-10 text-[11rem] leading-none font-bold text-transparent select-none sm:right-10 sm:-bottom-16 sm:text-[14rem]"
          style={{ WebkitTextStroke: '1.5px color-mix(in oklab, var(--color-text) 16%, transparent)' }}
        >
          {String(round).padStart(2, '0')}
        </p>
        <div className="relative space-y-6 p-5 pt-8 sm:p-10 md:pr-[46%] lg:p-14 lg:pr-[46%]">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="tag flex items-center gap-2 text-muted">
              <Sparkle className="size-3 text-star" />
              {eyebrow}
            </p>
            {stamps && <div className="flex flex-wrap gap-2">{stamps}</div>}
          </div>
          <div className="animate-rise">
            <h1 className="max-w-4xl font-display text-[clamp(2.75rem,10vw,7rem)] leading-[0.88] tracking-tight [overflow-wrap:anywhere]">
              <RaceName name={raceName} />
            </h1>
            <p className="mt-3 text-lg text-muted">{circuitLabel ?? circuit}</p>
          </div>
          <TrackOutline circuit={circuit} className="h-32 w-full max-w-60 text-text/85 md:hidden" width={2} draw start />
          <dl className="grid max-w-2xl gap-3 sm:grid-cols-2">
            <div className="rounded-xl border border-line bg-ink/70 px-4 py-3 backdrop-blur-sm">
              <dt className="tag text-muted">Lights out, UTC</dt>
              <dd className="telemetry mt-1 text-sm text-text">
                <time dateTime={raceStart}>{formatUtc(raceStart)}</time>
              </dd>
            </div>
            <div className="rounded-xl border border-line bg-ink/70 px-4 py-3 backdrop-blur-sm">
              <dt className="tag text-muted">Your time</dt>
              <dd className="telemetry mt-1 text-sm text-text">{formatLocal(raceStart)}</dd>
            </div>
          </dl>
          {children}
        </div>
      </div>
    </header>
  )
}
