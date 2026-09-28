// One race, before the start: Jev's calls exactly as recorded, when they were made,
// and the link that proves it. The after-race half renders in <AfterRace />.
import { Link } from 'react-router'
import { Bar } from '../components/Bar'
import { Banner } from '../components/Banner'
import { TeamSwatch } from '../components/TeamSwatch'
import { commitHistoryUrl, formatLatency, formatLocal, formatUtc, formatUsd, pct } from '../data/format'
import { chaosCriteria } from '../data/record'
import { teamColour } from '../data/teams'
import type { Calls, JevMeta, LoadedRecord, PredictionRecord, RecordDriver } from '../data/types'

export function RaceView({ entry }: { entry: LoadedRecord }) {
  const { record, path } = entry
  const drivers = [...(record.drivers ?? [])].sort((a, b) => a.grid - b.grid)
  const calls = record.status === 'ok' ? (record.calls ?? null) : null

  return (
    <article className="space-y-8">
      <RaceHeader record={record} />
      <StatusBanners record={record} />
      <p className="text-sm text-muted">
        {calls ? 'Called at ' : 'Recorded at '}
        <time dateTime={record.made_at} className="figures text-text">
          {formatUtc(record.made_at)}
        </time>
        .{' '}
        <a href={commitHistoryUrl(path)} className="text-flag-blue underline underline-offset-2 hover:no-underline">
          See the commit history of this record
        </a>{' '}
        (GitHub shows when it was committed).
      </p>
      {calls && (
        <>
          <WinnerSection calls={calls} drivers={drivers} />
          <GridSection calls={calls} drivers={drivers} />
          <ChaosSection score={calls.chaos.score} criteria={chaosCriteria(record)} />
        </>
      )}
      <AfterRace record={record} />
      {record.jev && <SmallPrint jev={record.jev} requestHash={record.request_hash ?? null} />}
      <p>
        <Link to="/" className="text-sm text-muted underline underline-offset-2 hover:text-text">
          All races
        </Link>
      </p>
    </article>
  )
}

function RaceHeader({ record }: { record: PredictionRecord }) {
  return (
    <header className="space-y-2">
      <p className="figures text-xs tracking-widest text-muted uppercase">
        {record.kind === 'backtest' ? 'Backtest' : record.season} · Round {record.round}
      </p>
      <h1 className="font-display text-4xl leading-tight sm:text-5xl">{record.race_name}</h1>
      <p className="text-muted">{record.circuit_name}</p>
      <p className="figures text-sm">
        Lights out{' '}
        <time dateTime={record.race_start}>{formatUtc(record.race_start)}</time>
        <span className="text-muted"> · your time {formatLocal(record.race_start)}</span>
      </p>
    </header>
  )
}

function StatusBanners({ record }: { record: PredictionRecord }) {
  return (
    <div className="space-y-2">
      {record.kind === 'backtest' && <Banner tone="yellow">Backtest: the model may have seen these results.</Banner>}
      {record.status === 'ok' && record.late && (
        <Banner tone="yellow">Made after the start: published, not scored.</Banner>
      )}
      {record.status === 'ok' && !record.late && record.kind === 'live' && (
        <Banner tone="green">Called before lights out.</Banner>
      )}
      {record.status === 'no_prediction' && (
        <Banner tone="white">No prediction for this race: qualifying data did not arrive in time.</Banner>
      )}
      {record.status === 'failed' && (
        <Banner tone="red">The prediction failed, so there is no call for this race.</Banner>
      )}
      {record.status === 'ok' && (record.grid_provisional ?? true) && (
        <p className="text-sm text-muted">
          Provisional grid: penalties confirmed after the call may change the starting order.
        </p>
      )}
      {record.note && <p className="text-sm text-muted">{record.note}</p>}
    </div>
  )
}

function driverLookup(drivers: RecordDriver[]) {
  return new Map(drivers.map((d) => [d.code, d]))
}

