import { copyFileSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { readSlimPredictions } from './predictions.ts'

const EXAMPLE = new URL('../../contracts/prediction-record.example.json', import.meta.url)
const PATH = 'predictions/2026/99-example-grand-prix.json'

let root: string
beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'race-calls-predictions-'))
  mkdirSync(join(root, 'predictions', '2026'), { recursive: true })
  copyFileSync(EXAMPLE, join(root, PATH))
})
afterEach(() => rmSync(root, { recursive: true, force: true }))

describe('readSlimPredictions', () => {
  it('keys each record by its repository path, for the commit link', () => {
    expect(Object.keys(readSlimPredictions(root))).toEqual([PATH])
  })

  it('keeps the rubric, the hash, the calls, and the header fields', () => {
    const slim = readSlimPredictions(root)[PATH] as Record<string, unknown>
    expect(slim.request).toEqual({
      questions: { chaos: { criteria: ['0: calm', '1: lively', '2: eventful', '3: chaotic', '4: bedlam'] } },
    })
    expect(slim.request_hash).toMatch(/^0{64}$/)
    expect(slim.calls).toBeTruthy()
    expect(slim.jev).toBeTruthy()
    expect(slim.drivers).toHaveLength(3)
    expect(slim.race_name).toBe('Example Grand Prix')
    expect(slim.schema_version).toBe(1)
  })

  it('drops the response, the snapshot, the extras, and the question texts', () => {
    const slim = readSlimPredictions(root)[PATH] as Record<string, unknown>
    for (const key of ['response', 'snapshot_text', 'extra']) expect(slim).not.toHaveProperty(key)
    const json = JSON.stringify(slim)
    expect(json).not.toContain('Will Lando Norris')
    expect(json).not.toContain('instructions')
  })

  it('is empty without a predictions directory, and skips invalid JSON', () => {
    expect(readSlimPredictions(join(root, 'nowhere'))).toEqual({})
    writeFileSync(join(root, 'predictions', '2026', '1-broken.json'), '{')
    const warnings: string[] = []
    expect(Object.keys(readSlimPredictions(root, (m) => warnings.push(m)))).toEqual([PATH])
    expect(warnings).toEqual(['Skipping predictions/2026/1-broken.json: not valid JSON'])
  })
})
