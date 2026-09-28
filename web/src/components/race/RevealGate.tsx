// The spoiler guard. The page shows the grid first; "Show Jev's calls" runs a start
// sequence (five lights on, then out) and reveals the calls, and after the race the
// result too. With reduced motion the reveal is immediate. The choice lasts for the
// browser session, per race.
import { StartLights } from '../StartLights'

export function RevealGate({
  lit,
  running,
  onReveal,
  afterRace,
}: {
  lit: number
  running: boolean
  onReveal: () => void
  afterRace: boolean
}) {
  return (
    <section
      aria-label="Spoiler guard"
      className="relative overflow-hidden rounded-[22px] border border-line bg-panel p-5 sm:p-8"
    >
      <div aria-hidden="true" className="columns-rule absolute inset-0 text-text" />
      <div className="relative grid items-center gap-6 md:grid-cols-[auto_1fr_auto]">
        <StartLights lit={running ? lit : undefined} />
        <div>
          <p className="font-display text-3xl leading-none sm:text-4xl">
            {afterRace ? 'Calls and result are under wraps.' : 'Calls are under wraps.'}
          </p>
          <p className="mt-2 max-w-prose text-sm leading-relaxed text-muted">
            {afterRace
              ? 'Showing the calls also shows who won. '
              : 'Make your own guess first, if you like. '}
            They are public in the repository anyway; this only keeps them off your screen until you ask.
          </p>
        </div>
        <button
          type="button"
          onClick={onReveal}
          disabled={running}
          className="group relative inline-flex items-center justify-center gap-3 overflow-hidden rounded-full bg-text px-6 py-3.5 font-medium text-ink shadow-[0_8px_30px_-8px_rgb(245_197_66/0.5)] transition-transform duration-300 ease-[var(--ease-spring)] hover:scale-[1.03] active:scale-[0.98] disabled:cursor-wait"
        >
          <span
            aria-hidden="true"
            className="absolute inset-y-0 left-0 bg-star transition-[width] duration-200"
            style={{ width: `${(lit / 5) * 100}%` }}
          />
          <span className="relative">{running ? 'Lights...' : afterRace ? "Show Jev's calls and the result" : "Show Jev's calls"}</span>
        </button>
      </div>
      <p aria-live="polite" className="sr-only">
        {running ? 'Revealing' : ''}
      </p>
    </section>
  )
}
