// The technical board: every scored race with each side's measures, then the means over
// all of them, and Jev's own consistency checks beside its row. On a phone the table
// scrolls inside its own frame with the race and side pinned, so the page never does.
import { pct, score as fmt } from '../../data/format'
import { best, CONTENDER_LABEL, CONTENDER_SHORT, EXPLAIN, METRICS } from '../../data/scorecard'
import { CONTENDERS, type Contender } from '../../data/scores'
import type { Standing } from '../../data/season'
import { bestSides, type TechnicalRace, type TechnicalSummary } from '../../data/technical'
import type { Scope } from './Leaderboard'

function BestTag() {
  return <span className="tag ml-1.5 rounded-full bg-sector-purple px-1.5 align-middle text-ink">Best</span>
}

interface Total {
  value: (s: Standing) => number | null
  format: (v: number, races: number) => string
  better: 'lower' | 'higher'
  /** Shown when a side has no figure. */
  none?: string
}

/** The means and totals, in the same order as METRICS. */
const TOTALS: Total[] = [
  { value: (s) => s.podium_brier, format: (v) => fmt(v), better: 'lower' },
  { value: (s) => s.winner_log_loss, format: (v) => fmt(v, 2), better: 'lower' },
  { value: (s) => s.winner_hits, format: (v, races) => `${v}/${races}`, better: 'higher' },
  { value: (s) => s.podium_hits, format: (v, races) => `${v}/${races * 3}`, better: 'higher' },
  { value: (s) => s.chaos_mae, format: (v) => fmt(v, 2), better: 'lower', none: 'No call' },
]

const showTotal = (t: Total, s: Standing) => {
  const v = t.value(s)
  return v === null ? (t.none ?? '-') : t.format(v, s.races)
}

const JEV_ONLY: { label: string; short: string; explain: string }[] = [
  {
    label: 'Podium sum',
    short: 'Sum',
    explain: "Jev's podium chances added up. Exactly three drivers finish on the podium, so the true total is 3.",
  },
  {
    label: 'Win above podium',
    short: 'Win > pod',
    explain: 'Drivers given a higher win chance than podium chance, which cannot happen. 0 is right.',
  },
  {
    label: 'Pick confidence',
    short: 'Conf',
    explain: "Jev's own stated confidence in its winner pick, reported beside the win chance it gave that driver.",
  },
]

const SCOPE = {
  live: {
    caption: 'Technical board over the live races',
    empty: 'No live race scored yet. Each live race gets its row here the day after it runs.',
  },
  backtest: { caption: 'Technical board over the backtests', empty: 'No backtest has been scored yet.' },
} as const

const cell = 'telemetry px-3 py-2.5 text-right whitespace-nowrap'
// The race and the side stay pinned on the left while the rest scrolls; opaque so
// figures pass beneath them cleanly.
const pinned = 'sticky left-0 z-10 w-28 min-w-28 px-4 text-left align-top font-normal sm:w-44 sm:min-w-44'
const pinnedSide =
  'sticky left-28 z-10 w-20 min-w-20 px-3 text-left whitespace-nowrap shadow-[1px_0_0_var(--color-line)] sm:left-44 sm:w-40 sm:min-w-40'

function SideLabel({ contender }: { contender: Contender }) {
  return (
    <span className="flex items-center gap-2">
      <span aria-hidden="true" className={`size-2 rounded-full ${contender === 'jev' ? 'bg-star' : 'bg-muted'}`} />
      <span aria-hidden="true" className="sm:hidden">
        {CONTENDER_SHORT[contender]}
      </span>
      <span className="sr-only sm:not-sr-only">{CONTENDER_LABEL[contender]}</span>
    </span>
  )
}

function RaceRows({ race }: { race: TechnicalRace }) {
  const top = METRICS.map((m) => best(m, race.scores))
  const extras = [
    race.podium_sum === null ? '-' : fmt(race.podium_sum, 2),
    race.win_above_podium === null ? '-' : String(race.win_above_podium),
    race.winner_confidence === null ? '-' : pct(race.winner_confidence),
  ]
  return (
    <tbody className="border-t border-line">
      {CONTENDERS.map((c, row) => (
        <tr key={c} className="border-t border-line/40 first:border-0">
          {row === 0 && (
            <th scope="rowgroup" rowSpan={CONTENDERS.length} className={`${pinned} bg-panel py-2.5`}>
              <span className="tag block text-muted">Round {String(race.round).padStart(2, '0')}</span>
              <span className="mt-0.5 block text-sm leading-tight font-medium">{race.race_name}</span>
            </th>
          )}
          <th scope="row" className={`${pinnedSide} bg-panel py-2.5 font-medium`}>
            <SideLabel contender={c} />
          </th>
          {METRICS.map((m, i) => (
            <td key={m.label} className={cell}>
              {m.show(race.scores[c])}
              {top[i]!.has(c) && <BestTag />}
            </td>
          ))}
          {extras.map((v, i) => (
            <td key={JEV_ONLY[i]!.label} className={`${cell} ${c === 'jev' ? '' : 'text-muted'}`}>
              {c === 'jev' ? v : <span aria-label="Jev only">-</span>}
            </td>
          ))}
        </tr>
      ))}
    </tbody>
  )
}

