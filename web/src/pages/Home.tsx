// Home: every race with a record, live calls first, then the backtests.
// The season page (task 5.2: leaderboard, calibration, every race with its status)
// replaces the live list in <SeasonSummary />.
import { Link } from 'react-router'
import { useDocumentTitle } from '../components/useDocumentTitle'
import { formatDate } from '../data/format'
import { byKind, RECORDS } from '../data/load'
import type { LoadedRecord, PredictionRecord } from '../data/types'

export function Home({ records = RECORDS }: { records?: LoadedRecord[] }) {
  useDocumentTitle(null)
  const live = byKind(records, 'live')
  const backtests = byKind(records, 'backtest')
  return (
    <div className="space-y-10">
      <header className="space-y-2">
        <h1 className="font-display text-4xl leading-tight sm:text-5xl">Race Calls</h1>
        <p className="max-w-prose text-muted">
          Jev's calls for every race, published before lights out and scored after the flag.
        </p>
      </header>

      <SeasonSummary />

      <section aria-labelledby="live-heading" className="space-y-3">
        <h2 id="live-heading" className="text-xs tracking-widest text-muted uppercase">
          Calls
        </h2>
        {live.length > 0 ? (
          <RaceList records={live} base="race" />
        ) : (
          <p className="text-sm text-muted">No live calls yet. The first one lands after the next qualifying session.</p>
        )}
      </section>

      {backtests.length > 0 && (
        <section aria-labelledby="backtest-heading" className="space-y-3">
          <div>
            <h2 id="backtest-heading" className="text-xs tracking-widest text-muted uppercase">
              Backtests
            </h2>
            <p className="mt-1 text-sm text-muted">
              Past races run to test the pipeline: the model may have seen these results.
            </p>
          </div>
          <RaceList records={backtests} base="backtest" />
        </section>
      )}
    </div>
  )
}

/** Placeholder for the season page's leaderboard and calibration (task 5.2). */
function SeasonSummary() {
  return null
}

function statusLabel(r: PredictionRecord): string {
  if (r.status === 'no_prediction') return 'No prediction'
  if (r.status === 'failed') return 'Failed'
  return r.late ? 'Late, not scored' : 'Called'
}

function RaceList({ records, base }: { records: LoadedRecord[]; base: 'race' | 'backtest' }) {
  return (
    <ul className="divide-y divide-line border-y border-line">
      {records.map(({ record: r, path }) => (
        <li key={path}>
          <Link
            to={`/${base}/${r.round}`}
            className="grid grid-cols-[2.5rem_1fr_auto] items-baseline gap-x-3 px-1 py-3 hover:bg-panel"
          >
            <span className="figures text-sm text-muted">R{r.round}</span>
            <span className="min-w-0">
              <span className="block truncate">{r.race_name}</span>
              <span className="figures block truncate text-xs text-muted">
                {r.circuit_name} · {formatDate(r.race_start)}
              </span>
            </span>
            <span className="text-xs text-muted">{statusLabel(r)}</span>
          </Link>
        </li>
      ))}
    </ul>
  )
}
