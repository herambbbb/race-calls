// A circuit outline from its real geometry (see data/tracks.ts). Optionally drawn in on
// load, with a start marker and a dot lapping the circuit. Decorative: the circuit is
// always named in text nearby.
import { trackFor } from '../../data/tracks'

export function TrackOutline({
  circuit,
  className = '',
  stroke = 'currentColor',
  /** Stroke width in the outline's own units (its longer side is 100). */
  width = 2.2,
  draw = false,
  lap = false,
  start = false,
}: {
  circuit: string
  className?: string
  stroke?: string
  width?: number
  /**
   * Draw the line in: on first render (true), or as the nearest --tile view timeline
   * enters the screen ('view'; the drawing is simply shown where timelines are missing).
   */
  draw?: boolean | 'view'
  /** A dot that laps the circuit. */
  lap?: boolean
  start?: boolean
}) {
  const track = trackFor(circuit)
  if (!track) return null
  return (
    <svg aria-hidden="true" viewBox={`0 0 ${track.width} ${track.height}`} className={className} fill="none">
      <path
        d={track.d}
        stroke={stroke}
        strokeWidth={width}
        strokeLinejoin="round"
        strokeLinecap="round"
        pathLength={1}
        className={draw === 'view' ? 'track-draw-view' : draw ? 'track-draw' : undefined}
      />
      {start && (
        <g transform={`translate(${track.start[0]} ${track.start[1]})`}>
          <circle r="2.4" fill="var(--color-ink)" stroke={stroke} strokeWidth="1" vectorEffect="non-scaling-stroke" />
          <circle r="1" fill={stroke} />
        </g>
      )}
      {lap && (
        <circle r="1.8" fill="var(--color-star)" className="track-lap" style={{ offsetPath: `path('${track.d}')` }} />
      )}
    </svg>
  )
}
