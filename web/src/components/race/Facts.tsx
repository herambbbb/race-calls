// What Jev knew: the race briefing and each driver's fact line, exactly as sent. Jev
// answers with numbers only, so this is inputs, not reasons, and the page adds none.
import type { Facts as FactLines, RecordDriver } from '../../data/types'
import { teamName } from '../../data/teams'
import { TeamSwatch } from '../TeamSwatch'

export function Facts({ facts, drivers }: { facts: FactLines | null | undefined; drivers: RecordDriver[] }) {
  if (!facts) {
    return <p className="text-sm text-muted">The facts were not recorded with this call.</p>
  }
  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
      <div className="overflow-hidden rounded-2xl border border-line bg-panel lg:sticky lg:top-24 lg:self-start">
        <p className="tag flex items-center justify-between border-b border-line px-4 py-2.5 text-muted">
          <span>Briefing // race</span>
          <span aria-hidden="true" className="flex gap-1">
            <span className="size-1.5 rounded-full bg-line" />
            <span className="size-1.5 rounded-full bg-line" />
            <span className="size-1.5 rounded-full bg-star" />
          </span>
        </p>
        <ul className="space-y-2.5 p-4 text-sm leading-relaxed">
          {facts.race.map((line) => (
            <li key={line} className="grid grid-cols-[0.75rem_1fr] gap-2">
              <span aria-hidden="true" className="mt-2 h-px w-2 bg-muted" />
              <span>{line}</span>
            </li>
          ))}
        </ul>
      </div>
      <ul aria-label="Facts per driver" className="space-y-1.5">
        {drivers.map((d) => {
          const line = facts.drivers[d.code]
          if (!line) return null
          return (
            <li key={d.code}>
              <details className="group rounded-xl border border-line bg-panel transition-colors open:bg-raised/60">
                <summary className="flex items-center gap-3 px-4 py-3 text-sm">
                  <span className="telemetry w-6 text-muted">{d.grid}</span>
                  <TeamSwatch constructorId={d.constructor_id} />
                  <span className="min-w-0 flex-1 truncate">
                    <span className="font-medium">{d.name}</span>
                    <span className="text-muted"> · {teamName(d.constructor)}</span>
                  </span>
                  <span aria-hidden="true" className="tag text-muted transition-transform group-open:rotate-45">
                    +
                  </span>
                </summary>
                <div className="border-t border-line/70 px-4 pt-3 pb-4">
                  <p className="tag mb-2 flex items-center gap-2 text-star">
                    <span aria-hidden="true" className="flex h-3 items-end gap-px">
                      {[3, 7, 5, 9, 4].map((h, i) => (
                        <span key={i} className="w-0.5 bg-star" style={{ height: `${h + 3}px` }} />
                      ))}
                    </span>
                    Fact sheet // {d.code}
                  </p>
                  <p className="text-sm leading-relaxed">{line}</p>
                </div>
              </details>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
