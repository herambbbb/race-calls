// The request's small print: model, provider, tokens, latency, cost, and the hash of
// the exact request body.
import { formatCount, formatLatency, formatUtc, formatUsd } from '../../data/format'
import type { JevMeta } from '../../data/types'

export function SmallPrint({ jev, requestHash }: { jev: JevMeta; requestHash: string | null }) {
  const tokens =
    jev.input_tokens === null && jev.output_tokens === null
      ? '-'
      : `${formatCount(jev.input_tokens)} in, ${formatCount(jev.output_tokens)} out`
  const rows: [string, string][] = [
    ['Model', jev.model_id ?? jev.model_requested],
    ['Provider', jev.provider ?? '-'],
    ['Tokens', tokens],
    ['Latency', formatLatency(jev.latency_ms)],
    ['Cost', jev.cost_usd === null ? '-' : formatUsd(jev.cost_usd)],
    ['Requested', formatUtc(jev.requested_at)],
    ['Request hash (SHA-256)', requestHash ?? '-'],
  ]
  return (
    <section aria-labelledby="smallprint-heading" className="rounded-2xl border border-dashed border-line p-5">
      <h2 id="smallprint-heading" className="tag mb-3 text-muted">
        Small print
      </h2>
      <dl className="grid grid-cols-1 gap-x-6 gap-y-2 text-xs sm:grid-cols-[auto_1fr]">
        {rows.map(([label, value]) => (
          <div key={label} className="contents">
            <dt className="text-muted">{label}</dt>
            <dd className="telemetry [overflow-wrap:anywhere]">{value}</dd>
          </div>
        ))}
      </dl>
    </section>
  )
}
