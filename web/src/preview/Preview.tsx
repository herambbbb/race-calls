// Dev-only gallery of every page state, for design review. Never in the production
// build: App only routes here when import.meta.env.DEV.
import { Link, useParams } from 'react-router'
import { Banner } from '../components/Banner'
import { CALENDAR } from '../data/calendar'
import { Landing } from '../pages/Landing'
import { Season } from '../pages/Season'
import { NotFound } from '../pages/NotFound'
import { RaceView } from '../pages/RaceView'
import { UpcomingRace } from '../pages/UpcomingRace'
import { asLive, BACKTESTS, midSeason, R14, sampleScore } from './fixtures'

const STATES: [string, string][] = [
  ['landing-mid', 'Front page, mid-season (4 replayed races, one late)'],
  ['season-empty', 'Season page, before the first live race (real data)'],
  ['season-mid', 'Season page, mid-season (4 replayed races, one late)'],
  ['upcoming', 'Race page: upcoming, no call yet'],
  ['predicted', 'Race page: called, before the race'],
  ['scored', 'Race page: scored'],
  ['late', 'Race page: late, published and not scored'],
  ['no-prediction', 'Race page: no prediction'],
  ['failed', 'Race page: failed'],
  ['backtest', 'Race page: backtest, scored'],
]

function State({ state }: { state: string }) {
  if (!R14) return <p className="p-6">Backtest round 14 is missing from predictions/.</p>
  const live = asLive(R14)
  switch (state) {
    case 'landing-mid': {
      const { records, scores, at } = midSeason()
      return <Landing records={[...records, ...BACKTESTS]} scores={scores} at={at} />
    }
    case 'season-empty':
      return <Season />
    case 'season-mid': {
      const { records, scores, at } = midSeason()
      return <Season records={[...records, ...BACKTESTS]} scores={scores} at={at} />
    }
    case 'upcoming':
      return <UpcomingRace race={CALENDAR[0]!} at={Date.parse('2026-10-01T09:00:00Z')} />
    case 'predicted':
      return <RaceView entry={live} />
    case 'scored':
      return <RaceView entry={live} score={sampleScore(live.record)} />
    case 'late': {
      const late = asLive(R14, { late: true, made_at: new Date(Date.parse(R14.record.race_start) + 600_000).toISOString() })
      return <RaceView entry={late} score={sampleScore(late.record)} />
    }
    case 'no-prediction':
      return <RaceView entry={asLive(R14, { status: 'no_prediction', calls: null, jev: null })} />
    case 'failed':
      return <RaceView entry={asLive(R14, { status: 'failed', calls: null, error: 'HTTP 520' })} />
    case 'backtest':
      return <RaceView entry={R14} score={sampleScore(R14.record)} />
    default:
      return <NotFound />
  }
}

export function Preview() {
  const { state } = useParams()
  return (
    <div>
      <div className="mx-auto max-w-6xl px-4 pt-4 sm:px-6">
        <Banner tone="amber" label="Design preview">
          Dev only. Round 14 outcomes and the Jev and grid scores are real; the form baseline and chaos levels are
          placeholders.{' '}
          <Link to="/preview" className="text-link underline underline-offset-2">
            All states
          </Link>
        </Banner>
      </div>
      {state ? (
        <State state={state} />
      ) : (
        <div className="mx-auto max-w-6xl space-y-6 px-4 py-10 sm:px-6">
          <h1 className="font-display text-6xl">Every state</h1>
          <ul className="grid gap-2 sm:grid-cols-2">
            {STATES.map(([key, label]) => (
              <li key={key}>
                <Link to={`/preview/${key}`} className="block rounded-xl border border-line bg-panel px-4 py-3 hover:bg-raised">
                  <span className="tag block text-muted">{key}</span>
                  {label}
                </Link>
              </li>
            ))}
          </ul>
          <button
            type="button"
            className="rounded-full border border-line px-4 py-2 text-sm text-muted hover:text-text"
            onClick={() => window.sessionStorage.clear()}
          >
            Reset the spoiler guard
          </button>
        </div>
      )}
    </div>
  )
}
