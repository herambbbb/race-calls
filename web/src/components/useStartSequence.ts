// A real race start, as a count of lit lights: they come on one a second, hold for a
// random 0.2 to 3 seconds, then all go out together, and after a dark pause the
// sequence runs again. It only runs while its element is on screen. With reduced
// motion requested, all five stay lit and nothing changes.
import { useEffect, useRef, useState, type RefObject } from 'react'
import { useMediaQuery } from './useMediaQuery'

export const STEP_MS = 1000
const FIRST_MS = 700
const DARK_MS = 2600

export function useStartSequence<T extends Element>(): { ref: RefObject<T | null>; lit: number } {
  const ref = useRef<T>(null)
  const reduced = useMediaQuery('(prefers-reduced-motion: reduce)')
  const [running, setLit] = useState(0)

  useEffect(() => {
    const el = ref.current
    if (reduced || !el || typeof IntersectionObserver === 'undefined') return
    let timer = 0
    let visible = false
    const run = (n: number) => {
      if (!visible) return
      setLit(n)
      if (n < 5) timer = window.setTimeout(() => run(n + 1), STEP_MS)
      else
        timer = window.setTimeout(() => {
          setLit(0)
          timer = window.setTimeout(() => run(1), DARK_MS)
        }, 200 + Math.random() * 2800)
    }
    const observer = new IntersectionObserver(([entry]) => {
      const now = Boolean(entry?.isIntersecting)
      if (now === visible) return
      visible = now
      window.clearTimeout(timer)
      if (visible) timer = window.setTimeout(() => run(1), FIRST_MS)
      else setLit(0)
    })
    observer.observe(el)
    return () => {
      observer.disconnect()
      window.clearTimeout(timer)
    }
  }, [reduced])

  return { ref, lit: reduced ? 5 : running }
}
