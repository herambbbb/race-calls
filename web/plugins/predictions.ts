// Vite plugin, two virtual modules read from the repository at build time:
//   `virtual:predictions`  repository path ("predictions/2026/16-bahrain.json") to the
//                          slimmed record; only the fields the site shows are bundled.
//   `virtual:scores`       repository path ("scores/2026/16-bahrain.json") to the score
//                          record, as committed by the post-race job.
// The committed JSON is read and never changed. A missing directory is an empty module.
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join, relative, sep } from 'node:path'
import type { Plugin } from 'vite'
import { slimRecord } from '../src/data/slim.ts'

const MODULES = {
  'virtual:predictions': { dir: 'predictions', read: slimRecord },
  'virtual:scores': { dir: 'scores', read: (value: unknown) => value },
} as const

type Id = keyof typeof MODULES

function jsonFiles(dir: string): string[] {
  if (!existsSync(dir)) return []
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = join(dir, entry.name)
    if (entry.isDirectory()) return jsonFiles(full)
    return entry.isFile() && entry.name.endsWith('.json') ? [full] : []
  })
}

function readDir(repoRoot: string, id: Id, warn: (msg: string) => void) {
  const { dir, read } = MODULES[id]
  const out: Record<string, unknown> = {}
  for (const file of jsonFiles(join(repoRoot, dir)).sort()) {
    const path = relative(repoRoot, file).split(sep).join('/')
    try {
      out[path] = read(JSON.parse(readFileSync(file, 'utf8')))
    } catch {
      warn(`Skipping ${path}: not valid JSON`)
    }
  }
  return out
}

/** Every record under <repoRoot>/predictions, slimmed, keyed by repository path. */
export function readSlimPredictions(repoRoot: string, warn: (msg: string) => void = console.warn) {
  return readDir(repoRoot, 'virtual:predictions', warn)
}

/** Every score record under <repoRoot>/scores, keyed by repository path. */
export function readScores(repoRoot: string, warn: (msg: string) => void = console.warn) {
  return readDir(repoRoot, 'virtual:scores', warn)
}

const resolved = (id: Id) => '\0' + id

export function predictions(repoRoot: string): Plugin {
  const ids = Object.keys(MODULES) as Id[]
  const dirs = ids.map((id) => join(repoRoot, MODULES[id].dir))
  return {
    name: 'race-calls-predictions',
    resolveId: (id) => (ids.includes(id as Id) ? resolved(id as Id) : undefined),
    load(id) {
      const match = ids.find((candidate) => resolved(candidate) === id)
      if (!match) return undefined
      for (const file of jsonFiles(join(repoRoot, MODULES[match].dir))) this.addWatchFile(file)
      const data = readDir(repoRoot, match, (msg) => this.warn(msg))
      return `export default ${JSON.stringify(data)}`
    },
    configureServer(server) {
      // New or changed records during `pnpm dev`: rebuild the modules and reload.
      for (const dir of dirs) server.watcher.add(dir)
      const refresh = (file: string) => {
        if (!dirs.some((dir) => file.startsWith(dir))) return
        for (const id of ids) {
          const mod = server.moduleGraph.getModuleById(resolved(id))
          if (mod) server.moduleGraph.invalidateModule(mod)
        }
        server.ws.send({ type: 'full-reload' })
      }
      server.watcher.on('add', refresh)
      server.watcher.on('change', refresh)
      server.watcher.on('unlink', refresh)
    },
  }
}
