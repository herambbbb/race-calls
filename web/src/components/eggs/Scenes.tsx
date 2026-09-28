// The paddock scenes. Each is a small overlay that lets clicks through (except on its
// Close button), dismisses itself, and can be closed with Escape. Each announces itself
// once through the shared live region, never frame by frame. Under reduced motion they
// appear still.
import { useEffect, useState, type ReactNode } from 'react'
import { pitStopTime, radioFor } from '../../data/eggs'
import { CarShape } from '../art/Car'
import { StartLights } from '../StartLights'

function useAutoClose(ms: number, onDone: () => void) {
  useEffect(() => {
    const id = window.setTimeout(onDone, ms)
    return () => window.clearTimeout(id)
  }, [ms, onDone])
}

function Close({ onDone, tone = 'dark' }: { onDone: () => void; tone?: 'dark' | 'light' }) {
  return (
    <button
      type="button"
      onClick={onDone}
      className={`pointer-events-auto tag rounded-full border px-2.5 py-1 transition-colors ${tone === 'dark' ? 'border-line bg-ink text-muted hover:text-text' : 'border-ink/30 text-ink/70 hover:text-ink'}`}
    >
      Close
    </button>
  )
}

function Frame({ label, children, className = '' }: { label: string; children: ReactNode; className?: string }) {
  return (
    <div role="group" aria-label={label} className={`egg-in pointer-events-none fixed z-[65] ${className}`}>
      {children}
    </div>
  )
}

/** The team radio: a transmission card with a live waveform, after the fan radio cards. */
type Announce = (text: string) => void

export function RadioScene({ turn, onDone, announce }: { turn: number; onDone: () => void; announce: Announce }) {
  const messages = radioFor(turn)
  useAutoClose(9000 + messages.length * 800, onDone)
  useEffect(() => {
    announce(`Team radio. ${messages.map((m) => `${m.from}: ${m.line}`).join(' ')}`)
  }, [announce, messages])
  return (
    <Frame label="Team radio" className="bottom-4 left-4 w-[min(24rem,calc(100vw-2rem))]">
      <div className="overflow-hidden rounded-[22px] border border-line bg-ink/95 shadow-[0_30px_60px_-20px_rgb(0_0_0/0.8)] backdrop-blur-md">
        <div className="flex items-end justify-between gap-3 border-b border-line bg-panel px-4 pt-3 pb-2">
          <div className="flex items-baseline gap-2">
            <span className="font-display text-5xl leading-none text-star">J</span>
            <span>
              <span className="tag block text-muted">Team radio</span>
              <span className="font-display text-2xl leading-none">
                Jev <span className="italic">radio</span>
              </span>
            </span>
          </div>
          <Close onDone={onDone} />
        </div>
        <div aria-hidden="true" className="radio-wave flex h-10 items-center gap-[3px] px-4">
          {Array.from({ length: 38 }, (_, i) => (
            <span key={i} style={{ animationDelay: `${(i * 97) % 700}ms`, height: `${20 + ((i * 37) % 70)}%` }} />
          ))}
        </div>
        <ol className="space-y-2 px-4 pt-1 pb-4">
          {messages.map((m, i) => (
            <li key={i} className="egg-line" style={{ animationDelay: `${300 + i * 900}ms` }}>
              <span className={`tag mr-2 ${m.from === 'Jev' ? 'text-star' : 'text-cerulean'}`}>{m.from}</span>
              <span className="text-base">"{m.line}"</span>
            </li>
          ))}
        </ol>
      </div>
    </Frame>
  )
}

