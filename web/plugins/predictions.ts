// Vite plugin: `virtual:predictions` is a map from repository path
// ("predictions/2026/16-bahrain.json") to the slimmed record. The committed JSON is
// read at build time and never changed; only the fields the site shows are bundled.
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join, relative, sep } from 'node:path'
import type { Plugin } from 'vite'
import { slimRecord } from '../src/data/slim.ts'

const ID = 'virtual:predictions'
const RESOLVED = '\0' + ID

function jsonFiles(dir: string): string[] {
  if (!existsSync(dir)) return []
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = join(dir, entry.name)
    if (entry.isDirectory()) return jsonFiles(full)
    return entry.isFile() && entry.name.endsWith('.json') ? [full] : []
  })
}

/** Every record under <repoRoot>/predictions, slimmed, keyed by repository path. */
export function readSlimPredictions(repoRoot: string, warn: (msg: string) => void = console.warn) {
  const out: Record<string, unknown> = {}
  for (const file of jsonFiles(join(repoRoot, 'predictions')).sort()) {
    const path = relative(repoRoot, file).split(sep).join('/')
    try {
      out[path] = slimRecord(JSON.parse(readFileSync(file, 'utf8')))
    } catch {
      warn(`Skipping ${path}: not valid JSON`)
    }
  }
  return out
}

export function predictions(repoRoot: string): Plugin {
  const dir = join(repoRoot, 'predictions')
  return {
    name: 'race-calls-predictions',
    resolveId: (id) => (id === ID ? RESOLVED : undefined),
    load(id) {
      if (id !== RESOLVED) return undefined
      for (const file of jsonFiles(dir)) this.addWatchFile(file)
      const data = readSlimPredictions(repoRoot, (msg) => this.warn(msg))
      return `export default ${JSON.stringify(data)}`
    },
    configureServer(server) {
      // New or changed records during `pnpm dev`: rebuild the module and reload.
      server.watcher.add(dir)
      const refresh = (file: string) => {
        if (!file.startsWith(dir)) return
        const mod = server.moduleGraph.getModuleById(RESOLVED)
        if (mod) server.moduleGraph.invalidateModule(mod)
        server.ws.send({ type: 'full-reload' })
      }
      server.watcher.on('add', refresh)
      server.watcher.on('change', refresh)
      server.watcher.on('unlink', refresh)
    },
  }
}