function WinnerSection({ calls, drivers }: { calls: Calls; drivers: RecordDriver[] }) {
  const byCode = driverLookup(drivers)
  const { choice, probabilities } = calls.winner
  const pick = byCode.get(choice)
  const distribution = Object.entries(probabilities).sort((a, b) => b[1] - a[1])

  return (
    <section aria-labelledby="winner-heading" className="space-y-4">
      <h2 id="winner-heading" className="text-xs tracking-widest text-muted uppercase">
        Winner
      </h2>
      <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
        <p className="font-display text-3xl sm:text-4xl">{pick?.name ?? choice}</p>
        <p className="flex items-center gap-2 text-muted">
          {pick && <TeamSwatch constructorId={pick.constructor_id} />}
          {pick?.constructor}
        </p>
        <p className="figures text-2xl">{pct(probabilities[choice])}</p>
      </div>
      <ol aria-label="Winner distribution" className="space-y-1.5">
        {distribution.map(([code, p]) => {
          const d = byCode.get(code)
          return (
            <li key={code} className="grid grid-cols-[3.5rem_1fr_3rem] items-center gap-3 text-sm">
              <span className="font-medium" title={d?.name}>
                {code}
              </span>
              <Bar value={p} colour={teamColour(d?.constructor_id ?? '')} />
              <span className="figures text-right">{pct(p)}</span>
            </li>
          )
        })}
      </ol>
    </section>
  )
}

