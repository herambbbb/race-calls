// The spoiler guard's state: five lights on one by one, then out, then the reveal.
// Reduced motion reveals at once. The choice lasts for the browser session, per race.
import { useCallback, useEffect, useRef, useState } from 'react'

const STEP_MS = 280
const HOLD_MS = 650

function storageKey(key: string) {
  return `race-calls:revealed:${key}`
}

function remembered(key: string): boolean {
  try {
    return typeof window !== 'undefined' && window.sessionStorage.getItem(storageKey(key)) === '1'
  } catch {
    return false
  }
}

/** Whether the calls are shown, and a function that starts the reveal. */
export function useReveal(key: string, initial: boolean) {
  const [revealed, setRevealed] = useState(() => initial || remembered(key))
  const [lit, setLit] = useState(0)
  const [running, setRunning] = useState(false)
  const timers = useRef<number[]>([])

  useEffect(() => () => timers.current.forEach((t) => window.clearTimeout(t)), [])

  const finish = useCallback(() => {
    setRevealed(true)
    setRunning(false)
    try {
      window.sessionStorage.setItem(storageKey(key), '1')
    } catch {
      // Private mode: the reveal just does not persist.
    }
  }, [key])

  const start = useCallback(() => {
    if (running || revealed) return
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      finish()
      return
    }
    setRunning(true)
    for (let i = 1; i <= 5; i++) timers.current.push(window.setTimeout(() => setLit(i), i * STEP_MS))
    timers.current.push(window.setTimeout(finish, 5 * STEP_MS + HOLD_MS))
  }, [running, revealed, finish])

  return { revealed, lit, running, start }
}
