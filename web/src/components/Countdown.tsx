// A timing-board countdown to a moment. Ticks once a second on its own, so the page
// around it does not re-render every second; `at` fixes the time for tests and
// previews. The accessible text is a single sentence that does not announce every tick.
import { useNow } from './useNow'

function parts(remaining: number) {
  const s = Math.max(0, Math.floor(remaining / 1000))
  return {
    days: Math.floor(s / 86400),
    hours: Math.floor((s % 86400) / 3600),
    minutes: Math.floor((s % 3600) / 60),
    seconds: s % 60,
  }
}

const pad = (n: number) => String(n).padStart(2, '0')

export function Countdown({ to, at, label }: { to: string; at?: number | undefined; label: string }) {
  const tick = useNow()
  const now = at ?? tick
  const { days, hours, minutes, seconds } = parts(Date.parse(to) - now)
  const cells: [string, string][] = [
    [pad(days), 'days'],
    [pad(hours), 'hrs'],
    [pad(minutes), 'min'],
    [pad(seconds), 'sec'],
  ]
  return (
    <div>
      <p className="sr-only">
        {label}: {days} days, {hours} hours and {minutes} minutes.
      </p>
      <div aria-hidden="true" className="grid grid-cols-4 gap-1.5">
        {cells.map(([value, unit], i) => (
          <div key={unit} className="rounded-md border border-line bg-ink px-1 pt-2 pb-1.5 text-center">
            <span
              className={`telemetry block text-3xl leading-none font-medium sm:text-4xl ${i === 3 ? 'text-star' : 'text-text'}`}
            >
              {value}
            </span>
            <span className="tag mt-1.5 block text-muted">{unit}</span>
          </div>
        ))}
      </div>
    </div>
  )
}