function GridSection({ calls, drivers }: { calls: Calls; drivers: RecordDriver[] }) {
  const podium = calls.podium
  const win = calls.winner.probabilities
  const sum = Object.values(podium).reduce((a, b) => a + b, 0)
  const inconsistent = drivers.filter((d) => {
    const w = win[d.code]
    const p = podium[d.code]
    return w !== undefined && p !== undefined && w > p
  })

  return (
    <section aria-labelledby="grid-heading" className="space-y-3">
      <h2 id="grid-heading" className="text-xs tracking-widest text-muted uppercase">
        Podium calls, in grid order
      </h2>
      <table className="w-full table-fixed border-collapse text-sm">
        <thead>
          <tr className="border-b border-line text-left text-xs text-muted">
            <th scope="col" className="w-10 py-2 font-normal">
              Grid
            </th>
            <th scope="col" className="py-2 font-normal">
              Driver
            </th>
            <th scope="col" className="hidden py-2 font-normal sm:table-cell">
              Team
            </th>
            <th scope="col" className="w-[38%] py-2 font-normal sm:w-[30%]">
              Podium
            </th>
            <th scope="col" className="w-12 py-2 text-right font-normal">
              Win
            </th>
          </tr>
        </thead>
        <tbody>
          {drivers.map((d) => (
            <tr key={d.code} className="border-b border-line/60" data-testid="grid-row">
              <td className="figures py-2 text-muted">{d.grid}</td>
              <td className="py-2">
                <span className="flex min-w-0 items-center gap-2">
                  <span className="sm:hidden">
                    <TeamSwatch constructorId={d.constructor_id} />
                  </span>
                  <span className="truncate">
                    <span className="font-medium sm:hidden">{d.code}</span>
                    <span className="hidden sm:inline">{d.name}</span>
                  </span>
                </span>
              </td>
              <td className="hidden py-2 sm:table-cell">
                <span className="flex min-w-0 items-center gap-2">
                  <TeamSwatch constructorId={d.constructor_id} />
                  <span className="truncate text-muted">{d.constructor}</span>
                </span>
              </td>
              <td className="py-2">
                <span className="grid grid-cols-[1fr_2.75rem] items-center gap-2">
                  <Bar value={podium[d.code] ?? 0} colour={teamColour(d.constructor_id)} />
                  <span className="figures text-right">{pct(podium[d.code])}</span>
                </span>
              </td>
              <td className="figures py-2 text-right text-muted">{pct(win[d.code])}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="figures text-sm text-muted">
        Podium probabilities sum to {sum.toFixed(2)} (three drivers finish on the podium). Each is an
        independent yes or no call.
      </p>
      {inconsistent.length > 0 ? (
        <div className="text-sm">
          <p className="text-muted">Inconsistent: win probability above podium probability for</p>
          <ul className="mt-1 list-disc pl-5">
            {inconsistent.map((d) => (
              <li key={d.code} className="figures">
                {d.name}: win {pct(win[d.code])}, podium {pct(podium[d.code])}
              </li>
            ))}
          </ul>
        </div>
      ) : (
        <p className="text-sm text-muted">No driver's win probability exceeds their podium probability.</p>
      )}
    </section>
  )
}

const LEVELS = [0, 1, 2, 3, 4]

function ChaosSection({ score, criteria }: { score: number; criteria: string[] }) {
  const clamped = Math.max(0, Math.min(4, score))
  const nearest = Math.round(clamped)
  return (
    <section aria-labelledby="chaos-heading" className="space-y-4">
      <h2 id="chaos-heading" className="text-xs tracking-widest text-muted uppercase">
        Chaos
      </h2>
      <p>
        <span className="figures font-display text-4xl">{clamped.toFixed(1)}</span>
        <span className="text-muted"> out of 4</span>
      </p>
      <div aria-hidden="true" className="relative pt-3">
        <span
          className="absolute top-0 h-2 w-0.5 -translate-x-1/2 bg-flag-yellow"
          style={{ left: `${((clamped + 0.5) / 5) * 100}%` }}
        />
        <span className="grid grid-cols-5 gap-1">
          {LEVELS.map((level) => (
            <span
              key={level}
              className={`h-2 rounded-[1px] ${level <= nearest ? 'bg-flag-yellow' : 'bg-raised'}`}
              style={level <= nearest ? { opacity: 0.35 + 0.65 * ((level + 1) / 5) } : undefined}
            />
          ))}
        </span>
        <span className="figures mt-1 grid grid-cols-5 text-xs text-muted">
          {LEVELS.map((level) => (
            <span key={level} className="text-center">
              {level}
            </span>
          ))}
        </span>
      </div>
      {criteria.length > 0 ? (
        <ol aria-label="Chaos rubric" className="space-y-1.5 text-sm">
          {criteria.map((line, i) => (
            <li key={line} className={i === nearest ? 'text-text' : 'text-muted'}>
              {line}
              {i === nearest && <span className="sr-only"> (nearest level)</span>}
            </li>
          ))}
        </ol>
      ) : (
        <p className="text-sm text-muted">The rubric was not recorded with this request.</p>
      )}
    </section>
  )
}

/**
 * AFTER-RACE slot (task 5.1, second half): results, the scorecard, and the baselines.
 * Renders nothing until scores are committed alongside the record.
 */
function AfterRace(_props: { record: PredictionRecord }) {
  return null
}

function SmallPrint({ jev, requestHash }: { jev: JevMeta; requestHash: string | null }) {
  const rows: [string, string][] = [
    ['Model', jev.model_id ?? jev.model_requested],
    ['Provider', jev.provider ?? '-'],
    ['Cost', jev.cost_usd === null ? '-' : formatUsd(jev.cost_usd)],
    ['Latency', formatLatency(jev.latency_ms)],
    ['Request hash (SHA-256)', requestHash ?? '-'],
  ]
  return (
    <section aria-labelledby="smallprint-heading" className="border-t border-line pt-4">
      <h2 id="smallprint-heading" className="sr-only">
        Request details
      </h2>
      <dl className="grid grid-cols-1 gap-x-6 gap-y-2 text-xs sm:grid-cols-[auto_1fr]">
        {rows.map(([label, value]) => (
          <div key={label} className="contents">
            <dt className="text-muted">{label}</dt>
            <dd className="figures [overflow-wrap:anywhere]">{value}</dd>
          </div>
        ))}
      </dl>
    </section>
  )
}
