// Reads from the parts of a record the schema leaves open (the raw request).
import type { RecordDriver, SlimRecord } from './types'

/** The rubric exactly as Jev saw it, from the recorded request. */
export function chaosCriteria(record: SlimRecord): string[] {
  const criteria: unknown = record.request?.questions?.chaos?.criteria
  return Array.isArray(criteria) ? criteria.filter((c): c is string => typeof c === 'string') : []
}

/**
 * Jev's podium: the three drivers with the highest podium probability, most likely
 * first. Ties break by driver code, so the pick never depends on key order.
 */
export function podiumPick(podium: Record<string, number>, size = 3): [string, number][] {
  return Object.entries(podium)
    .sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0))
    .slice(0, size)
}

export interface RubricLine {
  level: number | null
  /** The level's one-word name, e.g. "lively". */
  word: string | null
  /** The whole line, exactly as sent. */
  text: string
}

/** Splits "1: lively - a virtual safety car, ..." for display; the text stays whole. */
export function rubricLine(text: string): RubricLine {
  // "1: lively - a virtual safety car, ...", or just "1: lively".
  const m = /^(\d+):\s*(.+?)(?:\s+-\s|\s*$)/.exec(text)
  return { level: m ? Number(m[1]) : null, word: m ? m[2]!.trim() : null, text }
}

/** The one-word name of a level, from the rubric Jev saw. */
export function levelWord(criteria: string[], level: number): string | null {
  return criteria.map(rubricLine).find((l) => l.level === level)?.word ?? null
}

export function driverLookup(drivers: RecordDriver[]) {
  return new Map(drivers.map((d) => [d.code, d]))
}

/** "calm to lively" for 0.92; one word on a whole level. */
export function levelSpan(criteria: string[], value: number): string | null {
  const v = Math.max(0, Math.min(4, value))
  const lo = levelWord(criteria, Math.floor(v))
  const hi = levelWord(criteria, Math.ceil(v))
  if (!lo || !hi) return null
  return lo === hi ? lo : `${lo} to ${hi}`
}
