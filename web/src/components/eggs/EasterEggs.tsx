// The paddock secrets. Typed sequences and logo taps start a small scene; one plays at
// a time, Escape dismisses it, and the keyboard secrets can be switched off in the
// footer (WCAG 2.1.4). Scenes speak through one persistent live region, so each is
// announced once, never frame by frame. Nothing blocks the page: scenes let clicks
// through except on their Close buttons.
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { listensTo, loadFound, loadKeysOn, pressKey, RADIO, saveFound, saveKeysOn, type EggId } from '../../data/eggs'
import { EggsContext } from './context'
import { LightsOutScene, PitStopScene, RadioScene, SafetyCarScene } from './Scenes'

const DRS_MS = 12_000
const TEXT_ROLES = ['textbox', 'combobox', 'searchbox', 'slider', 'spinbutton']

function inField(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false
  return (
    target.isContentEditable ||
    ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName) ||
    TEXT_ROLES.includes(target.getAttribute('role') ?? '')
  )
}

type Scene = { id: Exclude<EggId, 'drs' | 'flag'>; key: number; radio: number }

const storage = () => (typeof window === 'undefined' ? undefined : window.localStorage)

export function EasterEggs({ children }: { children: ReactNode }) {
  const [found, setFound] = useState<Set<EggId>>(() => loadFound(storage()))
  const [keysOn, setKeysOnState] = useState(() => loadKeysOn(storage()))
  const [scene, setScene] = useState<Scene | null>(null)
  const [drs, setDrs] = useState(false)
  const [message, setMessage] = useState('')
  const buffer = useRef<string[]>([])
  const taps = useRef({ count: 0, timer: 0 })
  const drsTimer = useRef(0)
  // Which radio message is next; picked at random on the first call.
  const radioTurn = useRef(-1)

  const announce = useCallback((text: string) => setMessage(text), [])

  const markFound = useCallback((id: EggId) => {
    setFound((prev) => {
      if (prev.has(id)) return prev
      const next = new Set(prev).add(id)
      saveFound(storage(), next)
      return next
    })
  }, [])

  const trigger = useCallback(
    (id: EggId) => {
      markFound(id)
      if (id === 'flag') return
      if (id === 'drs') {
        setDrs(true)
        announce('DRS enabled.')
        window.clearTimeout(drsTimer.current)
        drsTimer.current = window.setTimeout(() => setDrs(false), DRS_MS)
        return
      }
      if (id === 'radio' && radioTurn.current < 0) radioTurn.current = Math.floor(Math.random() * RADIO.length)
      setScene({ id, key: Date.now(), radio: id === 'radio' ? radioTurn.current++ : 0 })
    },
    [markFound, announce],
  )

  const tapMark = useCallback(() => {
    const t = taps.current
    t.count++
    window.clearTimeout(t.timer)
    t.timer = window.setTimeout(() => {
      if (t.count >= 5) trigger('lights')
      else if (t.count >= 3) trigger('radio')
      t.count = 0
    }, 450)
  }, [trigger])

  const setKeysOn = useCallback((on: boolean) => {
    setKeysOnState(on)
    saveKeysOn(storage(), on)
    buffer.current = []
  }, [])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setScene(null)
        return
      }
      const press = {
        key: e.key,
        repeat: e.repeat,
        isComposing: e.isComposing,
        metaKey: e.metaKey,
        ctrlKey: e.ctrlKey,
        altKey: e.altKey,
        inField: inField(e.target),
      }
      if (!keysOn || !listensTo(press)) return
      // T for talk: in no other sequence, so it always means the radio.
      if (e.key.toLowerCase() === 't') {
        buffer.current = []
        trigger('radio')
        return
      }
      const r = pressKey(buffer.current, e.key)
      buffer.current = r.buffer
      if (r.egg) trigger(r.egg)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [trigger, keysOn])

  useEffect(() => {
    const root = document.documentElement
    root.classList.toggle('drs-open', drs)
    return () => root.classList.remove('drs-open')
  }, [drs])

  useEffect(
    () => () => {
      window.clearTimeout(drsTimer.current)
      window.clearTimeout(taps.current.timer)
    },
    [],
  )

  const value = useMemo(
    () => ({ found, drs, keysOn, setKeysOn, trigger, tapMark }),
    [found, drs, keysOn, setKeysOn, trigger, tapMark],
  )
  const close = useCallback(() => setScene(null), [])

  return (
    <EggsContext.Provider value={value}>
      {children}
      {scene?.id === 'radio' && <RadioScene key={scene.key} turn={scene.radio} onDone={close} announce={announce} />}
      {scene?.id === 'box' && <PitStopScene key={scene.key} onDone={close} announce={announce} />}
      {scene?.id === 'safety' && <SafetyCarScene key={scene.key} onDone={close} announce={announce} />}
      {scene?.id === 'lights' && <LightsOutScene key={scene.key} onDone={close} announce={announce} />}
      {drs && (
        <div aria-hidden="true" className="drs-streaks pointer-events-none fixed inset-0 z-[55]">
          {Array.from({ length: 14 }, (_, i) => (
            <span key={i} style={{ top: `${(i * 53) % 100}%`, animationDelay: `${(i * 137) % 900}ms` }} />
          ))}
        </div>
      )}
      {/* One persistent live region: mounted from the start, so every message is heard. */}
      <p aria-live="polite" aria-atomic="true" className="sr-only">
        {message}
      </p>
    </EggsContext.Provider>
  )
}
