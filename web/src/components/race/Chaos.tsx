// The chaos rubric exactly as Jev saw it, with Jev's score on a 0 to 4 track and,
// after the race, the actual level and why.
import { rubricLine } from '../../data/record'
import type { ScoreRecord } from '../../data/scores'

export function ChaosRubric({ score, criteria, result }: { score: number; criteria: string[]; result?: ScoreRecord | undefined }) {
  const called = Math.max(0, Math.min(4, score))
  const nearest = Math.round(called)
  const actual = result?.chaos.actual
  const at = (v: number) => `${(v / 4) * 100}%`
  // Labels stay inside the card at either end of the track.
  const label = (v: number) => `clamp(2.5rem, ${at(v)}, calc(100% - 2.5rem))`

  return (
    <div className="rounded-[22px] border border-line bg-panel p-5 sm:p-8">
      <div aria-hidden="true" className="relative mx-2 mt-8 mb-14">
        <span className="absolute inset-x-0 top-1/2 h-px bg-line" />
        <span className="absolute top-1/2 left-0 h-[3px] -translate-y-1/2 rounded-full bg-star" style={{ width: at(called) }} />
        <span className="relative flex justify-between">
          {[0, 1, 2, 3, 4].map((level) => (
            <span key={level} className="relative flex flex-col items-center">
              <span className={`size-3 rounded-full border-2 ${level <= called ? 'border-star bg-star' : 'border-line bg-ink'}`} />
              <span className="telemetry absolute top-5 -translate-x-0 text-xs text-muted">{level}</span>
            </span>
          ))}
        </span>
        <span className="tag absolute -top-7 -translate-x-1/2 rounded-full bg-star px-2 py-0.5 text-ink" style={{ left: label(called) }}>
          Jev {called.toFixed(2)}
        </span>
        {actual !== undefined && (
          <span className="tag absolute top-12 -translate-x-1/2 rounded-full bg-sector-purple px-2 py-0.5 text-ink" style={{ left: label(actual) }}>
            Actual {actual}
          </span>
        )}
      </div>
      <p className="sr-only">
        Jev rated the chaos {called.toFixed(2)} out of 4{actual !== undefined ? `; the actual level was ${actual}` : ''}.
      </p>
      {criteria.length > 0 ? (
        <ol aria-label="Chaos rubric" className="divide-y divide-line/70 border-y border-line/70">
          {criteria.map((text, i) => {
            const line = rubricLine(text)
            const level = line.level ?? i
            const isCalled = level === nearest
            const isActual = level === actual
            return (
              <li key={text} className={`grid grid-cols-[2.25rem_1fr] gap-3 py-3 text-sm sm:grid-cols-[3rem_1fr_auto] ${isCalled || isActual ? 'text-text' : 'text-muted'}`}>
                <span className={`telemetry grid size-8 place-items-center rounded-md text-base ${isCalled ? 'bg-star text-ink' : isActual ? 'bg-sector-purple text-ink' : 'bg-raised'}`}>
                  {level}
                </span>
                <span className="self-center leading-relaxed">{line.text}</span>
                <span className="col-start-2 flex gap-1.5 sm:col-start-3 sm:self-center">
                  {isCalled && <span className="tag rounded-full border border-star px-2 py-0.5 text-star">Nearest to Jev's call</span>}
                  {isActual && <span className="tag rounded-full border border-sector-purple px-2 py-0.5 text-sector-purple">Actual</span>}
                </span>
              </li>
            )
          })}
        </ol>
      ) : (
        <p className="text-sm text-muted">The rubric was not recorded with this request.</p>
      )}
      {result && (
        <p className="mt-4 text-sm">
          <span className="tag mr-2 text-muted">Why</span>
          {result.chaos.reason}
        </p>
      )}
    </div>
  )
}
