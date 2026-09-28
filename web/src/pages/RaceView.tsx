// One race: when the call was made and the link that proves it, the grid, and behind
// the spoiler guard Jev's calls exactly as recorded; after the race, the result, the
// scorecard, and how Jev compared with the baselines.
import { useEffect, useRef } from 'react'
import { Link } from 'react-router'
import { Banner } from '../components/Banner'
import { RaceHero } from '../components/RaceHero'
import { Section } from '../components/Section'
import { Stamp } from '../components/Stamp'
import { AfterRace } from '../components/race/AfterRace'
import { ChaosRubric } from '../components/race/Chaos'
import { ChaosPaintings } from '../components/race/ChaosPaintings'
import { Consistency } from '../components/race/Consistency'
import { Distribution } from '../components/race/Distribution'
import { Facts } from '../components/race/Facts'
import { GridTable } from '../components/race/GridTable'
import { Headline } from '../components/race/Headline'
import { RevealGate } from '../components/race/RevealGate'
import { useReveal } from '../components/race/useReveal'
import { SmallPrint } from '../components/race/SmallPrint'
import { SEASON_ROUNDS } from '../data/calendar'
import { commitHistoryUrl, formatUtc } from '../data/format'
import { chaosCriteria } from '../data/record'
import type { ScoreRecord } from '../data/scores'
import type { LoadedRecord, SlimRecord } from '../data/types'

export function RaceView({
  entry,
  score,
  initiallyRevealed = false,
}: {
  entry: LoadedRecord
  score?: ScoreRecord | undefined
  initiallyRevealed?: boolean
}) {
  const { record, path } = entry
  const drivers = [...(record.drivers ?? [])].sort((a, b) => a.grid - b.grid)
  const calls = record.status === 'ok' ? (record.calls ?? null) : null
  // A late call is published, never scored, so no score shows even if one exists.
  const scored = calls && !record.late ? score : undefined
  const criteria = chaosCriteria(record)
  const { revealed, lit, running, start } = useReveal(`${record.kind}:${record.season}:${record.round}`, initiallyRevealed)
  const callsHeading = useRef<HTMLHeadingElement>(null)
  const wasRevealed = useRef(revealed)

  // After the reveal, keyboard and screen reader users land on the calls.
  useEffect(() => {
    if (revealed && !wasRevealed.current) callsHeading.current?.focus()
    wasRevealed.current = revealed
  }, [revealed])

  let n = 0
  const index = () => String(++n).padStart(2, '0')

  return (
    <article>
      <RaceHero
        eyebrow={`${record.kind === 'backtest' ? 'Backtest' : 'Live'} // ${record.season} // Round ${record.round} of ${SEASON_ROUNDS}`}
        round={record.round}
        raceName={record.race_name}
        circuit={record.circuit_name}
        raceStart={record.race_start}
        stamps={<HeroStamps record={record} scored={Boolean(scored)} />}
      >
        <Proof record={record} path={path} hasCalls={calls !== null} />
      </RaceHero>

      <div className="mx-auto mt-8 max-w-6xl space-y-16 px-4 sm:px-6">
        <StatusBanners record={record} />

        {calls && !revealed && <RevealGate lit={lit} running={running} onReveal={start} afterRace={Boolean(scored)} />}

        {calls && revealed && (
          <section aria-labelledby="calls-heading" className="animate-rise scroll-mt-24">
            <div className="mb-5">
              <p className="tag flex items-center gap-2 text-muted">
                <span className="text-star">{index()}</span>
                <span aria-hidden="true" className="h-px w-6 bg-line" />
                The calls
              </p>
              <h2 id="calls-heading" ref={callsHeading} tabIndex={-1} className="mt-2 font-display text-4xl leading-[0.95] focus:outline-none sm:text-5xl">
                Jev's calls
              </h2>
            </div>
            <Headline calls={calls} drivers={drivers} criteria={criteria} score={scored} />
          </section>
        )}

        {drivers.length > 0 && (
          <Section
            id="grid"
            index={index()}
            label="Starting grid"
            title={
              <>
                The grid, <span className="italic">in order</span>
              </>
            }
            intro={
              record.grid_provisional ?? true
                ? 'Provisional grid: penalties confirmed after the call may change the starting order.'
                : 'Final starting grid.'
            }
          >
            <GridTable drivers={drivers} calls={calls} revealed={revealed} score={scored} />
            {calls && revealed && (
              <div className="mt-4">
                <Consistency calls={calls} drivers={drivers} />
              </div>
            )}
          </Section>
        )}

        {calls && revealed && (
          <>
            <Section
              id="winner"
              index={index()}
              label="Winner question"
              title="Every driver's win chance"
              intro="One pick, plus a full probability distribution over the grid. These do add up to 100%."
            >
              <Distribution calls={calls} drivers={drivers} winner={scored?.result.winner} />
            </Section>

            <Section
              id="chaos"
              index={index()}
              label="Chaos rating"
              title={
                <>
                  Calm, or <span className="italic">bedlam?</span>
                </>
              }
              intro="A score from 0 to 4 on a fixed five-level rubric. These are the five lines exactly as Jev saw them."
            >
              <ChaosPaintings score={calls.chaos.score} criteria={criteria} result={scored} round={record.round} />
              <ChaosRubric score={calls.chaos.score} criteria={criteria} result={scored} />
            </Section>

            {scored && (
              <Section
                id="result"
                index={index()}
                label="After the flag"
                title={
                  <>
                    What <span className="italic">really</span> happened
                  </>
                }
                intro="The official result, scored against the call and against two simple baselines on the same race."
              >
                <AfterRace calls={calls} drivers={drivers} score={scored} round={record.round} />
              </Section>
            )}
          </>
        )}

        {calls && (
          <Section
            id="facts"
            index={index()}
            label="Inputs"
            title="What Jev knew"
            intro={
              <>
                <strong className="font-semibold text-text">Jev gives no reasons.</strong> It was given these facts and
                answered with numbers only, so this page shows inputs and outputs and never adds reasons of its own.
              </>
            }
          >
            <Facts facts={record.facts} drivers={drivers} />
          </Section>
        )}

        {record.jev && <SmallPrint jev={record.jev} requestHash={record.request_hash ?? null} />}

        <p>
          <Link
            to={record.kind === 'backtest' ? '/backtests' : '/season#races'}
            className="group inline-flex items-center gap-2 text-sm text-muted hover:text-text"
          >
            <span aria-hidden="true" className="transition-transform group-hover:-translate-x-1">
              ←
            </span>
            {record.kind === 'backtest' ? 'All backtests' : 'All races'}
          </Link>
        </p>
      </div>
    </article>
  )
}

