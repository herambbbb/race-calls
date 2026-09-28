// Key-free build check (task 4.3), run at the end of `pnpm build`.
// Scans dist/ for the value of every variable whose name ends in _API_KEY (TypeSafe,
// OpenRouter, or any later one), taken from the environment and from the repository
// root .env, and for anything shaped like an OpenRouter key. On a hit it prints only
// the file name and the variable NAME, then exits 1. It never prints a key value or any
// part of one.
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

export const KEY_PATTERN = /sk-or-v1-[0-9a-f]{16,}/
const PATTERN_NAME = 'sk-or-v1 key pattern'
const KEY_NAME = /^[A-Za-z_][A-Za-z0-9_]*_API_KEY$/

// Shorter values would match ordinary text; real keys are far longer than this.
const MIN_KEY_LENGTH = 16

/** Every *_API_KEY variable in a dotenv file, as { name, value }. Never logs values. */
export function readKeysFromEnvFile(path) {
  if (!existsSync(path)) return []
  const keys = []
  for (const raw of readFileSync(path, 'utf8').split(/\r?\n/)) {
    const m = raw.match(/^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/)
    if (!m || !KEY_NAME.test(m[1] ?? '')) continue
    let value = (m[2] ?? '').trim()
    const quoted = value.match(/^(['"])(.*)\1$/)
    if (quoted) value = quoted[2] ?? ''
    else value = value.replace(/\s+#.*$/, '')
    if (value) keys.push({ name: m[1], value })
  }
  return keys
}

/** *_API_KEY values from an environment object and a dotenv file, long enough to search for. */
export function collectKeys(env, envFile) {
  const fromEnv = Object.entries(env)
    .filter(([name, value]) => KEY_NAME.test(name) && typeof value === 'string' && value)
    .map(([name, value]) => ({ name, value }))
  const seen = new Set()
  return [...fromEnv, ...readKeysFromEnvFile(envFile)].filter(({ value }) => {
    if (value.length < MIN_KEY_LENGTH || seen.has(value)) return false
    seen.add(value)
    return true
  })
}

function* walk(dir) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name)
    if (entry.isDirectory()) yield* walk(full)
    else if (entry.isFile()) yield full
  }
}

/** Hits as { file, name }: file relative to dir, name of the variable (or the pattern). */
export function findSecrets(dir, keys) {
  const needles = keys
    .filter(({ value }) => value.length >= MIN_KEY_LENGTH)
    .map(({ name, value }) => ({ name, bytes: Buffer.from(value) }))
  const hits = []
  for (const file of walk(dir)) {
    const bytes = readFileSync(file)
    const rel = relative(dir, file)
    for (const { name, bytes: needle } of needles) {
      if (bytes.includes(needle)) hits.push({ file: rel, name })
    }
    if (KEY_PATTERN.test(bytes.toString('latin1'))) hits.push({ file: rel, name: PATTERN_NAME })
  }
  return hits
}

/** The whole check; returns the exit code. Output goes only through log and error. */
export function run({ dist, env, envFile, log = console.log, error = console.error }) {
  if (!existsSync(dist)) {
    error('check-no-secrets: dist/ not found; run the build first')
    return 1
  }
  const keys = collectKeys(env, envFile)
  const hits = findSecrets(dist, keys)
  if (hits.length > 0) {
    error('check-no-secrets: an API key was found in the build output:')
    for (const { file, name } of hits) error(`  ${file} (${name})`)
    return 1
  }
  const names = [...new Set(keys.map((k) => k.name))].join(', ')
  log(`check-no-secrets: no key in dist/ (checked ${names || 'no key values'} and the key pattern)`)
  return 0
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const here = fileURLToPath(new URL('.', import.meta.url))
  process.exitCode = run({
    dist: resolve(here, '../dist'),
    env: process.env,
    envFile: resolve(here, '../../.env'),
  })
}
