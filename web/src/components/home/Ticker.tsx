// A scrolling strip of what the site does, between a chequered flag edge. Decorative:
// every phrase is also said in the page's own text.
import { Sparkle } from '../Starburst'

const TICKER = [
  'Podium chance for every driver',
  'One winner pick',
  'Chaos from 0 to 4',
  'Committed before lights out',
  'Scored after the flag',
  'Misses stay on the record',
  'Two baselines to beat',
]

export function Ticker() {
  const items = [...TICKER, ...TICKER]
  return (
    <div aria-hidden="true" className="relative mt-4 overflow-hidden border-y border-line bg-ink py-3">
      <div className="chequer absolute inset-y-0 left-0 z-10 w-12 bg-ink text-text/25" />
      <div className="chequer absolute inset-y-0 right-0 z-10 w-12 bg-ink text-text/25" />
      <div className="animate-ticker flex w-max gap-10 pl-16">
        {items.map((t, i) => (
          <span key={i} className="tag flex items-center gap-10 whitespace-nowrap text-muted">
            {t}
            <Sparkle className="size-2.5 text-star" />
          </span>
        ))}
      </div>
    </div>
  )
}
