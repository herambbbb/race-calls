// Slims a committed record to what the site shows. Runs at build time (in the
// predictions plugin), so the raw request and response never reach the bundle.
// Imports carry .ts extensions because the Vite config (Node resolution) loads this file.
import type { Facts, PredictionRecord, SlimRecord, SlimRequest } from './types.ts'

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function slimRequest(request: unknown): SlimRequest | null {
  if (!isObject(request) || !isObject(request.questions)) return null
  const chaos = request.questions.chaos
  if (!isObject(chaos) || !Array.isArray(chaos.criteria)) return null
  return { questions: { chaos: { criteria: chaos.criteria.filter((c): c is string => typeof c === 'string') } } }
}

function facts(extra: unknown): Facts | null {
  if (!isObject(extra) || !isObject(extra.snapshot)) return null
  const { race_lines, drivers } = extra.snapshot
  const race = Array.isArray(race_lines) ? race_lines.filter((l): l is string => typeof l === 'string') : []
  const byCode: Record<string, string> = {}
  if (Array.isArray(drivers)) {
    for (const d of drivers) {
      if (isObject(d) && typeof d.code === 'string' && typeof d.line === 'string') byCode[d.code] = d.line
    }
  }
  return race.length || Object.keys(byCode).length ? { race, drivers: byCode } : null
}

/** Anything that is not an object passes through, so the loader's guard can reject it. */
export function slimRecord(value: unknown): unknown {
  if (!isObject(value)) return value
  const { response: _response, extra, snapshot_text: _snapshot, request, ...rest } = value as unknown as PredictionRecord
  const slim: SlimRecord = { ...rest, request: slimRequest(request), facts: facts(extra) }
  return slim
}
