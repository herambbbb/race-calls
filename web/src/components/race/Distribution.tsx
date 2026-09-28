// The winner question in full: every driver's win chance, most likely first.
import type { CSSProperties } from 'react'
import { pct } from '../../data/format'
import { teamColour } from '../../data/teams'
import { driverLookup } from '../../data/record'
import type { Calls, RecordDriver } from '../../data/types'
import { Bar } from '../Bar'

export function Distribution({ calls, drivers, winner }: { calls: Calls; drivers: RecordDriver[]; winner?: string | undefined }) {
  const byCode = driverLookup(drivers)
  const rows = Object.entries(calls.winner.probabilities).sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1))
  return (
    <ol aria-label="Winner distribution" className="grid gap-x-10 gap-y-1.5 sm:grid-cols-2 sm:[grid-auto-flow:column] sm:[grid-template-rows:repeat(var(--rows),auto)]" style={{ '--rows': Math.ceil(rows.length / 2) } as CSSProperties}>
      {rows.map(([code, p]) => {
        const d = byCode.get(code)
        const won = winner === code
        return (
          <li key={code} className="grid grid-cols-[3rem_1fr_3rem] items-center gap-3 text-sm">
            <span className="font-medium" title={d?.name}>
              {code}
              {won && <span className="sr-only"> (won)</span>}
            </span>
            <span className="relative">
              <Bar value={p} colour={teamColour(d?.constructor_id ?? '')} />
              {won && <span aria-hidden="true" className="tag absolute -top-4 left-0 text-sector-purple">Won</span>}
            </span>
            <span className="telemetry text-right">{pct(p)}</span>
          </li>
        )
      })}
    </ol>
  )
}
