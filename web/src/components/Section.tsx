// A numbered section: a mono index and label over a display heading, like a chapter
// marker on a poster. The heading is the section's accessible name.
import type { ReactNode } from 'react'

export function Section({
  id,
  index,
  label,
  title,
  intro,
  children,
  className = '',
}: {
  id: string
  index: string
  label: string
  title: ReactNode
  intro?: ReactNode
  children: ReactNode
  className?: string
}) {
  return (
    <section aria-labelledby={`${id}-heading`} className={`scroll-mt-24 ${className}`} id={id}>
      <div className="mb-5 grid gap-x-8 gap-y-2 md:grid-cols-[minmax(0,1fr)_minmax(0,24rem)] md:items-end">
        <div>
          <p className="tag flex items-center gap-2 text-muted">
            <span className="text-star">{index}</span>
            <span aria-hidden="true" className="h-px w-6 bg-line" />
            {label}
          </p>
          <h2 id={`${id}-heading`} className="mt-2 font-display text-4xl leading-[0.95] tracking-tight sm:text-5xl">
            {title}
          </h2>
        </div>
        {intro && <div className="text-sm leading-relaxed text-muted">{intro}</div>}
      </div>
      {children}
    </section>
  )
}
