// The poster header for a section page (season, backtests, method): mono eyebrow, a
// display title, an intro, and a piece of racing art on the right.
import type { ReactNode } from 'react'
import { Sparkle } from './Starburst'

export function PageHeader({
  eyebrow,
  title,
  intro,
  art,
  tone = 'dark',
  children,
}: {
  eyebrow: string
  title: ReactNode
  intro: ReactNode
  art?: ReactNode
  tone?: 'dark' | 'paper'
  children?: ReactNode
}) {
  const paper = tone === 'paper'
  return (
    <header className="px-3 pt-4 sm:px-6">
      <div
        className={`relative mx-auto max-w-6xl overflow-hidden rounded-[28px] ${paper ? 'paper on-paper' : 'border border-line bg-panel'}`}
      >
        {!paper && <div aria-hidden="true" className="columns-rule absolute inset-0 text-text" />}
        <div aria-hidden="true" className={`halftone absolute inset-0 ${paper ? 'text-cobalt/25' : 'text-star/30'}`} />
        <div className="relative grid gap-8 p-5 pt-10 sm:p-10 md:grid-cols-[minmax(0,7fr)_minmax(0,5fr)] md:items-center lg:p-14">
          <div className="animate-rise space-y-5">
            <p className={`tag flex items-center gap-2 ${paper ? 'text-print-muted' : 'text-muted'}`}>
              <Sparkle className={`size-3 ${paper ? 'text-cobalt' : 'text-star'}`} />
              {eyebrow}
            </p>
            <h1 className="font-display text-[clamp(3rem,9vw,6.5rem)] leading-[0.86] tracking-tight">{title}</h1>
            <div className={`max-w-xl leading-relaxed ${paper ? 'text-print-muted' : 'text-muted'}`}>{intro}</div>
            {children}
          </div>
          {art && (
            <div aria-hidden="true" className="relative mx-auto w-full max-w-sm md:max-w-none">
              {art}
            </div>
          )}
        </div>
      </div>
    </header>
  )
}
