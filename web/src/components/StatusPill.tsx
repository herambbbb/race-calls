// A race status as a pill: a sector-coloured dot plus the status in words, so colour
// is never the only signal.
import type { RaceStatus } from '../data/season'
import { STATUS_LABEL } from '../data/season'

const DOT: Record<RaceStatus, string> = {
  upcoming: 'bg-muted',
  predicted: 'bg-sector-green',
  scored: 'bg-sector-purple',
  late: 'bg-sector-amber',
  no_prediction: 'bg-transparent ring-1 ring-muted',
  failed: 'bg-flag-red',
}

export function StatusPill({
  status,
  label = STATUS_LABEL[status],
  live = false,
}: {
  status: RaceStatus
  label?: string
  /** A pulsing dot, for the one race that is next. */
  live?: boolean
}) {
  return (
    <span className="tag inline-flex items-center gap-2 rounded-full border border-line bg-panel/80 py-1 pr-3 pl-2 whitespace-nowrap text-text">
      <span
        aria-hidden="true"
        className={`size-1.5 rounded-full ${DOT[status]} ${live ? 'animate-pulse-dot text-sector-green' : ''}`}
      />
      {label}
    </span>
  )
}
