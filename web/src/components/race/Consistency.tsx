// Two checks on the raw answers: how far the podium chances sum from three, and any
// driver given a higher win chance than podium chance (which cannot happen).
import { pct } from '../../data/format'
import type { Calls, RecordDriver } from '../../data/types'

export function Consistency({ calls, drivers }: { calls: Calls; drivers: RecordDriver[] }) {
  const podium = calls.podium
  const win = calls.winner.probabilities
  const sum = Object.values(podium).reduce((a, b) => a + b, 0)
  const inconsistent = drivers.filter((d) => {
    const w = win[d.code]
    const p = podium[d.code]
    return w !== undefined && p !== undefined && w > p
  })
  const scale = (v: number) => `${(Math.min(5, Math.max(0, v)) / 5) * 100}%`

  return (
    <div className="grid gap-3 md:grid-cols-2">
      <div className="rounded-2xl border border-line bg-panel p-5">
        <p className="tag text-muted">Check 1 · Podium sum</p>
        <p className="telemetry mt-3 text-sm">
          Podium chances sum to <span className="text-2xl font-semibold text-text">{sum.toFixed(2)}</span> (the true
          number is 3).
        </p>
        <div aria-hidden="true" className="relative mt-6 mb-2 h-2 rounded-full bg-raised">
          <span className="absolute inset-y-0 left-0 rounded-full bg-muted/60" style={{ width: scale(sum) }} />
          <span className="absolute -top-2 h-6 w-0.5 bg-sector-purple" style={{ left: scale(3) }} />
          <span className="tag absolute -top-6 -translate-x-1/2 text-sector-purple" style={{ left: scale(3) }}>
            3
          </span>
        </div>
        <p className="mt-3 text-xs leading-relaxed text-muted">
          Each chance is a separate yes or no call, so they need not add up. Exactly three drivers finish on the podium.
        </p>
      </div>
      <div className="rounded-2xl border border-line bg-panel p-5">
        <p className="tag text-muted">Check 2 · Win above podium</p>
        {inconsistent.length > 0 ? (
          <div className="mt-3 text-sm">
            <p className="flex items-center gap-2">
              <span aria-hidden="true" className="size-2 rotate-45 bg-flag-red" />
              Flagged: a higher win chance than podium chance is impossible, for
            </p>
            <ul className="mt-2 space-y-1">
              {inconsistent.map((d) => (
                <li key={d.code} className="telemetry rounded-md bg-raised px-3 py-1.5">
                  {d.name}: win {pct(win[d.code])}, podium {pct(podium[d.code])}
                </li>
              ))}
            </ul>
          </div>
        ) : (
          <p className="mt-3 flex items-center gap-2 text-sm">
            <span aria-hidden="true" className="size-2 rotate-45 bg-sector-green" />
            No driver's win chance is higher than their podium chance.
          </p>
        )}
      </div>
    </div>
  )
}
