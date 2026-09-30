// The season page: the leaderboard over live races, the technical board, calls against
// reality, calibration, and every race of the season with its status.
import { Car } from '../components/art/Car'
import { SpeedBurst } from '../components/art/SpeedBurst'
import { PageHeader } from '../components/PageHeader'
import { Section } from '../components/Section'
import { Calibration } from '../components/season/Calibration'
import { CallsVsReal } from '../components/season/CallsVsReal'
import { Leaderboard } from '../components/season/Leaderboard'
import { RaceTower } from '../components/season/RaceTower'
import { StatusKey } from '../components/season/StatusKey'
import { TechnicalBoard } from '../components/season/TechnicalBoard'
import { Uncertainty } from '../components/season/Uncertainty'
import { useDocumentTitle } from '../components/useDocumentTitle'
import { useNow } from '../components/useNow'
import { CALENDAR, nextRace, SEASON, type CalendarRace } from '../data/calendar'
import { RECORDS, SCORES } from '../data/load'
import type { ScoreRecord } from '../data/scores'
import { countedScores, leaderboard, podiumPairs, reliability, seasonRows } from '../data/season'
import { callsVsReal, technical } from '../data/technical'
import type { LoadedRecord } from '../data/types'

export function Season({
  records = RECORDS,
  scores = SCORES,
  at,
  calendar = CALENDAR,
}: {
  records?: LoadedRecord[]
  scores?: ScoreRecord[]
  /** A fixed time, for tests and previews; otherwise the page keeps time. */
  at?: number
  calendar?: CalendarRace[]
}) {
  useDocumentTitle('Season')
  const tick = useNow(60_000)
  const now = at ?? tick
  const rows = seasonRows(records, scores, now, calendar)
  const counted = countedScores(rows)
  // The live races that count, with their records: the same set as the leaderboard.
  const scored = rows.flatMap((r) => (r.status === 'scored' && r.entry && r.score ? [{ record: r.entry.record, score: r.score }] : []))
  const pairs = scored.flatMap(({ record, score }) => podiumPairs(record, score))
  const next = nextRace(now, calendar)

  return (
    <div>
      <PageHeader
        eyebrow={`Season ${SEASON} // live races only`}
        title={
          <>
            The season <span className="italic">so far</span>
          </>
        }
        intro={
          <>
            Jev against two simple baselines, scored the same way on the same live races. A baseline that is hard to beat
            is the point: it keeps the model honest.{' '}
            <span className="text-text">
              {counted.length} of {calendar.length} live races counted.
            </span>
          </>
        }
        art={
          <div className="relative grid h-72 place-items-center">
            <SpeedBurst className="absolute inset-0 m-auto h-full w-full text-star/45 [mask-image:radial-gradient(circle,black_35%,transparent_70%)]" />
            <Car className="relative h-60 rotate-[24deg] text-text drop-shadow-[0_24px_24px_rgb(0_0_0/0.65)]" />
          </div>
        }
      />
      <div className="mx-auto mt-16 max-w-6xl space-y-24 px-4 sm:px-6">
        <Section
          id="leaderboard"
          index="01"
          label="Leaderboard"
          title={
            <>
              Jev <span className="italic">against</span> the baselines
            </>
          }
          intro="Backtests and late calls never count. Small samples look small on purpose."
        >
          <Leaderboard standings={leaderboard(counted)} total={calendar.length} />
          <Uncertainty className="mt-4" />
        </Section>
        <Section
          id="technical"
          index="02"
          label="Technical"
          title={
            <>
              Every live race, <span className="italic">every measure</span>
            </>
          }
          intro="Each side's scores race by race, the means over all of them, and Jev's own consistency checks. Live races only."
        >
          <TechnicalBoard summary={technical(scored)} />
        </Section>
        <Section
          id="calls"
          index="03"
          label="Calls vs reality"
          title={
            <>
              What Jev said, <span className="italic">what happened</span>
            </>
          }
          intro="Every chance Jev gave, next to the real result: the podium, the winner, and the chaos level. Live races only."
        >
          <CallsVsReal races={scored.map(callsVsReal)} />
        </Section>
        <Section
          id="calibration"
          index="04"
          label="Calibration"
          title={
            <>
              When Jev said 70%, <span className="italic">did it happen?</span>
            </>
          }
          intro={
            <>
              Every podium chance from the live races, in ten bands. A well calibrated caller sits on the diagonal. Over{' '}
              <span className="telemetry text-text">{pairs.length}</span> podium calls from{' '}
              <span className="telemetry text-text">{counted.length}</span> live races.
            </>
          }
        >
          <Calibration bins={reliability(pairs)} predictions={pairs.length} />
        </Section>
        <Section
          id="races"
          index="05"
          label="Races"
          title={
            <>
              Every race, <span className="italic">every status</span>
            </>
          }
          intro={`The ${calendar.length} races Jev calls in public, rounds ${calendar[0]?.round ?? ''} to ${calendar.at(-1)?.round ?? ''} of the ${SEASON} season.`}
        >
          <RaceTower rows={rows} nextRound={next?.round} />
          <StatusKey />
        </Section>
      </div>
    </div>
  )
}
