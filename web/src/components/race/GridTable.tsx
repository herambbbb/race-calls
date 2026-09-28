// The grid in starting order, like a timing tower. Before the reveal the call columns
// are redacted; after it they show each driver's podium chance and win chance, and
// once the race is scored, where they finished.
import type { CSSProperties } from 'react'
import { finishLabel, pct } from '../../data/format'
import type { ScoreRecord } from '../../data/scores'
import { teamColour, teamName } from '../../data/teams'
import type { Calls, RecordDriver } from '../../data/types'
import { Bar } from '../Bar'
import { TeamSwatch } from '../TeamSwatch'

function Redacted() {
  return <span aria-hidden="true" className="hatch block h-2 w-full rounded-[1px] text-muted" />
}

export function GridTable({
  drivers,
  calls,
  revealed,
  score,
}: {
  drivers: RecordDriver[]
  calls: Calls | null
  revealed: boolean
  score?: ScoreRecord | undefined
}) {
  const show = revealed && calls !== null
  const top3 = new Set(score?.result.podium ?? [])
  const withFinish = show && score !== undefined
  return (
    <div className="overflow-hidden rounded-2xl border border-line">
      <table className="w-full table-fixed border-collapse text-sm">
        <caption className="sr-only">
          Starting grid{show ? " with Jev's podium and win chances" : ". Podium and win chances are hidden until you show the calls."}
        </caption>
        <thead className="bg-panel">
          <tr className="tag text-left text-muted">
            <th scope="col" className="w-12 py-3 pl-3 font-normal sm:w-16 sm:pl-4">
              Grid
            </th>
            <th scope="col" className="py-3 pl-1 font-normal">
              Driver
            </th>
            <th scope="col" className="hidden py-3 font-normal md:table-cell">
              Team
            </th>
            <th scope="col" className="w-[36%] py-3 font-normal sm:w-[32%]">
              <span aria-hidden="true" className="sm:hidden">Podium</span>
              <span className="sr-only sm:not-sr-only">Podium chance</span>
            </th>
            <th scope="col" className="w-11 py-3 text-right font-normal sm:w-16">
              Win
            </th>
            {withFinish && (
              <th scope="col" className="w-12 py-3 pr-3 text-right font-normal sm:w-20 sm:pr-4">
                <span aria-hidden="true" className="sm:hidden">Fin</span>
                <span className="sr-only sm:not-sr-only">Result</span>
              </th>
            )}
            {!withFinish && <th aria-hidden="true" className="w-3 sm:w-4" />}
          </tr>
        </thead>
        <tbody>
          {drivers.map((d, i) => {
            const onPodium = top3.has(d.code)
            return (
              <tr
                key={d.code}
                data-testid="grid-row"
                className={`border-t border-line/70 transition-colors hover:bg-raised/60 ${show ? 'stagger' : ''} ${withFinish && onPodium ? 'bg-sector-purple/[0.07]' : ''}`}
                style={show ? ({ '--i': i } as CSSProperties) : undefined}
              >
                <td className="telemetry py-2.5 pl-3 text-muted sm:pl-4">
                  <span className={`inline-block w-7 rounded-[3px] py-0.5 text-center ${i < 3 ? 'bg-text text-ink' : 'bg-raised text-text'}`}>
                    {d.grid}
                  </span>
                </td>
                <td className="py-2.5 pr-2 pl-1">
                  <span className="flex min-w-0 items-center gap-2">
                    <span className="md:hidden">
                      <TeamSwatch constructorId={d.constructor_id} />
                    </span>
                    <span className="truncate">
                      <span className="font-medium sm:hidden">{d.code}</span>
                      <span className="hidden sm:inline">{d.name}</span>
                    </span>
                  </span>
                </td>
                <td className="hidden py-2.5 md:table-cell">
                  <span className="flex min-w-0 items-center gap-2">
                    <TeamSwatch constructorId={d.constructor_id} />
                    <span className="truncate text-muted">{teamName(d.constructor)}</span>
                  </span>
                </td>
                <td className="py-2.5">
                  {show ? (
                    <span className="grid grid-cols-[1fr_2.5rem] items-center gap-2">
                      <Bar value={calls.podium[d.code] ?? 0} colour={teamColour(d.constructor_id)} />
                      <span className="telemetry text-right">{pct(calls.podium[d.code])}</span>
                    </span>
                  ) : (
                    <Redacted />
                  )}
                </td>
                <td className="telemetry py-2.5 text-right text-muted">
                  {show ? pct(calls.winner.probabilities[d.code]) : <span aria-hidden="true">··</span>}
                </td>
                {withFinish && (
                  <td className="telemetry py-2.5 pr-3 text-right sm:pr-4">
                    <span className={onPodium ? 'font-semibold text-text' : 'text-muted'}>
                      {finishLabel(score.result.finish[d.code])}
                    </span>
                  </td>
                )}
                {!withFinish && <td aria-hidden="true" />}
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
