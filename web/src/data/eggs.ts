// The paddock secrets: what they are, how they are typed, and which ones a visitor has
// found (kept in this browser only). Pure, so it can be tested without a page.

export type EggId = 'radio' | 'box' | 'drs' | 'safety' | 'lights' | 'flag'

export const EGGS: readonly EggId[] = ['radio', 'box', 'drs', 'safety', 'lights', 'flag']

/** Typed sequences, matched against the end of what was typed. */
export const SEQUENCES: { id: EggId; keys: string[] }[] = [
  { id: 'box', keys: ['b', 'o', 'x'] },
  { id: 'drs', keys: ['d', 'r', 's'] },
  {
    id: 'safety',
    keys: ['arrowup', 'arrowup', 'arrowdown', 'arrowdown', 'arrowleft', 'arrowright', 'arrowleft', 'arrowright', 'b', 'a'],
  },
]

const LONGEST = Math.max(...SEQUENCES.map((s) => s.keys.length))

/** Adds a key to the typed buffer and returns the new buffer and any egg it completes. */
export function pressKey(buffer: string[], key: string): { buffer: string[]; egg: EggId | null } {
  const next = [...buffer, key.toLowerCase()].slice(-LONGEST)
  for (const { id, keys } of SEQUENCES) {
    if (next.length >= keys.length && keys.every((k, i) => next[next.length - keys.length + i] === k)) {
      return { buffer: [], egg: id }
    }
  }
  return { buffer: next, egg: null }
}

/** Jev on the team radio. Jev gives no reasons, which is most of the joke. */
export const RADIO: { from: string; line: string }[][] = [
  [
    { from: 'Engineer', line: 'Jev, can you explain the 94% on pole?' },
    { from: 'Jev', line: 'Leave me alone. I know what I am doing.' },
  ],
  [
    { from: 'Jev', line: 'Is there a leakage?' },
    { from: 'Engineer', line: 'A leakage of what?' },
    { from: 'Jev', line: 'Probability. The podium adds up to 3.12.' },
  ],
  [
    { from: 'Engineer', line: 'Plan B, Jev. Plan B.' },
    { from: 'Jev', line: 'Copy. Plan B is 41%.' },
  ],
  [
    { from: 'Engineer', line: 'Did you learn anything from the backtests?' },
    { from: 'Jev', line: 'I may have seen the results.' },
    { from: 'Engineer', line: 'Well done.' },
  ],
  [
    { from: 'Engineer', line: 'Box, box. Box this lap.' },
    { from: 'Jev', line: 'Negative. I am committed. It is in the repository.' },
  ],
  [
    { from: 'Jev', line: 'Why are we losing to the grid baseline?' },
    { from: 'Engineer', line: 'We are checking.' },
  ],
  [
    { from: 'Engineer', line: 'Chaos is 0.92. Lovely and calm out there.' },
    { from: 'Jev', line: 'Red flag. Red flag.' },
  ],
  [
    { from: 'Engineer', line: 'Give us your reasons for the call, Jev.' },
    { from: 'Jev', line: 'Numbers only, mate. Numbers only.' },
  ],
]

export function radioFor(index: number) {
  return RADIO[((index % RADIO.length) + RADIO.length) % RADIO.length]!
}

/** A pit stop time between 1.80 and 2.65 seconds; mostly quick, sometimes a slow one. */
export function pitStopTime(r: number): number {
  return Math.round((1.8 + r * r * 0.85) * 100) / 100
}

const STORE = 'race-calls:secrets'

export function loadFound(storage: Pick<Storage, 'getItem'> | undefined): Set<EggId> {
  try {
    const raw = storage?.getItem(STORE)
    const list: unknown = raw ? JSON.parse(raw) : []
    return new Set(Array.isArray(list) ? list.filter((e): e is EggId => EGGS.includes(e as EggId)) : [])
  } catch {
    return new Set()
  }
}

export function saveFound(storage: Pick<Storage, 'setItem'> | undefined, found: Set<EggId>) {
  try {
    storage?.setItem(STORE, JSON.stringify([...found]))
  } catch {
    // Private mode: the count just does not persist.
  }
}

/** The parts of a key press the secrets care about. */
export interface KeyPress {
  key: string
  repeat: boolean
  isComposing: boolean
  metaKey: boolean
  ctrlKey: boolean
  altKey: boolean
  /** The focused element is a text field or text-like widget. */
  inField: boolean
}

/** Whether a key press is for us: never while typing, composing, repeating, or chording. */
export function listensTo(e: KeyPress): boolean {
  return !(e.repeat || e.isComposing || e.metaKey || e.ctrlKey || e.altKey || e.inField)
}

const KEYS_STORE = 'race-calls:keyboard-secrets'

/** Keyboard secrets can be switched off (WCAG 2.1.4); they are on unless turned off. */
export function loadKeysOn(storage: Pick<Storage, 'getItem'> | undefined): boolean {
  try {
    return storage?.getItem(KEYS_STORE) !== 'off'
  } catch {
    return true
  }
}

export function saveKeysOn(storage: Pick<Storage, 'setItem'> | undefined, on: boolean) {
  try {
    storage?.setItem(KEYS_STORE, on ? 'on' : 'off')
  } catch {
    // Private mode: the choice just does not persist.
  }
}
