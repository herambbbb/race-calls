import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { findSecrets, readKeyFromEnvFile } from './check-no-secrets.mjs'

// Fake values only: neither is a real key.
const FAKE_KEY = 'fake-openrouter-key-for-tests-0123456789'
const FAKE_PATTERN = 'sk-or-v1-' + 'deadbeef'.repeat(4)

let dir
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'race-calls-secrets-'))
  mkdirSync(join(dir, 'assets'))
  writeFileSync(join(dir, 'index.html'), '<!doctype html><title>Race Calls</title>')
  writeFileSync(join(dir, 'assets', 'app.js'), 'console.log("clean")')
})
afterEach(() => rmSync(dir, { recursive: true, force: true }))

describe('findSecrets', () => {
  it('passes on a clean directory', () => {
    expect(findSecrets(dir, FAKE_KEY)).toEqual([])
    expect(findSecrets(dir, null)).toEqual([])
  })

  it('catches the key value and reports only the file', () => {
    writeFileSync(join(dir, 'assets', 'leak.js'), `const k = "${FAKE_KEY}"`)
    expect(findSecrets(dir, FAKE_KEY)).toEqual([join('assets', 'leak.js')])
  })

  it('catches the key pattern without knowing the key', () => {
    writeFileSync(join(dir, 'assets', 'leak.js'), `fetch(u, { headers: { a: "Bearer ${FAKE_PATTERN}" } })`)
    expect(findSecrets(dir, null)).toEqual([join('assets', 'leak.js')])
  })

  it('ignores a key too short to search for safely', () => {
    expect(findSecrets(dir, 'a')).toEqual([])
  })
})

describe('readKeyFromEnvFile', () => {
  it('reads plain, quoted, and exported values', () => {
    const env = join(dir, '.env')
    writeFileSync(env, `# comment\nOTHER=1\nexport OPENROUTER_API_KEY="${FAKE_KEY}"\n`)
    expect(readKeyFromEnvFile(env)).toBe(FAKE_KEY)
    writeFileSync(env, `OPENROUTER_API_KEY=${FAKE_KEY} # note\n`)
    expect(readKeyFromEnvFile(env)).toBe(FAKE_KEY)
  })

  it('returns null for a missing file or key', () => {
    expect(readKeyFromEnvFile(join(dir, 'nope'))).toBeNull()
    writeFileSync(join(dir, '.env'), 'OTHER=1\n')
    expect(readKeyFromEnvFile(join(dir, '.env'))).toBeNull()
  })
})
