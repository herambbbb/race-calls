import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { collectKeys, findSecrets, readKeysFromEnvFile, run } from './check-no-secrets.mjs'

// Fake values only: none is a real key.
const FAKE_TYPESAFE = 'fake-typesafe-key-for-tests-0123456789'
const FAKE_OPENROUTER = 'fake-openrouter-key-for-tests-9876543210'
const FAKE_PATTERN = 'sk-or-v1-' + 'deadbeef'.repeat(4)
const FAKES = [FAKE_TYPESAFE, FAKE_OPENROUTER, FAKE_PATTERN]

let root, dist, envFile
beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'race-calls-secrets-'))
  dist = join(root, 'dist')
  envFile = join(root, '.env')
  mkdirSync(join(dist, 'assets'), { recursive: true })
  writeFileSync(join(dist, 'index.html'), '<!doctype html><title>Race Calls</title>')
  writeFileSync(join(dist, 'assets', 'app.js'), 'console.log("clean")')
  writeFileSync(envFile, `# comment\nOTHER=1\nTYPESAFE_API_KEY="${FAKE_TYPESAFE}"\n`)
})
afterEach(() => rmSync(root, { recursive: true, force: true }))

/** Runs the check and returns its exit code and everything it printed. */
function check(env = {}) {
  const lines = []
  const code = run({ dist, env, envFile, log: (l) => lines.push(l), error: (l) => lines.push(l) })
  return { code, output: lines.join('\n') }
}

function expectNoValues(output) {
  for (const fake of FAKES) {
    expect(output).not.toContain(fake)
    expect(output).not.toContain(fake.slice(0, 12))
  }
}

describe('check-no-secrets', () => {
  it('passes on a clean build', () => {
    const { code, output } = check({ OPENROUTER_API_KEY: FAKE_OPENROUTER })
    expect(code).toBe(0)
    expect(output).toContain('TYPESAFE_API_KEY')
    expectNoValues(output)
  })

  it('catches a TypeSafe key from the .env and names only the file and variable', () => {
    writeFileSync(join(dist, 'assets', 'leak.js'), `const k = "${FAKE_TYPESAFE}"`)
    const { code, output } = check()
    expect(code).toBe(1)
    expect(output).toContain(`${join('assets', 'leak.js')} (TYPESAFE_API_KEY)`)
    expectNoValues(output)
  })

  it('still catches an OpenRouter key from the environment', () => {
    writeFileSync(join(dist, 'index.html'), `<script>var k="${FAKE_OPENROUTER}"</script>`)
    const { code, output } = check({ OPENROUTER_API_KEY: FAKE_OPENROUTER })
    expect(code).toBe(1)
    expect(output).toContain('index.html (OPENROUTER_API_KEY)')
    expectNoValues(output)
  })

  it('catches the key pattern without knowing any key', () => {
    writeFileSync(envFile, '')
    writeFileSync(join(dist, 'assets', 'leak.js'), `headers: { a: "Bearer ${FAKE_PATTERN}" }`)
    const { code, output } = check()
    expect(code).toBe(1)
    expect(output).toContain(`${join('assets', 'leak.js')} (sk-or-v1 key pattern)`)
    expectNoValues(output)
  })

  it('fails when there is no dist/', () => {
    rmSync(dist, { recursive: true })
    expect(check().code).toBe(1)
  })
})

describe('collecting keys', () => {
  it('reads every *_API_KEY from the file, plain, quoted, or exported', () => {
    writeFileSync(
      envFile,
      `export OPENROUTER_API_KEY='${FAKE_OPENROUTER}'\nTYPESAFE_API_KEY=${FAKE_TYPESAFE} # note\nAPI_KEY_HINT=nope\n`,
    )
    expect(readKeysFromEnvFile(envFile)).toEqual([
      { name: 'OPENROUTER_API_KEY', value: FAKE_OPENROUTER },
      { name: 'TYPESAFE_API_KEY', value: FAKE_TYPESAFE },
    ])
  })

  it('merges the environment and the file, ignoring short values, other names, and repeats', () => {
    const keys = collectKeys(
      { TYPESAFE_API_KEY: FAKE_TYPESAFE, SHORT_API_KEY: 'abc', PATH: '/usr/bin:/bin:/usr/local/bin' },
      envFile,
    )
    expect(keys).toEqual([{ name: 'TYPESAFE_API_KEY', value: FAKE_TYPESAFE }])
  })

  it('returns nothing for a missing file', () => {
    expect(readKeysFromEnvFile(join(root, 'nope'))).toEqual([])
    expect(findSecrets(dist, [])).toEqual([])
  })
})
