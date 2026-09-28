// After the flag: what really happened, the scorecard printed on paper with Jev and
// both baselines side by side, and every driver's podium chance next to the outcome,
// so a confident miss is as plain as a hit.
import { finishLabel, formatUtc, pct } from '../../data/format'
import { podiumPick } from '../../data/record'
import { best, CONTENDER_LABEL, CONTENDER_SHORT, METRICS } from '../../data/scorecard'
import { CONTENDERS, type ScoreRecord } from '../../data/scores'
import { driverLookup } from '../../data/record'
import type { Calls, RecordDriver } from '../../data/types'
import { Stamp } from '../Stamp'
import { teamName } from '../../data/teams'
import { TeamSwatch } from '../TeamSwatch'

function ResultPodium({ score, drivers }: { score: ScoreRecord; drivers: RecordDriver[] }) {
  const byCode = driverLookup(drivers)
  return (
    <ol aria-label="Actual podium" className="grid gap-2 sm:grid-cols-3">
      {score.result.podium.map((code, i) => {
        const d = byCode.get(code)
        return (
          <li key={code} className={`flex items-center gap-3 rounded-xl border border-line px-4 py-3 ${i === 0 ? 'bg-text text-ink' : 'bg-panel'}`}>
            <span className="font-display text-4xl leading-none">P{i + 1}</span>
            <span className="min-w-0">
              <span className="flex items-center gap-2 font-medium">
                {d && <TeamSwatch constructorId={d.constructor_id} />}
                <span className="truncate">{d?.name ?? code}</span>
              </span>
              <span className={`block truncate text-xs ${i === 0 ? 'text-ink/70' : 'text-muted'}`}>{d && teamName(d.constructor)}</span>
            </span>
          </li>
        )
      })}
    </ol>
  )
}

function Scorecard({ score, round }: { score: ScoreRecord; round: number }) {
  const jev = score.scores.jev
  return (
    <div className="paper on-paper relative overflow-hidden rounded-[22px] p-5 shadow-[0_30px_60px_-30px_rgb(0_0_0/0.8)] sm:p-8" data-testid="scorecard">
      <div className="flex flex-wrap items-start justify-between gap-4 border-b-2 border-print pb-4">
        <div>
          <p className="tag text-print-muted">Scorecard // round {round}</p>
          <p className="mt-1 font-display text-4xl leading-none sm:text-5xl">
            How the call <span className="italic">held up</span>
          </p>
          <p className="telemetry mt-2 text-xs text-print-muted">Scored {formatUtc(score.scored_at)}</p>
        </div>
        <div className="flex flex-wrap gap-2 pt-1">
          <Stamp tone={jev.winner_hit ? 'ink' : 'cobalt'} tilt={-7}>
            Winner {jev.winner_hit ? 'hit' : 'miss'}
          </Stamp>
          <Stamp tone="ink" tilt={4}>
            Podium {jev.podium_hits}/3
          </Stamp>
        </div>
      </div>
      <table className="mt-2 w-full table-fixed border-collapse text-sm">
        <thead>
          <tr className="tag text-left text-print-muted">
            <th scope="col" className="py-3 pr-2 font-normal">
              Measure
            </th>
            {CONTENDERS.map((c) => (
              <th key={c} scope="col" className="w-[20%] py-3 text-right font-normal sm:w-[16%]">
                <span aria-hidden="true" className="sm:hidden">{CONTENDER_SHORT[c]}</span>
                <span className="sr-only sm:not-sr-only">{CONTENDER_LABEL[c]}</span>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {METRICS.map((metric) => {
            const top = best(metric, score.scores)
            return (
              <tr key={metric.label} className="border-t border-print/15 align-top">
                <th scope="row" className="py-3 pr-2 text-left font-normal">
                  <span className="block font-semibold">{metric.label}</span>
                  <span className="mt-0.5 block text-xs leading-snug text-print-muted">{metric.explain}</span>
                </th>
                {CONTENDERS.map((c) => (
                  <td key={c} className="telemetry py-3 text-right">
                    <span className={c === 'jev' ? 'font-semibold' : ''}>{metric.show(score.scores[c])}</span>
                    {top.has(c) && (
                      <span className="tag mt-1 ml-auto block w-fit rounded-full bg-sector-purple px-1.5 text-print">Best</span>
                    )}
                  </td>
                ))}
              </tr>
            )
          })}
        </tbody>
      </table>
      <p className="mt-4 text-xs leading-relaxed text-print-muted">
        One race is a tiny sample; a single safety car can swing every number here. The grid baseline uses how often each
        starting slot reached the podium from 2014 to 2025; the form baseline uses recent finishes.
      </p>
    </div>
  )
}

function CalledVsActual({ calls, drivers, score }: { calls: Calls; drivers: RecordDriver[]; score: ScoreRecord }) {
  const byCode = driverLookup(drivers)
  const top3 = new Set(score.result.podium)
  const picked = new Set(podiumPick(calls.podium).map(([c]) => c))
  const rows = Object.entries(calls.podium).sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1))
  return (
    <ol aria-label="Podium chance against the result" className="space-y-1" data-testid="called-vs-actual">
      {rows.map(([code, p]) => {
        const d = byCode.get(code)
        const made = top3.has(code)
        const verdict =
          p >= 0.5 && !made ? 'Confident miss' : p < 0.2 && made ? 'Surprise podium' : made ? 'On podium' : null
        return (
          <li key={code} className={`grid grid-cols-[3rem_1fr_3rem_4.5rem] items-center gap-2 rounded-lg px-2 py-1.5 text-sm sm:grid-cols-[10rem_1fr_3rem_9rem] sm:gap-3 ${made ? 'bg-sector-purple/[0.08]' : ''}`}>
            <span className="flex min-w-0 items-center gap-2">
              {d && <TeamSwatch constructorId={d.constructor_id} />}
              <span className="font-medium sm:hidden">{code}</span>
              <span className="hidden truncate sm:inline">{d?.name ?? code}</span>
            </span>
            <span aria-hidden="true" className="relative h-5 rounded-[3px] bg-raised">
              <span className={`absolute inset-y-0 left-0 rounded-[3px] ${made ? 'bg-sector-purple' : 'bg-muted/45'}`} style={{ width: `${p * 100}%` }} />
              {picked.has(code) && <span className="tag absolute inset-y-0 right-1.5 grid place-items-center text-muted">Pick</span>}
            </span>
            <span className="telemetry text-right">{pct(p)}</span>
            <span className="text-right text-xs sm:text-left">
              <span className={`telemetry ${made ? 'font-semibold' : 'text-muted'}`}>{finishLabel(score.result.finish[code])}</span>
              {verdict && (
                <span className={`tag block sm:ml-2 sm:inline ${verdict === 'Confident miss' ? 'text-sector-amber' : 'text-sector-purple'}`}>{verdict}</span>
              )}
            </span>
          </li>
        )
      })}
    </ol>
  )
}

export function AfterRace({ calls, drivers, score, round }: { calls: Calls; drivers: RecordDriver[]; score: ScoreRecord; round: number }) {
  return (
    <div className="space-y-10">
      <div className="space-y-3">
        <h3 className="tag text-muted">The real podium</h3>
        <ResultPodium score={score} drivers={drivers} />
      </div>
      <Scorecard score={score} round={round} />
      <div className="space-y-3">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h3 className="font-display text-3xl">Called against what happened</h3>
          <p className="text-xs text-muted">
            Purple: finished on the podium. "Pick": one of Jev's three.
          </p>
        </div>
        <CalledVsActual calls={calls} drivers={drivers} score={score} />
      </div>
    </div>
  )
}

