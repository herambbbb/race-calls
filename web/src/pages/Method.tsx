// How it works: the three questions, what Jev is told, how a call is committed before
// the start, and how it is scored. Jev gives no reasons, so none are added.
import type { CSSProperties } from 'react'
import { Link } from 'react-router'
import { Car } from '../components/art/Car'
import { PageHeader } from '../components/PageHeader'
import { Section } from '../components/Section'
import { StartLights } from '../components/StartLights'
import { useDocumentTitle } from '../components/useDocumentTitle'

const STEPS = [
  {
    n: '01',
    title: 'Call',
    body: 'After qualifying, a script gathers the facts: the grid, gaps to pole, standings, recent form, teammate head-to-head, engine supplier, speed trap and sector ranks, similar circuits, weather. Jev answers in numbers.',
  },
  {
    n: '02',
    title: 'Commit',
    body: "The call is committed to a public repository before lights out. GitHub's commit time is the proof it came first. A call made after the start is marked late and never scored.",
  },
  {
    n: '03',
    title: 'Score',
    body: 'After the race, the calls are scored against the official result, next to two baselines: how each grid slot has historically finished, and recent form.',
  },
]

const QUESTIONS = [
  {
    title: 'Podium chance',
    body: 'For each driver: will they finish in the top three? A probability from 0 to 100%. These are separate yes or no calls, so they need not add up to exactly 3; the race page shows how far they are off.',
  },
  {
    title: 'Winner pick',
    body: 'One driver, plus a full probability distribution over the grid, which does add up to 100%.',
  },
  {
    title: 'Chaos rating',
    body: 'A score from 0 (calm) to 4 (bedlam) on a fixed five-level rubric: safety cars, red flags, retirements, rain. The actual level is computed from race control after the race.',
  },
]

const MEASURES = [
  ['Podium Brier', 'The average squared gap between each podium chance and what happened. Lower is better; calling 14% for everyone scores about 0.12.'],
  ['Winner log loss', 'How surprised the call was by the real winner. 0.69 means it gave the winner 50%, 2.30 means 10%. Lower is better.'],
  ['Picks right', "Whether the most likely winner won, and how many of Jev's three podium picks made the podium."],
  ['Chaos error', 'The distance between the called and the actual level, on the 0 to 4 scale.'],
]

export function Method() {
  useDocumentTitle('Method')
  return (
    <div>
      <PageHeader
        eyebrow="Method // Jev by TypeSafe"
        title={
          <>
            Three questions, <span className="italic">one request</span>
          </>
        }
        intro={
          <>
            Jev by TypeSafe is a decision model. For each race it gets a page of plain facts and answers three kinds of
            question in one request. <strong className="font-semibold text-text">Jev gives no reasons</strong>, so the site
            shows what it was told and what it answered, nothing more.
          </>
        }
        art={
          <div className="relative grid h-72 place-items-center">
            <Car className="absolute h-64 -rotate-90 text-cobalt" />
            <span className="relative">
              <StartLights />
            </span>
          </div>
        }
      />
      <div className="mx-auto mt-16 max-w-6xl space-y-24 px-4 sm:px-6">
        <Section id="steps" index="01" label="The weekend" title="Call, commit, score">
          <ol className="grid gap-3 md:grid-cols-3">
            {STEPS.map((s, i) => (
              <li
                key={s.n}
                className="group relative overflow-hidden rounded-[22px] border border-line bg-panel p-6 transition-colors hover:border-faint"
                style={{ '--i': i } as CSSProperties}
              >
                <span
                  aria-hidden="true"
                  className="telemetry absolute -top-6 -right-2 text-[7rem] leading-none font-bold text-transparent transition-transform duration-500 group-hover:-translate-y-1"
                  style={{ WebkitTextStroke: '1px var(--color-line)' }}
                >
                  {s.n}
                </span>
                <p className="tag text-star">Step {s.n}</p>
                <h3 className="mt-6 font-display text-4xl">{s.title}</h3>
                <p className="mt-3 text-sm leading-relaxed text-muted">{s.body}</p>
              </li>
            ))}
          </ol>
        </Section>

        <Section id="questions" index="02" label="The questions" title={<>What Jev is <span className="italic">asked</span></>}>
          <dl className="grid gap-3 md:grid-cols-3">
            {QUESTIONS.map((q) => (
              <div key={q.title} className="rounded-[22px] border border-line bg-panel p-6">
                <dt className="font-display text-3xl">{q.title}</dt>
                <dd className="mt-3 text-sm leading-relaxed text-muted">{q.body}</dd>
              </div>
            ))}
          </dl>
        </Section>

        <Section
          id="scoring"
          index="03"
          label="Scoring"
          title={<>How a call is <span className="italic">judged</span></>}
          intro="Jev and both baselines are scored the same way on the same races. The leaderboard counts live, on-time races only."
        >
          <dl className="paper on-paper grid gap-x-10 gap-y-6 rounded-[22px] p-6 sm:grid-cols-2 sm:p-8">
            {MEASURES.map(([term, body]) => (
              <div key={term} className="border-t-2 border-print pt-3">
                <dt className="font-semibold">{term}</dt>
                <dd className="mt-1 text-sm leading-relaxed text-print-muted">{body}</dd>
              </div>
            ))}
          </dl>
        </Section>

        <Section id="honesty" index="04" label="House rules" title={<>What stays <span className="italic">on the record</span></>}>
          <ul className="grid gap-2 text-sm sm:grid-cols-2">
            {[
              'Every call is public before lights out; the commit time is the proof.',
              'A late call is published, marked late, and never scored.',
              'If qualifying data does not arrive, the race says "no prediction".',
              'Backtests are labelled "the model may have seen these results" and never count.',
              'The grid is provisional: penalties after the call may change it.',
              'Misses are shown as plainly as hits.',
            ].map((rule) => (
              <li key={rule} className="flex gap-3 rounded-xl border border-line bg-panel px-4 py-3">
                <span aria-hidden="true" className="mt-1.5 size-2 shrink-0 rotate-45 bg-star" />
                {rule}
              </li>
            ))}
          </ul>
          <p className="mt-6">
            <Link to="/season" className="text-sm text-link underline-offset-4 hover:underline">
              See the season →
            </Link>
          </p>
        </Section>
      </div>
    </div>
  )
}
