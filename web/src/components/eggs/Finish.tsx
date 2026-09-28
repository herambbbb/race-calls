// The foot of every page: a chequered flag that waves when you reach the end (one of
// the paddock secrets), and the count of secrets found, with a nudge toward the next.
import { useEffect, useRef } from 'react'
import { EGGS, type EggId } from '../../data/eggs'
import { Stamp } from '../Stamp'
import { useEggs } from './context'

const HINTS: Record<EggId, string> = {
  flag: 'Keep going, all the way to the end of a page.',
  radio: 'Press T to open the team radio.',
  box: 'Pit wall says: type BOX.',
  drs: 'Within a second of the car ahead? Type DRS.',
  safety: 'Old cheat codes still work round here.',
  lights: 'The logo is a light. Keep clicking it.',
}

const COLS = 12
const ROWS = 6

export function Finish() {
  const { found, trigger, keysOn, setKeysOn } = useEggs()
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const el = ref.current
    if (!el || typeof IntersectionObserver === 'undefined') return
    const observer = new IntersectionObserver(([entry]) => {
      if (entry?.isIntersecting) trigger('flag')
    }, { threshold: 0.6 })
    observer.observe(el)
    return () => observer.disconnect()
  }, [trigger])

  const next = EGGS.find((e) => !found.has(e))
  return (
    <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-6 px-4 py-6 sm:px-6">
      <div ref={ref} className="flex items-center gap-4">
        <div aria-hidden="true" className="flex items-stretch">
          <span className="w-1 rounded-full bg-muted" />
          <span className="flex">
            {Array.from({ length: COLS }, (_, c) => (
              <span key={c} className="flag-col flex flex-col" style={{ animationDelay: `${c * -110}ms` }}>
                {Array.from({ length: ROWS }, (_, r) => (
                  <span key={r} className={`size-2.5 ${(r + c) % 2 ? 'bg-ink' : 'bg-text'}`} />
                ))}
              </span>
            ))}
          </span>
        </div>
        <p className="font-display text-3xl leading-none">
          Chequered <span className="italic">flag.</span>
        </p>
      </div>
      <div className="flex flex-col items-end gap-2 text-right text-xs text-muted">
        {next ? (
          <>
            <p>
              <span className="tag text-text">Paddock secrets</span>{' '}
              <span className="telemetry text-star">{found.size}</span> of {EGGS.length} found
            </p>
            <p className="mt-1">{HINTS[next]}</p>
          </>
        ) : (
          <Stamp tone="purple" tilt={-4}>
            Paddock pass: all {EGGS.length} found
          </Stamp>
        )}
        {/* Letter-key shortcuts can misfire for speech input; anyone can switch them off. */}
        <button
          type="button"
          aria-pressed={keysOn}
          onClick={() => setKeysOn(!keysOn)}
          className="tag inline-flex items-center gap-2 rounded-full border border-line px-3 py-1.5 text-muted transition-colors hover:text-text"
        >
          <span aria-hidden="true" className={`size-1.5 rounded-full ${keysOn ? 'bg-sector-green' : 'bg-muted'}`} />
          Keyboard secrets {keysOn ? 'on' : 'off'}
        </button>
      </div>
    </div>
  )
}
