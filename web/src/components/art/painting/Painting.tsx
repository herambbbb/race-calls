// Painted brushstroke art, generated: thousands of short strokes following a flow field
// (see field.ts), laid down coarse to fine like impasto, coloured from night blue at the
// edges to chrome yellow at the eye of each swirl. Original work: no images, no copied
// painting. It paints once per size, in idle-time chunks after a cheap gradient, and
// repaints only after a resize settles. Life comes from a slow CSS drift of the layer.
// Decorative: whatever it suggests is said in text nearby.
import { useEffect, useRef } from 'react'
import { makeField, presetParams, random, strokeLength, type Preset } from './field'
import { RAMP } from './scrim'


interface Pass {
  /** Strokes per 10,000 square pixels. */
  density: number
  /** Steps along the field, each a few pixels. */
  steps: number
  width: number
  alpha: number
}

const PASSES: Pass[] = [
  { density: 5, steps: 10, width: 16, alpha: 0.95 },
  { density: 9, steps: 8, width: 9, alpha: 0.9 },
  { density: 14, steps: 6, width: 4.5, alpha: 0.85 },
]

const MAX_STROKES = 16000
const CHUNK = 700

// Idle time where the browser offers it (Safari does not), a short timeout otherwise.
const hasIdle = typeof window !== 'undefined' && typeof window.requestIdleCallback === 'function'
const onIdle = (cb: () => void): number =>
  hasIdle ? window.requestIdleCallback(cb, { timeout: 120 }) : window.setTimeout(cb, 16)
const cancelIdle = (id: number) => (hasIdle ? window.cancelIdleCallback(id) : window.clearTimeout(id))

function paint(canvas: HTMLCanvasElement, preset: Preset, seed: number, isStale: () => boolean) {
  // The layout box, not the drawn one: the drift's scale must not grow the canvas.
  const w = Math.max(1, canvas.clientWidth)
  const h = Math.max(1, canvas.clientHeight)
  const dpr = Math.min(2, window.devicePixelRatio || 1)
  const visible = canvas.getContext('2d')
  if (!visible) return () => {}
  const first = canvas.width <= 300 && canvas.height <= 150 // still the element's default size

  // Strokes go onto an offscreen canvas and are swapped in when done, so a repaint
  // after a resize never flashes back to the bare gradient.
  const off = document.createElement('canvas')
  off.width = w * dpr
  off.height = h * dpr
  const ctx = off.getContext('2d')
  if (!ctx) return () => {}
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'

  // A cheap first coat, so the layout never waits on the strokes.
  const base = ctx.createLinearGradient(0, 0, w, h)
  base.addColorStop(0, '#0b1a3d')
  base.addColorStop(1, '#070d1c')
  ctx.fillStyle = base
  ctx.fillRect(0, 0, w, h)
  if (first) {
    canvas.width = off.width
    canvas.height = off.height
    visible.drawImage(off, 0, 0)
  }

  const field = makeField(presetParams(preset, seed), w, h, seed)
  const rand = random(seed)
  const lengthScale = strokeLength(preset)
  const area = (w * h) / 10000
  const budget = PASSES.reduce((a, p) => a + p.density * area, 0)
  const thin = budget > MAX_STROKES ? MAX_STROKES / budget : 1
  // On very large screens fewer strokes are laid, so each is broader to keep coverage.
  const broaden = 1 / Math.sqrt(thin)

  const jobs: { pass: Pass; count: number }[] = PASSES.map((pass) => ({ pass, count: Math.round(pass.density * area * thin) }))
  let job = 0
  let done = 0
  let handle = 0
  const xs = new Float32Array(16)
  const ys = new Float32Array(16)

  const trace = (dx: number, dy: number, n: number) => {
    ctx.beginPath()
    ctx.moveTo(xs[0]! + dx, ys[0]! + dy)
    for (let i = 1; i <= n; i++) ctx.lineTo(xs[i]! + dx, ys[i]! + dy)
  }

  const stroke = (pass: Pass) => {
    let x = rand() * w
    let y = rand() * h
    const light = field.light(x, y)
    const idx = Math.min(RAMP.length - 1, Math.max(0, Math.round(light * (RAMP.length - 1) + (rand() - 0.5) * 2.2)))
    const step = (2.6 + rand() * 2) * lengthScale * (pass.width / 6 + 0.7) * broaden
    const width = pass.width * (0.7 + rand() * 0.6) * broaden
    xs[0] = x
    ys[0] = y
    for (let s = 1; s <= pass.steps; s++) {
      const a = field.angle(x, y)
      x += Math.cos(a) * step
      y += Math.sin(a) * step
      xs[s] = x
      ys[s] = y
    }
    trace(0, 0, pass.steps)
    ctx.globalAlpha = pass.alpha
    ctx.strokeStyle = RAMP[idx]!
    ctx.lineWidth = width
    ctx.stroke()
    // A thin highlight along one edge of the ridge reads as thick paint catching light.
    const edge = width * 0.18
    trace(-edge, -edge, pass.steps)
    ctx.globalAlpha = 0.22
    ctx.strokeStyle = RAMP[Math.min(RAMP.length - 1, idx + 2)]!
    ctx.lineWidth = Math.max(0.6, width * 0.28)
    ctx.stroke()
  }

  const work = () => {
    if (isStale()) return
    let n = 0
    while (job < jobs.length && n < CHUNK) {
      const current = jobs[job]!
      if (done >= current.count) {
        job++
        done = 0
        continue
      }
      stroke(current.pass)
      done++
      n++
    }
    ctx.globalAlpha = 1
    if (job < jobs.length) {
      handle = onIdle(work)
      return
    }
    // Done: swap the finished painting in, in one go.
    canvas.width = off.width
    canvas.height = off.height
    visible.drawImage(off, 0, 0)
  }
  handle = onIdle(work)
  return () => cancelIdle(handle)
}

