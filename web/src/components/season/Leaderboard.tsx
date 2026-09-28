// The season leaderboard: Jev against both baselines over live races only, with the
// number of races counted as the loudest thing on it, so a small sample looks small.
import { score as fmt } from '../../data/format'
import type { Contender } from '../../data/scores'
import type { Standing } from '../../data/season'
import { CONTENDER_LABEL } from '../../data/scorecard'

interface Column {
  label: string
  short: string
  explain: string
  value: (s: Standing) => number | null
  show: (s: Standing) => string
  better: 'lower' | 'higher'
}

const COLUMNS: Column[] = [
  {
    label: 'Podium Brier',
    short: 'Brier',
    explain: 'Lower is better. The average squared gap between each podium chance and what happened. Saying 14% for everyone scores about 0.12.',
    value: (s) => s.podium_brier,
    show: (s) => fmt(s.podium_brier),
    better: 'lower',
  },
  {
    label: 'Winner log loss',
    short: 'Log loss',
    explain: 'Lower is better. How surprised the call was by the real winner: 0.69 means it gave the winner 50%, 2.30 means 10%.',
    value: (s) => s.winner_log_loss,
    show: (s) => fmt(s.winner_log_loss, 2),
    better: 'lower',
  },
  {
    label: 'Winner picks right',
    short: 'Winners',
    explain: 'Races where the most likely winner won.',
    value: (s) => (s.races ? s.winner_hits : null),
    show: (s) => (s.races ? `${s.winner_hits}/${s.races}` : '-'),
    better: 'higher',
  },
  {
    label: 'Podium picks right',
    short: 'Podiums',
    explain: 'Of the three drivers called for the podium in each race.',
    value: (s) => (s.races ? s.podium_hits : null),
    show: (s) => (s.races ? `${s.podium_hits}/${s.races * 3}` : '-'),
    better: 'higher',
  },
  {
    label: 'Chaos error',
    short: 'Chaos',
    explain: 'Lower is better. Average distance from the actual level, 0 to 4.',
    value: (s) => s.chaos_mae,
    show: (s) => (s.races && s.chaos_mae === null ? 'No call' : fmt(s.chaos_mae, 2)),
    better: 'lower',
  },
]

function bestOf(column: Column, standings: Standing[]): Set<Contender> {
  const values = standings.flatMap((s) => {
    const v = column.value(s)
    return v === null ? [] : [[s.contender, v] as const]
  })
  if (values.length < 2) return new Set()
  const target = column.better === 'lower' ? Math.min(...values.map(([, v]) => v)) : Math.max(...values.map(([, v]) => v))
  // Ties are judged on the figures as shown.
  const byContender = new Map(standings.map((s) => [s.contender, column.show(s)]))
  const winner = values.find(([, v]) => v === target)![0]
  const top = values.filter(([c]) => byContender.get(c) === byContender.get(winner)).map(([c]) => c)
  return new Set(top.length === values.length ? [] : top)
}

function BestTag() {
  return <span className="tag ml-1.5 rounded-full bg-sector-purple px-1.5 align-middle text-ink">Best</span>
}

export function Leaderboard({ standings, total }: { standings: Standing[]; total: number }) {
  const races = standings[0]?.races ?? 0
  const best = COLUMNS.map((c) => bestOf(c, standings))
  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,4fr)_minmax(0,8fr)]">
      <div className="relative overflow-hidden rounded-[22px] border border-line bg-panel p-6">
        <p className="tag text-muted">Live races counted</p>
        <p className="mt-2 flex items-baseline gap-3" data-testid="races-counted">
          <span className="telemetry text-8xl leading-none font-semibold tracking-tighter">{races}</span>
          <span className="text-muted">of {total}</span>
        </p>
        <ol aria-hidden="true" className="mt-5 flex gap-1.5">
          {Array.from({ length: total }, (_, i) => (
            <li key={i} className={`h-8 flex-1 rounded-[3px] ${i < races ? 'bg-sector-purple' : 'hatch border border-line text-muted'}`} />
          ))}
        </ol>
        <p className="mt-5 text-sm leading-relaxed text-muted">
          {races === 0
            ? 'Nothing counted yet. The leaderboard fills in the day after each live race.'
            : races < 5
              ? `Over ${races} live race${races === 1 ? '' : 's'}: far too few to separate skill from luck. Read these as early form.`
              : `Over ${races} live races. Still a small sample; one chaotic race can move every number.`}
        </p>
        <p className="mt-3 text-xs text-muted">Backtests and late calls never count.</p>
      </div>

      <div className="overflow-hidden rounded-[22px] border border-line bg-panel">
        {/* Wide screens: a table. */}
        <table className="hidden w-full border-collapse text-sm sm:table">
          <caption className="sr-only">Season leaderboard over {races} live races</caption>
          <thead>
            <tr className="tag border-b border-line text-left text-muted">
              <th scope="col" className="px-5 py-3 font-normal">
                Side
              </th>
              {COLUMNS.map((c) => (
                <th key={c.label} scope="col" className="px-3 py-3 text-right font-normal">
                  <abbr title={c.label} className="no-underline">
                    {c.short}
                  </abbr>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {standings.map((s) => (
              <tr key={s.contender} className="border-b border-line/60 last:border-0">
                <th scope="row" className="px-5 py-4 text-left font-medium">
                  <span className="flex items-center gap-2">
                    <span aria-hidden="true" className={`size-2 rounded-full ${s.contender === 'jev' ? 'bg-star' : 'bg-muted'}`} />
                    {CONTENDER_LABEL[s.contender]}
                  </span>
                </th>
                {COLUMNS.map((c, i) => (
                  <td key={c.label} className="telemetry px-3 py-4 text-right whitespace-nowrap">
                    {c.show(s)}
                    {best[i]!.has(s.contender) && <BestTag />}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
        {/* Phones: one card per side. */}
        <ul className="divide-y divide-line sm:hidden">
          {standings.map((s) => (
            <li key={s.contender} className="p-5">
              <p className="flex items-center gap-2 font-medium">
                <span aria-hidden="true" className={`size-2 rounded-full ${s.contender === 'jev' ? 'bg-star' : 'bg-muted'}`} />
                {CONTENDER_LABEL[s.contender]}
              </p>
              <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
                {COLUMNS.map((c, i) => (
                  <div key={c.label}>
                    <dt className="tag text-muted">{c.label}</dt>
                    <dd className="telemetry">
                      {c.show(s)}
                      {best[i]!.has(s.contender) && <BestTag />}
                    </dd>
                  </div>
                ))}
              </dl>
            </li>
          ))}
        </ul>
        <dl className="grid gap-x-6 gap-y-3 border-t border-line bg-ink/40 p-5 text-xs leading-relaxed sm:grid-cols-2">
          {COLUMNS.map((c) => (
            <div key={c.label}>
              <dt className="font-semibold text-text">{c.label}</dt>
              <dd className="text-muted">{c.explain}</dd>
            </div>
          ))}
        </dl>
      </div>
    </div>
  )
}
