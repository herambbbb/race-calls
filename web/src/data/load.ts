// Reads the committed prediction records at build time. The predictions plugin
// (plugins/predictions.ts) reads ../predictions, slims each record to the fields the
// site shows, and inlines them, so the deployed site is static and the loader never
// fetches. If predictions/ does not exist yet the module is empty and the site still
// builds.
import predictions from 'virtual:predictions'
import scores from 'virtual:scores'
import { parseScores, type ScoreRecord } from './scores'
import type { Kind, LoadedRecord, SlimRecord, Status } from './types'

const SCHEMA_VERSION = 1
const KINDS: readonly Kind[] = ['live', 'backtest']
const STATUSES: readonly Status[] = ['ok', 'no_prediction', 'failed']

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/**
 * A small runtime guard: the fields every page relies on, and a known schema version.
 * Deeper structure (drivers, calls) is written by the pipeline's own validated model.
 */
export function isRecord(value: unknown): value is SlimRecord {
  if (!isObject(value)) return false
  const version = value.schema_version ?? SCHEMA_VERSION
  if (version !== SCHEMA_VERSION) return false
  const { season, round, slug, race_name, circuit_name, race_start, kind, status, made_at, late } = value
  return (
    Number.isInteger(season) &&
    Number.isInteger(round) &&
    typeof slug === 'string' &&
    typeof race_name === 'string' &&
    typeof circuit_name === 'string' &&
    typeof race_start === 'string' &&
    typeof made_at === 'string' &&
    typeof late === 'boolean' &&
    KINDS.includes(kind as Kind) &&
    STATUSES.includes(status as Status) &&
    (value.drivers === undefined || Array.isArray(value.drivers)) &&
    (value.calls === undefined || value.calls === null || isObject(value.calls))
  )
}

/** Turns a map (repository path to parsed JSON) into records; rejects what it cannot read. */
export function parseRecords(modules: Record<string, unknown>): LoadedRecord[] {
  const out: LoadedRecord[] = []
  for (const [file, data] of Object.entries(modules)) {
    if (!isRecord(data)) {
      console.warn(`Skipping ${file}: not a prediction record this site can read`)
      continue
    }
    const at = file.lastIndexOf('predictions/')
    out.push({ record: data, path: at >= 0 ? file.slice(at) : file })
  }
  return out.sort((a, b) => b.record.season - a.record.season || a.record.round - b.record.round)
}

export function byKind(records: LoadedRecord[], kind: Kind): LoadedRecord[] {
  return records.filter((r) => r.record.kind === kind)
}

/** The record for a round; for live races, the latest season wins. */
export function findRecord(records: LoadedRecord[], kind: Kind, round: number): LoadedRecord | undefined {
  return byKind(records, kind).find((r) => r.record.round === round)
}

export const RECORDS: LoadedRecord[] = parseRecords(predictions)

export const SCORES: ScoreRecord[] = parseScores(scores)

/** The score for a record, matched on season, round, and kind. */
export function findScore(record: SlimRecord, all: ScoreRecord[] = SCORES): ScoreRecord | undefined {
  return all.find((s) => s.season === record.season && s.round === record.round && s.kind === record.kind)
}

/** "Rounds 1 to 14 of 2026", from the records themselves. */
export function backtestSpan(records: LoadedRecord[]): string {
  const seasons = [...new Set(records.map((r) => r.record.season))]
  if (seasons.length !== 1) return `${records.length} past races`
  const rounds = records.map((r) => r.record.round)
  return `Rounds ${Math.min(...rounds)} to ${Math.max(...rounds)} of ${seasons[0]}`
}