export function Painting({
  preset,
  seed = 1,
  className = '',
  drift = true,
}: {
  preset: Preset
  seed?: number
  className?: string
  /** Slowly drift the painted layer. Off under reduced motion either way. */
  drift?: boolean
}) {
  const ref = useRef<HTMLCanvasElement>(null)
  const key = JSON.stringify(preset)

  useEffect(() => {
    const canvas = ref.current
    if (!canvas) return
    let generation = 0
    let cancel = () => {}
    let timer = 0
    let last = ''
    const run = () => {
      const size = `${canvas.clientWidth}x${canvas.clientHeight}@${Math.min(2, window.devicePixelRatio || 1)}`
      if (size === last) return
      last = size
      cancel()
      const mine = ++generation
      cancel = paint(canvas, JSON.parse(key) as Preset, seed, () => mine !== generation)
    }
    run()
    const observer = new ResizeObserver(() => {
      window.clearTimeout(timer)
      timer = window.setTimeout(run, 220)
    })
    observer.observe(canvas)
    // Moving to a screen of another pixel density (or zooming) needs a sharper repaint.
    let density = window.matchMedia(`(resolution: ${window.devicePixelRatio}dppx)`)
    const onDensity = () => {
      density.removeEventListener('change', onDensity)
      density = window.matchMedia(`(resolution: ${window.devicePixelRatio}dppx)`)
      density.addEventListener('change', onDensity)
      run()
    }
    density.addEventListener('change', onDensity)
    return () => {
      density.removeEventListener('change', onDensity)
      observer.disconnect()
      window.clearTimeout(timer)
      generation++
      cancel()
    }
  }, [key, seed])

  return (
    <span aria-hidden="true" className={`block overflow-hidden ${className}`}>
      <canvas ref={ref} className={`block h-full w-full ${drift ? 'painting-drift' : ''}`} />
    </span>
  )
}
