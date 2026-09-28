// A status line: a flag-coloured rule plus a text label, so colour is never the only signal.
import type { ReactNode } from 'react'

export type Tone = 'green' | 'yellow' | 'red' | 'white'

const RULE: Record<Tone, string> = {
  green: 'border-flag-green',
  yellow: 'border-flag-yellow',
  red: 'border-flag-red',
  white: 'border-flag-white',
}

export function Banner({ tone, children }: { tone: Tone; children: ReactNode }) {
  return (
    <p role="status" className={`border-l-4 ${RULE[tone]} bg-panel px-3 py-2 text-sm`}>
      {children}
    </p>
  )
}
