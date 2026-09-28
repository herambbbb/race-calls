// A reliability chart: for each band of podium chance, how often those drivers really
// made the podium. On the diagonal is perfectly calibrated, and the line from the
// diagonal to each point is that band's miss. Bins with fewer than ten
// calls are drawn hollow and hatched and labelled low-sample. The same numbers are in
// a table below the chart.
import { pct } from '../../data/format'
import { LOW_SAMPLE, type Bin } from '../../data/season'
import { useMediaQuery } from '../useMediaQuery'

const PAD = { top: 16, right: 16, bottom: 44, left: 48 }

export function Calibration({ bins, predictions }: { bins: Bin[]; predictions: number }) {
  // A narrower drawing on phones, so its labels stay near their stated size.
  const wide = useMediaQuery('(min-width: 640px)')
  const W = wide ? 560 : 340
  const H = wide ? 360 : 300
  const iw = W - PAD.left - PAD.right
  const ih = H - PAD.top - PAD.bottom
  const x = (v: number) => PAD.left + v * iw
  const y = (v: number) => PAD.top + (1 - v) * ih
  const maxCount = Math.max(1, ...bins.map((b) => b.count))
  const points = bins.filter((b) => b.count > 0 && b.observed !== null && b.mean_predicted !== null)
  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,8fr)_minmax(0,4fr)]">
      <figure className="relative rounded-[22px] border border-line bg-panel p-3 sm:p-5">
        <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-labelledby="calibration-desc" className="block h-auto w-full">
          <desc id="calibration-desc">
            Reliability chart of {predictions} podium calls. Each point is a band of podium chance; its height is how
            often those drivers made the podium. The table below has the same numbers.
          </desc>
          <defs>
            <pattern id="lowsample" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
              <line x1="0" y1="0" x2="0" y2="6" stroke="var(--color-faint)" strokeWidth="1" />
            </pattern>
          </defs>
          {bins.map((b) => (
            <rect
              key={b.lower}
              x={x(b.lower) + 1}
              y={PAD.top}
              width={iw / bins.length - 2}
              height={ih}
              fill={b.low_sample ? 'url(#lowsample)' : 'var(--color-raised)'}
              opacity={b.low_sample ? 0.35 : 0.55}
            />
          ))}
          {[0, 0.25, 0.5, 0.75, 1].map((t) => (
            <g key={t}>
              <line x1={PAD.left} x2={W - PAD.right} y1={y(t)} y2={y(t)} stroke="var(--color-line)" />
              <text x={PAD.left - 8} y={y(t) + 4} textAnchor="end" className="telemetry" fontSize="11" fill="var(--color-muted)">
                {t * 100}%
              </text>
              <text x={x(t)} y={H - PAD.bottom + 18} textAnchor="middle" className="telemetry" fontSize="11" fill="var(--color-muted)">
                {t * 100}%
              </text>
            </g>
          ))}
          <line x1={x(0)} y1={y(0)} x2={x(1)} y2={y(1)} stroke="var(--color-muted)" strokeDasharray="4 5" />
          <text x={x(0.97)} y={y(0.97) + 16} textAnchor="end" fontSize="11" fill="var(--color-muted)">
            perfectly calibrated
          </text>
          {/* The gap from the diagonal to each point is that band's miss. */}
          {points.map((b) => (
            <line
              key={`gap-${b.lower}`}
              x1={x(b.mean_predicted!)}
              x2={x(b.mean_predicted!)}
              y1={y(b.mean_predicted!)}
              y2={y(b.observed!)}
              stroke="var(--color-star)"
              strokeWidth="1.5"
              strokeDasharray={b.low_sample ? '2 3' : undefined}
              opacity={b.low_sample ? 0.5 : 0.8}
            />
          ))}
          {points.map((b) => {
            const r = 4 + 9 * Math.sqrt(b.count / maxCount)
            return (
              <circle
                key={b.lower}
                cx={x(b.mean_predicted!)}
                cy={y(b.observed!)}
                r={r}
                fill={b.low_sample ? 'var(--color-ink)' : 'var(--color-star)'}
                stroke="var(--color-star)"
                strokeWidth="2"
                strokeDasharray={b.low_sample ? '3 2' : undefined}
              />
            )
          })}
          <text x={PAD.left + iw / 2} y={H - 6} textAnchor="middle" fontSize="12" fill="var(--color-muted)">
            Podium chance Jev gave
          </text>
          <text
            transform={`translate(12 ${PAD.top + ih / 2}) rotate(-90)`}
            textAnchor="middle"
            fontSize="12"
            fill="var(--color-muted)"
          >
            How often it happened
          </text>
        </svg>
        {predictions === 0 && (
          <p className="absolute inset-0 grid place-items-center p-6 text-center">
            <span className="rounded-xl border border-line bg-ink/90 px-5 py-4 text-sm text-muted backdrop-blur">
              No live calls scored yet. Points appear here after the first live race.
            </span>
          </p>
        )}
        <figcaption className="mt-3 flex flex-wrap gap-x-5 gap-y-2 px-2 text-xs text-muted">
          <span className="flex items-center gap-2">
            <span aria-hidden="true" className="size-3 rounded-full bg-star" />
            {LOW_SAMPLE} or more calls in the band
          </span>
          <span className="flex items-center gap-2">
            <span aria-hidden="true" className="size-3 rounded-full border-2 border-dashed border-star" />
            Fewer than {LOW_SAMPLE}: low sample, hatched
          </span>
        </figcaption>
      </figure>

      <details className="group rounded-[22px] border border-line bg-panel p-5 lg:open:row-span-1" open>
        <summary className="tag flex items-center justify-between text-muted">
          The numbers
          <span aria-hidden="true" className="transition-transform group-open:rotate-45">
            +
          </span>
        </summary>
        <table className="mt-3 w-full border-collapse text-xs">
          <caption className="sr-only">Podium calls by band of chance</caption>
          <thead>
            <tr className="text-left text-muted">
              <th scope="col" className="py-1.5 font-normal">
                Band
              </th>
              <th scope="col" className="py-1.5 text-right font-normal">
                Calls
              </th>
              <th scope="col" className="py-1.5 text-right font-normal">
                Said
              </th>
              <th scope="col" className="py-1.5 text-right font-normal">
                Happened
              </th>
            </tr>
          </thead>
          <tbody className="telemetry">
            {bins.map((b) => (
              <tr key={b.lower} className={`border-t border-line/60 ${b.low_sample ? 'text-muted' : ''}`}>
                <th scope="row" className="py-1.5 text-left font-normal">
                  {Math.round(b.lower * 100)} to {Math.round(b.upper * 100)}%
                </th>
                <td className="py-1.5 text-right">
                  {b.count}
                  {b.low_sample && <span className="tag ml-1 text-sector-amber">low</span>}
                </td>
                <td className="py-1.5 text-right">{b.mean_predicted === null ? '-' : pct(b.mean_predicted)}</td>
                <td className="py-1.5 text-right">{b.observed === null ? '-' : pct(b.observed)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </div>
  )
}
