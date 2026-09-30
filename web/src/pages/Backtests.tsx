// The backtests: past races run after the fact to test the pipeline, kept apart from the
// season and labelled, because the model may have seen these results. Their own
// leaderboard, technical board, calls against reality and calibration (never mixed with
// the live season), then each race as a poster tile with its circuit.
import { Link } from 'react-router'
import { TrackOutline } from '../components/art/TrackOutline'
import { PageHeader } from '../components/PageHeader'
import { RaceName } from '../components/RaceHero'
import { Section } from '../components/Section'
import { Calibration } from '../components/season/Calibration'
import { CallsVsReal } from '../components/season/CallsVsReal'
import { Leaderboard } from '../components/season/Leaderboard'
import { TechnicalBoard } from '../components/season/TechnicalBoard'
import { Uncertainty } from '../components/season/Uncertainty'
import { Stamp } from '../components/Stamp'
import { useDocumentTitle } from '../components/useDocumentTitle'
import { formatDay } from '../data/format'
import { backtestSpan, byKind, findScore, RECORDS, SCORES } from '../data/load'
import type { ScoreRecord } from '../data/scores'
import { leaderboard, podiumPairs, reliability } from '../data/season'
import { callsVsReal, technical } from '../data/technical'
import type { LoadedRecord } from '../data/types'

export function Backtests({ records = RECORDS, scores = SCORES }: { records?: LoadedRecord[]; scores?: ScoreRecord[] }) {
  useDocumentTitle('Backtests')
  const backtests = byKind(records, 'backtest')
  const first = backtests[0]?.record
  // Only calls that were made and scored count; late or failed ones never do.
  const scored = backtests.flatMap(({ record }) => {
    const score = record.status === 'ok' && !record.late ? findScore(record, scores) : undefined
    return score ? [{ record, score }] : []
  })
  const pairs = scored.flatMap(({ record, score }) => podiumPairs(record, score))
  return (
    <div>
      <PageHeader
        tone="paper"
        eyebrow="Backtests // never on the leaderboard"
        title={
          <>
            The first {backtests.length}, <span className="italic">after the fact</span>
          </>
        }
        intro={
          <>
            {backtestSpan(backtests)} were run after the races to test the pipeline end to end. Jev may have seen these
            results in training, so they are kept apart and never count on the season leaderboard. They get their own
            below.
          </>
        }
        art={
          first && (
            <div className="relative">
              <TrackOutline circuit={backtests.at(-1)!.record.circuit_name} className="h-64 w-full text-print" width={1.2} draw start />
              <Stamp tone="cobalt" tilt={-7} className="absolute bottom-2 left-0 text-sm">
                The model may have seen these results
              </Stamp>
            </div>
          )
        }
      />
      <div className="mx-auto mt-16 max-w-6xl space-y-24 px-4 sm:px-6">
        <Section
          id="backtest-leaderboard"
          index="01"
          label="Backtest leaderboard"
          title={
            <>
              Jev <span className="italic">against</span> the baselines, after the fact
            </>
          }
          intro="The same scoring as the season, over the backtests only. A plumbing check, not proof of skill."
        >
          <Leaderboard standings={leaderboard(scored.map((s) => s.score))} total={backtests.length} scope="backtest" />
          <Uncertainty className="mt-4" />
        </Section>
        <Section
          id="backtest-technical"
          index="02"
          label="Technical"
          title={
            <>
              Every backtest, <span className="italic">every measure</span>
            </>
          }
          intro="Each side's scores race by race, the means over all of them, and Jev's own consistency checks."
        >
          <TechnicalBoard summary={technical(scored)} scope="backtest" />
        </Section>
        <Section
          id="backtest-calls"
          index="03"
          label="Calls vs reality"
          title={
            <>
              What Jev said, <span className="italic">what happened</span>
            </>
          }
          intro="Every chance Jev gave, next to the real result: the podium, the winner, and the chaos level."
        >
          <CallsVsReal races={scored.map(callsVsReal)} scope="backtest" />
        </Section>
        <Section
          id="backtest-calibration"
          index="04"
          label="Calibration"
          title={
            <>
              When Jev said 70%, <span className="italic">did it happen?</span>
            </>
          }
          intro={
            <>
              Every podium chance from the backtests, in ten bands. Over{' '}
              <span className="telemetry text-text">{pairs.length}</span> podium calls from{' '}
              <span className="telemetry text-text">{scored.length}</span> backtests.
            </>
          }
        >
          <Calibration bins={reliability(pairs)} predictions={pairs.length} />
        </Section>
        <Section
          id="backtest-races"
          index="05"
          label="Races"
          title={
            <>
              Every backtest, <span className="italic">race by race</span>
            </>
          }
        >
          <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
            {backtests.map(({ record: r, path }) => {
              const score = findScore(r, scores)
              return (
                <li key={path}>
                  <Link
                    to={`/backtest/${r.round}`}
                    className="paper on-paper group flex h-full flex-col gap-4 rounded-[22px] p-4 transition-[transform,box-shadow] duration-300 hover:-translate-y-1 hover:shadow-[0_24px_40px_-24px_rgb(0_0_0/0.9)] sm:p-5"
                  >
                    <span className="flex items-start justify-between gap-2">
                      <span className="font-display text-5xl leading-none">{String(r.round).padStart(2, '0')}</span>
                      <span className="tag text-print-muted">{formatDay(r.race_start)}</span>
                    </span>
                    <TrackOutline
                      circuit={r.circuit_name}
                      className="mx-auto h-28 w-full text-print transition-colors duration-300 group-hover:text-cobalt"
                      width={2.2}
                      start
                    />
                    <span className="mt-auto">
                      <span className="block text-sm leading-tight font-semibold">
                        <RaceName name={r.race_name} />
                      </span>
                      <span className="block text-xs text-print-muted">{r.circuit_name}</span>
                      <span className="telemetry mt-2 block text-xs text-print-muted">
                        {r.status === 'failed' ? 'Failed' : r.status === 'no_prediction' ? 'No prediction' : score ? 'Scored' : 'Called'}
                      </span>
                    </span>
                  </Link>
                </li>
              )
            })}
          </ul>
          <p className="mt-6 text-xs text-muted">
            Circuit outlines from the open f1-circuits dataset by Tomislav Bacinger (MIT licence).
          </p>
        </Section>
      </div>
    </div>
  )
}
