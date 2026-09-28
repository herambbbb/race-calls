// The three calls at a glance: the winner pick, Jev's podium, and the chaos rating.
// After the race each card carries its verdict as a stamp, in words.
import type { ReactNode } from 'react'
import { pct } from '../../data/format'
import { driverLookup, levelWord, podiumPick } from '../../data/record'
import type { ScoreRecord } from '../../data/scores'
import type { Calls, RecordDriver } from '../../data/types'
import { Stamp } from '../Stamp'
import { Starburst } from '../Starburst'
import { teamName } from '../../data/teams'
import { TeamSwatch } from '../TeamSwatch'

/** Read in order P1, P2, P3; the plinth shows P2, P1, P3 from left to right. */
const VISUAL_ORDER = [2, 1, 3]

function Card({ label, children, className = '' }: { label: string; children: ReactNode; className?: string }) {
  return (
    <div className={`relative overflow-hidden rounded-[22px] border border-line bg-panel p-5 sm:p-6 ${className}`}>
      <p className="tag relative text-muted">{label}</p>
      {children}
    </div>
  )
}

export function Headline({
  calls,
  drivers,
  criteria,
  score,
}: {
  calls: Calls
  drivers: RecordDriver[]
  criteria: string[]
  score?: ScoreRecord | undefined
}) {
  const byCode = driverLookup(drivers)
  const { choice, probabilities } = calls.winner
  const pick = byCode.get(choice)
  const winner = score ? byCode.get(score.result.winner) : undefined
  const podium = podiumPick(calls.podium)
  const actualTop3 = new Set(score?.result.podium ?? [])
  const hits = podium.filter(([code]) => actualTop3.has(code)).length
  const chaos = Math.max(0, Math.min(4, calls.chaos.score))
  const nearest = Math.round(chaos)
  const word = levelWord(criteria, nearest)

  return (
    <div className="grid gap-3 lg:grid-cols-12">
      <Card label="Winner pick" className="lg:col-span-5">
        <Starburst className="absolute -right-16 -bottom-20 size-64 text-cobalt/45" />
        <div className="relative mt-6 space-y-3" data-testid="winner-pick">
          <p className="font-display text-5xl leading-[0.9] sm:text-6xl">{pick?.name ?? choice}</p>
          <p className="flex items-center gap-2 text-muted">
            {pick && <TeamSwatch constructorId={pick.constructor_id} />}
            {pick && teamName(pick.constructor)}
          </p>
          <p className="telemetry text-6xl font-semibold tracking-tighter sm:text-7xl">{pct(probabilities[choice])}</p>
          <p className="text-sm text-muted">Win chance Jev gave its pick.</p>
          {score && (
            <div className="flex flex-wrap items-center gap-3 pt-2">
              {score.scores.jev.winner_hit ? (
                <Stamp tone="green">Hit</Stamp>
              ) : (
                <Stamp tone="amber">Miss</Stamp>
              )}
              <p className="text-sm">
                Won by <span className="font-semibold">{winner?.name ?? score.result.winner}</span>
                {!score.scores.jev.winner_hit && (
                  <span className="text-muted"> (Jev gave {pct(probabilities[score.result.winner] ?? 0)})</span>
                )}
              </p>
            </div>
          )}
        </div>
      </Card>

      <Card label="Jev's podium" className="lg:col-span-4">
        <p className="relative mt-1 text-sm text-muted">The three highest podium chances, in order.</p>
        <ol aria-label="Jev's podium" data-testid="podium-pick" className="relative mt-5 grid grid-cols-3 items-end gap-2">
          {podium.map(([code, p], i) => {
            const place = i + 1
            const d = byCode.get(code)
            const made = actualTop3.has(code)
            return (
              <li key={code} className="flex flex-col" style={{ order: VISUAL_ORDER[i] }}>
                <span className="sr-only">P{place} </span>
                <span className="mb-2 min-w-0 px-1">
                  <span className="flex items-center gap-1.5">
                    {d && <TeamSwatch constructorId={d.constructor_id} />}
                    <span className="font-semibold">{code}</span>
                  </span>
                  <span className="sr-only">{d?.name ?? code} </span>
                  <span className="telemetry block text-lg">{pct(p)}</span>
                </span>
                <span
                  aria-hidden="true"
                  className={`relative grid place-items-center rounded-t-lg border border-b-0 border-line font-display text-4xl ${
                    place === 1 ? 'h-28 bg-text text-ink' : place === 2 ? 'h-20 bg-raised' : 'h-14 bg-raised'
                  }`}
                >
                  {place}
                </span>
                {score && (
                  <span className={`tag mt-2 text-center ${made ? 'text-sector-green' : 'text-sector-amber'}`}>
                    {made ? 'On podium' : 'Missed'}
                  </span>
                )}
              </li>
            )
          })}
        </ol>
        {score && (
          <p className="relative mt-4 text-sm">
            <span className="telemetry font-semibold">{hits} of 3</span> right.
          </p>
        )}
      </Card>

      <Card label="Chaos" className="lg:col-span-3">
        <p className="relative mt-6">
          <span className="telemetry text-6xl font-semibold tracking-tighter">{chaos.toFixed(2)}</span>
          <span className="text-muted"> out of 4</span>
        </p>
        {word && <p className="relative mt-1 font-display text-3xl italic">{word}</p>}
        <span aria-hidden="true" className="relative mt-5 grid grid-cols-5 gap-1">
          {[0, 1, 2, 3, 4].map((level) => (
            <span
              key={level}
              className={`h-8 rounded-[3px] ${level <= nearest ? 'bg-star' : 'bg-raised'}`}
            />
          ))}
        </span>
        {score && (
          <p className="relative mt-4 text-sm">
            Actual: <span className="telemetry font-semibold">{score.chaos.actual}</span>
            {levelWord(criteria, score.chaos.actual) && <>, {levelWord(criteria, score.chaos.actual)}</>}.{' '}
            <span className="text-muted">{score.chaos.reason}</span>
          </p>
        )}
      </Card>
    </div>
  )
}
