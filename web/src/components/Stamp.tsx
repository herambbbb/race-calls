// A rubber stamp: the honesty labels (backtest, late, miss) printed at a tilt, so they
// read as part of the record rather than a dismissible notice.
import type { CSSProperties, ReactNode } from 'react'

export type StampTone = 'cobalt' | 'amber' | 'green' | 'purple' | 'ink' | 'paper'

// Each stamp has a solid backing, so its contrast never depends on what is behind it.
const TONE: Record<StampTone, string> = {
  cobalt: 'border-cobalt bg-paper text-cobalt',
  amber: 'border-sector-amber bg-ink text-sector-amber',
  green: 'border-sector-green bg-ink text-sector-green',
  purple: 'border-sector-purple bg-ink text-sector-purple',
  ink: 'border-print bg-paper text-print',
  paper: 'border-text bg-ink text-text',
}

export function Stamp({
  tone,
  children,
  tilt = -5,
  className = '',
}: {
  tone: StampTone
  children: ReactNode
  tilt?: number
  className?: string
}) {
  return (
    <span
      className={`animate-stamp inline-flex items-center gap-2 rounded-[3px] border-2 px-2.5 py-1 font-mono text-xs font-bold tracking-[0.14em] uppercase ${TONE[tone]} ${className}`}
      style={{ '--tilt': `${tilt}deg`, transform: `rotate(${tilt}deg)` } as CSSProperties}
    >
      {children}
    </span>
  )
}