function HeroStamps({ record, scored }: { record: SlimRecord; scored: boolean }) {
  return (
    <>
      {record.kind === 'backtest' && (
        <Stamp tone="amber" tilt={-4}>
          Backtest
        </Stamp>
      )}
      {record.status === 'ok' && record.late && (
        <Stamp tone="amber" tilt={3}>
          Late
        </Stamp>
      )}
      {record.status === 'no_prediction' && (
        <Stamp tone="paper" tilt={-3}>
          No call
        </Stamp>
      )}
      {record.status === 'failed' && (
        <Stamp tone="paper" tilt={3} className="!border-flag-red !text-flag-red">
          Failed
        </Stamp>
      )}
      {scored && (
        <Stamp tone="purple" tilt={-2}>
          Scored
        </Stamp>
      )}
    </>
  )
}

/** The proof: when the call was made, and the public commit history that shows it. */
function Proof({ record, path, hasCalls }: { record: SlimRecord; path: string; hasCalls: boolean }) {
  const before = Date.parse(record.made_at) < Date.parse(record.race_start)
  return (
    <div className="flex max-w-2xl flex-col gap-3 rounded-xl border border-line bg-ink/70 px-4 py-3 backdrop-blur-sm sm:flex-row sm:items-center sm:justify-between">
      <p className="text-sm">
        <span className="tag block text-muted">{hasCalls ? 'Called at' : 'Recorded at'}</span>
        <time dateTime={record.made_at} className="telemetry text-text">
          {formatUtc(record.made_at)}
        </time>
        {record.kind === 'live' && hasCalls && (
          <span className={`tag mt-1 block ${before ? 'text-sector-green' : 'text-sector-amber'}`}>
            {before ? 'Before lights out' : 'After the start'}
          </span>
        )}
      </p>
      <a
        href={commitHistoryUrl(path)}
        className="group inline-flex shrink-0 items-center gap-2 rounded-full border border-line px-4 py-2 text-sm text-link transition-colors hover:border-link"
      >
        See the commit history of this record
        <span aria-hidden="true" className="transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5">
          ↗
        </span>
      </a>
    </div>
  )
}

function StatusBanners({ record }: { record: SlimRecord }) {
  return (
    <div className="space-y-2">
      {record.kind === 'backtest' && (
        <Banner tone="amber" label="Backtest">
          Backtest: the model may have seen these results. Run after the race to test the pipeline; never counted on the
          leaderboard.
        </Banner>
      )}
      {record.status === 'ok' && record.late && (
        <Banner tone="amber" label="Late">
          Made after the start: published, not scored.
        </Banner>
      )}
      {record.status === 'ok' && !record.late && record.kind === 'live' && (
        <Banner tone="green" label="On time">
          Called before lights out. GitHub's commit time is the proof.
        </Banner>
      )}
      {record.status === 'no_prediction' && (
        <Banner tone="white" label="No prediction">
          No prediction for this race: qualifying data did not arrive in time.
        </Banner>
      )}
      {record.status === 'failed' && (
        <Banner tone="red" label="Failed">
          The prediction failed, so there is no call for this race.
        </Banner>
      )}
      {record.note && record.note !== 'Backtest: the model may have seen these results.' && (
        <p className="text-sm text-muted">{record.note}</p>
      )}
    </div>
  )
}
