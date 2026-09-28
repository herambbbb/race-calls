// Key-free build check (task 4.3), run at the end of `pnpm build`.
// Scans dist/ for the OpenRouter key's value (from the environment, else read from
// ../.env) and for anything shaped like an OpenRouter key. On a hit it prints only the
// file name and exits 1. It never prints the key or any part of it.
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

export const KEY_PATTERN = /sk-or-v1-[0-9a-f]{16,}/

// Shorter values would match ordinary text; real keys are far longer than this.
const MIN_KEY_LENGTH = 16

/** OPENROUTER_API_KEY from a dotenv file, or null. Never logs the value. */
export function readKeyFromEnvFile(path) {
  if (!existsSync(path)) return null
  for (const raw of readFileSync(path, 'utf8').split(/\r?\n/)) {
    const m = raw.match(/^\s*(?:export\s+)?OPENROUTER_API_KEY\s*=\s*(.*)$/)
    if (!m) continue
    let value = (m[1] ?? '').trim()
    const quoted = value.match(/^(['"])(.*)\1$/)
    if (quoted) value = quoted[2] ?? ''
    else value = value.replace(/\s+#.*$/, '')
    return value || null
  }
  return null
}

function* walk(dir) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name)
    if (entry.isDirectory()) yield* walk(full)
    else if (entry.isFile()) yield full
  }
}

/** Files under dir that contain the key or the key pattern, relative to dir. */
export function findSecrets(dir, key) {
  const needle = key && key.length >= MIN_KEY_LENGTH ? Buffer.from(key) : null
  const hits = []
  for (const file of walk(dir)) {
    const bytes = readFileSync(file)
    if ((needle && bytes.includes(needle)) || KEY_PATTERN.test(bytes.toString('latin1'))) {
      hits.push(relative(dir, file))
    }
  }
  return hits
}

function main() {
  const here = fileURLToPath(new URL('.', import.meta.url))
  const dist = resolve(here, '../dist')
  if (!existsSync(dist)) {
    console.error('check-no-secrets: dist/ not found; run the build first')
    process.exit(1)
  }
  const key = process.env.OPENROUTER_API_KEY || readKeyFromEnvFile(resolve(here, '../../.env'))
  const hits = findSecrets(dist, key)
  if (hits.length > 0) {
    console.error('check-no-secrets: an API key was found in the build output:')
    for (const f of hits) console.error(`  ${f}`)
    process.exit(1)
  }
  console.log(`check-no-secrets: no key in dist/ (${key ? 'key value and pattern' : 'pattern only'})`)
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main()