/** Box, box: the car stops in its box, four wheel guns fire, the stopwatch stops. */
export function PitStopScene({ onDone, announce }: { onDone: () => void; announce: Announce }) {
  const [target] = useState(() => pitStopTime(Math.random()))
  const [time, setTime] = useState(0)
  const done = time >= target
  useEffect(() => {
    const start = performance.now() + 700
    let raf = 0
    const tick = (now: number) => {
      const t = Math.max(0, (now - start) / 1000)
      setTime(Math.min(target, t))
      if (t < target) raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [target])
  useAutoClose(target * 1000 + 5200, onDone)
  const verdict = target < 2 ? 'Record pace. The crew is on it.' : target < 2.3 ? 'Clean stop.' : 'A slow one. We are checking.'
  useEffect(() => announce('Box, box. Pit stop in progress.'), [announce])
  useEffect(() => {
    if (done) announce(`Pit stop: ${target.toFixed(2)} seconds. ${verdict}`)
  }, [announce, done, target, verdict])
  return (
    <Frame label="Pit stop" className="inset-x-0 top-[calc(var(--header-h,76px)+1rem)] mx-auto w-[min(26rem,calc(100vw-2rem))]">
      <div className="rounded-[22px] border border-line bg-ink/95 p-5 shadow-[0_30px_60px_-20px_rgb(0_0_0/0.8)] backdrop-blur-md">
        <div className="flex items-center justify-between">
          <p className="tag text-star">Box, box</p>
          <Close onDone={onDone} />
        </div>
        <div aria-hidden="true" className="relative mx-auto mt-4 h-44 w-40">
          {/* The pit box, painted on the lane. */}
          <span className="absolute inset-0 rounded-md border-2 border-dashed border-star/50" />
          <svg viewBox="0 0 40 100" className="pit-car absolute inset-x-6 inset-y-2 h-[calc(100%-1rem)] w-[calc(100%-3rem)]">
            <CarShape body="#f2ecdc" trim="#070d1c" />
          </svg>
          {[
            ['left-3', 'top-[22%]'],
            ['right-3', 'top-[22%]'],
            ['left-2', 'top-[70%]'],
            ['right-2', 'top-[70%]'],
          ].map(([x, y], i) => (
            <span key={i} className={`wheel-gun absolute ${x} ${y} size-4 rounded-full bg-star`} style={{ animationDelay: `${800 + i * 120}ms` }} />
          ))}
        </div>
        <p className="mt-4 text-center">
          <span className={`telemetry text-5xl font-semibold ${done ? 'text-sector-purple' : 'text-text'}`}>{time.toFixed(2)}</span>
          <span className="text-muted"> s</span>
        </p>
        <p className="mt-1 min-h-6 text-center text-sm text-muted">{done ? verdict : 'Wheel guns...'}</p>
      </div>
    </Frame>
  )
}

/** Safety car: the board lights up and the safety car crosses the screen. */
export function SafetyCarScene({ onDone, announce }: { onDone: () => void; announce: Announce }) {
  const [inThisLap, setIn] = useState(false)
  useEffect(() => announce(inThisLap ? 'Safety car in this lap.' : 'Safety car deployed.'), [announce, inThisLap])
  useEffect(() => {
    const id = window.setTimeout(() => setIn(true), 4200)
    return () => window.clearTimeout(id)
  }, [])
  useAutoClose(7200, onDone)
  return (
    <>
      <Frame label="Safety car" className="inset-x-0 top-[calc(var(--header-h,76px)+1rem)] mx-auto w-fit max-w-[calc(100vw-2rem)]">
        <div className="flex items-center gap-4 rounded-2xl border border-sector-amber/50 bg-ink/95 px-5 py-3 shadow-[0_0_40px_-8px_rgb(255_159_67/0.5)] backdrop-blur-md">
          <span aria-hidden="true" className="sc-lamp size-3 rounded-full bg-sector-amber" />
          <span className="telemetry text-xl font-bold tracking-[0.3em] text-sector-amber sm:text-2xl">
            {inThisLap ? 'SC IN THIS LAP' : 'SAFETY CAR'}
          </span>
          <span aria-hidden="true" className="sc-lamp sc-lamp-b size-3 rounded-full bg-sector-amber" />
          <Close onDone={onDone} />
        </div>
      </Frame>
      <div aria-hidden="true" className="pointer-events-none fixed inset-x-0 bottom-6 z-[64] h-24 overflow-hidden">
        <svg viewBox="0 0 40 100" className="sc-drive absolute top-0 h-24 w-10 rotate-90">
          <CarShape body="#f2ecdc" trim="#070d1c" />
          {/* The light bar on the roof. */}
          <rect x="11" y="52" width="18" height="5" rx="1.5" fill="#070d1c" />
          <rect className="sc-lamp" x="12" y="53" width="7" height="3" rx="1" fill="#ff9f43" />
          <rect className="sc-lamp sc-lamp-b" x="21" y="53" width="7" height="3" rx="1" fill="#ff9f43" />
        </svg>
      </div>
    </>
  )
}

/** Five clicks on the logo: a real start at centre screen, then away we go. */
export function LightsOutScene({ onDone, announce }: { onDone: () => void; announce: Announce }) {
  const [lit, setLit] = useState(0)
  const [away, setAway] = useState(false)
  useEffect(() => {
    const timers: number[] = []
    for (let i = 1; i <= 5; i++) timers.push(window.setTimeout(() => setLit(i), 500 + (i - 1) * 1000))
    const out = 500 + 4000 + 200 + Math.random() * 2800
    timers.push(window.setTimeout(() => (setLit(0), setAway(true)), out))
    timers.push(window.setTimeout(onDone, out + 2600))
    return () => timers.forEach((t) => window.clearTimeout(t))
  }, [onDone])
  useEffect(() => announce(away ? 'Lights out, and away we go.' : 'Start sequence. Five red lights.'), [announce, away])
  return (
    <Frame label="Lights out" className="inset-0 grid place-items-center bg-ink/85 backdrop-blur-sm">
      <div className="flex flex-col items-center gap-6 px-4 text-center">
        <StartLights lit={lit} size="lg" />
        <p aria-hidden="true" className={`font-display text-5xl leading-none transition-opacity duration-300 sm:text-7xl ${away ? 'opacity-100' : 'opacity-0'}`}>
          Lights out, <span className="italic text-star">and away we go.</span>
        </p>
        <Close onDone={onDone} />
      </div>
    </Frame>
  )
}
