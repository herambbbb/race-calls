// Mirrors contracts/prediction-record.schema.json (PredictionRecord, schema_version 1).
// Fields the schema requires are required here; fields with a schema default may be
// absent from a record on disk, so they are optional. Nullable fields stay nullable.

export type Kind = 'live' | 'backtest'
export type Status = 'ok' | 'no_prediction' | 'failed'

export interface RecordDriver {
  code: string
  name: string
  number: number | null
  constructor: string
  constructor_id: string
  grid: number
}

export interface WinnerCall {
  choice: string
  confidence: number | null
  probabilities: Record<string, number>
}

export interface ChaosCall {
  score: number
  confidence: number | null
}

export interface Calls {
  podium: Record<string, number>
  winner: WinnerCall
  chaos: ChaosCall
}

export interface JevMeta {
  url: string
  model_requested: string
  model_id: string | null
  provider: string | null
  generation_id: string | null
  cost_usd: number | null
  input_tokens: number | null
  output_tokens: number | null
  latency_ms: number
  requested_at: string
}

export interface PredictionRecord {
  schema_version?: number
  season: number
  round: number
  slug: string
  race_name: string
  circuit_name: string
  race_start: string
  kind: Kind
  status: Status
  made_at: string
  late: boolean
  note?: string | null
  grid_provisional?: boolean
  drivers?: RecordDriver[]
  snapshot_text?: string | null
  request?: Record<string, unknown> | null
  request_hash?: string | null
  response?: Record<string, unknown> | null
  jev?: JevMeta | null
  calls?: Calls | null
  error?: string | null
  extra?: Record<string, unknown>
}

/** The only part of the raw request the site shows: the chaos rubric Jev saw. */
export interface SlimRequest {
  questions: { chaos: { criteria: string[] } }
}

/**
 * The plain-English facts Jev was given, from the recorded snapshot: the race-level
 * lines, and one line per driver keyed by driver code.
 */
export interface Facts {
  race: string[]
  drivers: Record<string, string>
}

/**
 * What the build ships for each record: the full record minus the raw response, the
 * snapshot text, the extras, and every part of the request except the chaos rubric.
 * The snapshot's fact lines survive as `facts`.
 */
export type SlimRecord = Omit<PredictionRecord, 'response' | 'extra' | 'snapshot_text' | 'request'> & {
  request?: SlimRequest | null
  facts?: Facts | null
}

/** A record plus where it lives in the repository (for the commit-history link). */
export interface LoadedRecord {
  record: SlimRecord
  /** Repository-relative path, e.g. "predictions/2026/16-bahrain.json". */
  path: string
}
