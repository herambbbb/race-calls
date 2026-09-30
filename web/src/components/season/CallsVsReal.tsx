// Calls against reality: for every scored race, each thing Jev gave chances for beside
// what really happened. Every chance has a bar to scan by and its percent to read, and
// every verdict is written out, never colour alone.
import type { ReactNode } from 'react'
import { pct, score as fmt } from '../../data/format'
import type { CallsVsReal as Race, Chance } from '../../data/technical'
import { Bar } from '../Bar'
import type { Scope } from './Leaderboard'

const EMPTY = {
  live: 'No live race scored yet. Each live race lands here, call by call, the day after it runs.',
  backtest: 'No backtest has been scored yet.',
} as const

function Verdict({ good, children }: { good: boolean; children: string }) {
  return (
    <span className={`flex items-center gap-1.5 text-xs whitespace-nowrap ${good ? 'text-sector-green' : 'text-sector-amber'}`}>
      <span aria-hidden="true" className={`size-1.5 rotate-45 ${good ? 'bg-sector-green' : 'bg-sector-amber'}`} />
      {children}
    </span>
  )
}

/** A driver, the chance Jev gave them as a bar and a percent, and an optional verdict. */
function ChanceRow({ chance, lead, verdict }: { chance: Chance; lead?: string; verdict?: { good: boolean; text: string } }) {
  return (
    <li className="grid grid-cols-[2rem_3rem_minmax(0,1fr)_2.75rem] items-center gap-x-2 gap-y-0.5 text-sm">
      <span className="tag text-muted">{lead}</span>
      <span className="telemetry font-medium">{chance.code}</span>
      <Bar value={chance.p ?? 0} colour="var(--color-star)" />
      <span className="telemetry text-right">{chance.p === null ? '-' : pct(chance.p)}</span>
      {verdict && (
        <span className="col-start-3 col-end-5">
          <Verdict good={verdict.good}>{verdict.text}</Verdict>
        </span>
      )}
    </li>
  )
}

function Block({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="min-w-0 rounded-xl border border-line/70 bg-ink/40 p-4">
      <h4 className="tag text-muted">{label}</h4>
      <div className="mt-3 space-y-4">{children}</div>
    </div>
  )
}

function Sub({ children }: { children: string }) {
  return <p className="mb-2 text-xs text-muted">{children}</p>
}

function RaceCard({ race }: { race: Race }) {
  const { podium, winner, chaos } = race
  const made = podium.picks.filter((p) => p.made).length
  return (
    <li className="rounded-[22px] border border-line bg-panel p-4 sm:p-5">
      <h3 className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <span className="tag text-muted">Round {String(race.round).padStart(2, '0')}</span>
        <span className="font-display text-2xl leading-tight">{race.race_name}</span>
      </h3>
      <div className="mt-4 grid gap-3 lg:grid-cols-3">
        <Block label="Podium">
          <div>
            <Sub>What happened, with the podium chance Jev gave each</Sub>
            <ol className="space-y-1.5">
              {podium.actual.map((c, i) => (
                <ChanceRow key={c.code} chance={c} lead={`P${i + 1}`} />
              ))}
            </ol>
          </div>
          <div>
            <Sub>{`Jev's three picks: ${made} of 3 made it`}</Sub>
            <ol className="space-y-2">
              {podium.picks.map((c, i) => (
                <ChanceRow
                  key={c.code}
                  chance={c}
                  lead={`#${i + 1}`}
                  verdict={{ good: c.made, text: c.made ? 'made the podium' : 'missed the podium' }}
                />
              ))}
            </ol>
          </div>
        </Block>
        <Block label="Winner">
          <div>
            <Sub>The winner, with the win chance Jev gave them</Sub>
            <ul>
              <ChanceRow chance={winner.actual} lead="Won" />
            </ul>
          </div>
          <div>
            <Sub>Jev's pick, with its win chance</Sub>
            <ul>
              <ChanceRow chance={winner.pick} lead="Pick" verdict={{ good: winner.hit, text: winner.hit ? 'hit: the pick won' : 'miss: the pick did not win' }} />
            </ul>
          </div>
        </Block>
        <Block label="Chaos">
          <div>
            <Sub>What happened</Sub>
            <p className="flex items-baseline gap-2">
              <span className="telemetry text-3xl leading-none font-semibold">{chaos.actual}</span>
              <span className="font-medium">{chaos.word}</span>
            </p>
            <p className="mt-1 text-sm text-muted">{chaos.reason}</p>
          </div>
          <div>
            <Sub>Jev's call</Sub>
            <p className="text-sm">
              Score <span className="telemetry font-semibold">{chaos.called === null ? '-' : fmt(chaos.called, 2)}</span>{' '}
              <span className="text-muted">of 4</span>
            </p>
            <p className="mt-2 mb-1 text-xs text-muted">Chance Jev put on level {chaos.actual}, what happened</p>
            {chaos.on_actual === null ? (
              <p className="text-sm text-muted">Not recorded for this race.</p>
            ) : (
              <p className="grid grid-cols-[minmax(0,1fr)_2.75rem] items-center gap-2 text-sm">
                <Bar value={chaos.on_actual} colour="var(--color-star)" />
                <span className="telemetry text-right">{pct(chaos.on_actual)}</span>
              </p>
            )}
          </div>
        </Block>
      </div>
    </li>
  )
}

export function CallsVsReal({ races, scope = 'live' }: { races: Race[]; scope?: Scope }) {
  if (races.length === 0) {
    return (
      <p className="rounded-[22px] border border-line bg-panel p-6 text-sm leading-relaxed text-muted" data-testid="calls-empty">
        {EMPTY[scope]}
      </p>
    )
  }
  return (
    <ol className="space-y-3">
      {races.map((r) => (
        <RaceCard key={`${r.season}-${r.round}`} race={r} />
      ))}
    </ol>
  )
}