function TotalRows({ summary }: { summary: TechnicalSummary }) {
  const { standings } = summary
  const races = standings[0]?.races ?? 0
  const top = TOTALS.map((t) =>
    bestSides(
      Object.fromEntries(standings.map((s) => [s.contender, t.value(s)])) as Record<Contender, number | null>,
      t.better,
      (v) => t.format(v, races),
    ),
  )
  const extras = [fmt(summary.podium_sum, 2), fmt(summary.win_above_podium, 1), summary.winner_confidence === null ? '-' : pct(summary.winner_confidence)]
  return (
    <tbody className="border-t-2 border-line bg-raised">
      {standings.map((s, row) => (
        <tr key={s.contender} className="border-t border-line/40 first:border-0">
          {row === 0 && (
            <th scope="rowgroup" rowSpan={standings.length} className={`${pinned} bg-raised py-2.5`}>
              <span className="tag block text-muted">All {summary.races.length}</span>
              <span className="mt-0.5 block text-sm leading-tight font-medium">Means, hits as totals</span>
            </th>
          )}
          <th scope="row" className={`${pinnedSide} bg-raised py-2.5 font-medium`}>
            <SideLabel contender={s.contender} />
          </th>
          {TOTALS.map((t, i) => (
            <td key={METRICS[i]!.label} className={cell}>
              {showTotal(t, s)}
              {top[i]!.has(s.contender) && <BestTag />}
            </td>
          ))}
          {extras.map((v, i) => (
            <td key={JEV_ONLY[i]!.label} className={`${cell} ${s.contender === 'jev' ? '' : 'text-muted'}`}>
              {s.contender === 'jev' ? v : <span aria-label="Jev only">-</span>}
            </td>
          ))}
        </tr>
      ))}
    </tbody>
  )
}

const DEFINITIONS: { label: string; explain: string }[] = [
  { label: 'Podium Brier', explain: EXPLAIN.podium_brier },
  { label: 'Winner log loss', explain: EXPLAIN.winner_log_loss },
  { label: 'Winner pick', explain: `Hit or miss in each race. ${EXPLAIN.winner_hits} The total counts them.` },
  { label: 'Podium picks right', explain: `${EXPLAIN.podium_hits} 0 to 3 a race; the total is out of three per race.` },
  { label: 'Chaos error', explain: `${EXPLAIN.chaos_error} The baselines make no chaos call.` },
  ...JEV_ONLY,
  {
    label: 'Podium calibration error',
    explain:
      'Lower is better. Every podium chance goes in one of the same ten bands as the calibration chart; this is the gap between said and happened in each band, weighted by how many calls it holds. 0 is perfectly calibrated.',
  },
  { label: 'Best', explain: 'The best side on that measure in that row. No tag when every side ties or only one side has a figure.' },
]

export function TechnicalBoard({ summary, scope = 'live' }: { summary: TechnicalSummary; scope?: Scope }) {
  const { races } = summary
  return (
    <div className="overflow-hidden rounded-[22px] border border-line bg-panel">
      {races.length === 0 ? (
        <p className="p-6 text-sm leading-relaxed text-muted" data-testid="technical-empty">
          {SCOPE[scope].empty}
        </p>
      ) : (
        <>
          <div role="region" aria-label={SCOPE[scope].caption} tabIndex={0} className="overflow-x-auto overscroll-x-contain focus-visible:outline-2 focus-visible:outline-star">
            <table className="w-full min-w-[60rem] border-collapse text-sm">
              <caption className="sr-only">
                {SCOPE[scope].caption}: {races.length} races, each with Jev and both baselines, then the means
              </caption>
              <thead>
                <tr className="tag text-left text-muted">
                  <td className={`${pinned} bg-panel`} />
                  <td className={`${pinnedSide} bg-panel`} />
                  <th scope="colgroup" colSpan={METRICS.length} className="px-3 pt-3 text-center font-normal">
                    <span className="block border-b border-line pb-1">Every side</span>
                  </th>
                  <th scope="colgroup" colSpan={JEV_ONLY.length} className="px-3 pt-3 text-center font-normal">
                    <span className="block border-b border-star/60 pb-1 text-star">Jev only</span>
                  </th>
                </tr>
                <tr className="tag border-b border-line text-left text-muted">
                  <th scope="col" className={`${pinned} bg-panel py-3`}>
                    Race
                  </th>
                  <th scope="col" className={`${pinnedSide} bg-panel py-3 font-normal`}>
                    Side
                  </th>
                  {METRICS.map((m) => (
                    <th key={m.label} scope="col" className="px-3 py-3 text-right font-normal">
                      {m.label}
                    </th>
                  ))}
                  {JEV_ONLY.map((m) => (
                    <th key={m.label} scope="col" className="px-3 py-3 text-right font-normal">
                      {m.label}
                    </th>
                  ))}
                </tr>
              </thead>
              {races.map((r) => (
                <RaceRows key={`${r.season}-${r.round}`} race={r} />
              ))}
              <TotalRows summary={summary} />
            </table>
          </div>
          <p className="flex flex-wrap items-baseline gap-x-3 gap-y-1 border-t border-line px-5 py-4 text-sm" data-testid="podium-ece">
            <span className="tag text-muted">Jev podium calibration error</span>
            <span className="telemetry text-2xl font-semibold">{fmt(summary.ece)}</span>
            <span className="text-muted">
              over {summary.podium_calls} podium chances from {races.length} races
            </span>
          </p>
        </>
      )}
      <div className="border-t border-line bg-ink/40 p-5">
        <h3 className="tag text-muted">How to read this</h3>
        <dl className="mt-3 grid gap-x-6 gap-y-3 text-xs leading-relaxed sm:grid-cols-2 lg:grid-cols-3">
          {DEFINITIONS.map((d) => (
            <div key={d.label}>
              <dt className="font-semibold text-text">{d.label}</dt>
              <dd className="text-muted">{d.explain}</dd>
            </div>
          ))}
        </dl>
      </div>
    </div>
  )
}
