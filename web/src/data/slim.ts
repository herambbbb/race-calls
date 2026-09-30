// Slims a committed record to what the site shows. Runs at build time (in the
// predictions plugin), so the raw request and response never reach the bundle; of the
// response, only Jev's chance for each chaos level survives, as `chaos_levels`.
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

/** Jev's chance for each chaos level ("0" to "4"), the one part of the response kept. */
function chaosLevels(response: unknown): Record<string, number> | null {
  if (!isObject(response) || !isObject(response.answers)) return null
  const chaos = response.answers.chaos
  if (!isObject(chaos) || !isObject(chaos.probabilities)) return null
  const levels: Record<string, number> = {}
  for (const [level, p] of Object.entries(chaos.probabilities)) {
    if (typeof p === 'number' && Number.isFinite(p)) levels[level] = p
  }
  return Object.keys(levels).length ? levels : null
}

/** Anything that is not an object passes through, so the loader's guard can reject it. */
export function slimRecord(value: unknown): unknown {
  if (!isObject(value)) return value
  const { response, extra, snapshot_text: _snapshot, request, ...rest } = value as unknown as PredictionRecord
  const levels = chaosLevels(response)
  const slim: SlimRecord = { ...rest, request: slimRequest(request), facts: facts(extra), ...(levels && { chaos_levels: levels }) }
  return slim
}
