// Chaos as paint: Jev's chaos score painted on the 0 to 4 scale, from long calm strokes
// to tight broken vortices, and after the race the actual level beside it, so a miss is
// visible at a glance. The paintings are decorative; each is labelled in text.
import { levelSpan } from '../../data/record'
import type { ScoreRecord } from '../../data/scores'
import { Painting } from '../art/painting/Painting'

function Panel({ label, value, words, note, seed }: { label: string; value: number; words: string | null; note?: string; seed: number }) {
  return (
    <figure className="overflow-hidden rounded-[22px] border border-line bg-panel">
      <Painting preset={{ kind: 'chaos', level: value }} seed={seed} className="relative h-48 w-full sm:h-56" />
      <figcaption className="border-t border-line p-4 text-sm">
        <span className="tag block text-muted">{label}</span>
        <span className="mt-1 block">
          <span className="telemetry text-2xl font-semibold">{Number.isInteger(value) ? value : value.toFixed(2)}</span>
          {words && <span className="font-display text-2xl italic">, {words}</span>}
        </span>
        {note && <span className="mt-1 block text-muted">{note}</span>}
      </figcaption>
    </figure>
  )
}

export function ChaosPaintings({
  score,
  criteria,
  result,
  round,
}: {
  score: number
  criteria: string[]
  result?: ScoreRecord | undefined
  round: number
}) {
  return (
    <div className={`mb-4 grid gap-3 ${result ? 'sm:grid-cols-2' : ''}`} data-testid="chaos-paintings">
      <Panel label="Jev's call" value={score} words={levelSpan(criteria, score)} seed={round * 10 + 1} />
      {result && (
        <Panel
          label="Actual"
          value={result.chaos.actual}
          words={levelSpan(criteria, result.chaos.actual)}
          note={result.chaos.reason}
          seed={round * 10 + 2}
        />
      )}
    </div>
  )
}
