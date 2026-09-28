// A status line: a flag-coloured rule and tag plus the message, so colour is never the
// only signal. Used for every honesty label that must stay visible.
import type { ReactNode } from 'react'

export type Tone = 'green' | 'amber' | 'red' | 'white'

const RULE: Record<Tone, string> = {
  green: 'border-sector-green',
  amber: 'border-sector-amber',
  red: 'border-flag-red',
  white: 'border-text',
}

const FLAG: Record<Tone, string> = {
  green: 'bg-sector-green',
  amber: 'bg-sector-amber',
  red: 'bg-flag-red',
  white: 'bg-text',
}

export function Banner({ tone, label, children }: { tone: Tone; label?: string; children: ReactNode }) {
  return (
    <p role="status" className={`flex gap-3 border-l-2 ${RULE[tone]} bg-panel px-4 py-3 text-sm leading-relaxed`}>
      <span aria-hidden="true" className={`mt-1.5 size-2 shrink-0 rotate-45 ${FLAG[tone]}`} />
      <span>
        {label && <span className="tag mr-2 text-muted">{label}</span>}
        {children}
      </span>
    </p>
  )
}
