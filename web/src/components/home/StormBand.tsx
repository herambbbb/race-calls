// The storm band: a sticky, full-screen vortex painting. As the reader scrolls through
// it, the vortex turns and a generic car travels the spiral from the outer arm to the
// eye (index.css: .storm-*). Scrolling back runs it in reverse; nothing moves on its
// own. Without scroll timelines, or with reduced motion, the car rests on the outer arm.
import { CarShape } from '../art/Car'
import { Painting } from '../art/painting/Painting'

/** An inward spiral in a 1000 by 1000 box: under two turns, so progress feels even. */
function spiral(): string {
  const points: string[] = []
  const turns = 1.75
  const n = 160
  for (let i = 0; i <= n; i++) {
    const t = i / n
    const a = -Math.PI * 0.75 + t * turns * Math.PI * 2
    const r = 470 * (1 - t) ** 0.85 + 18
    points.push(`${(500 + r * Math.cos(a)).toFixed(1)} ${(500 + r * Math.sin(a) * 0.82).toFixed(1)}`)
  }
  return `M${points.join('L')}`
}

const SPIRAL = spiral()

export function StormBand() {
  return (
    <section aria-labelledby="storm-heading" className="storm-scroll relative mt-4">
      <div className="storm-stage relative min-h-svh bg-ink">
        <div aria-hidden="true" className="absolute inset-0 overflow-hidden">
          <div className="storm-paint absolute inset-0">
            <Painting preset={{ kind: 'storm' }} seed={42} drift={false} className="absolute inset-0" />
          </div>
        </div>
        <div
          aria-hidden="true"
          className="absolute inset-0 bg-[radial-gradient(ellipse_at_50%_45%,transparent_30%,rgb(7_13_28/0.75)_85%)]"
        />
        {/* Fitted, not cropped: the whole spiral stays on screen at any shape. */}
        <svg aria-hidden="true" viewBox="0 0 1000 1000" preserveAspectRatio="xMidYMid meet" className="absolute inset-0 h-full w-full">
          <path d={SPIRAL} fill="none" stroke="#f5c542" strokeOpacity="0.35" strokeWidth="2.5" strokeDasharray="10 16" />
          {/* The outer group rides the path; the middle one shrinks the car about its own centre. */}
          <g className="storm-car" style={{ offsetPath: `path('${SPIRAL}')` }}>
            <g className="storm-car-body">
              <g transform="rotate(90) translate(-38 -95) scale(1.9)">
                <CarShape body="#f5c542" trim="#070d1c" />
              </g>
            </g>
          </g>
        </svg>
        <div className="relative z-10 mx-auto flex min-h-svh max-w-6xl items-end px-5 pt-[calc(var(--header-h,76px)+1.5rem)] pb-12 sm:px-10 sm:pb-16">
          <div className="max-w-xl rounded-[22px] border border-line bg-ink/80 p-6 backdrop-blur-md sm:p-8">
            <p className="tag text-star">Chaos, 0 to 4</p>
            <h2 id="storm-heading" className="mt-3 font-display text-5xl leading-[0.92] sm:text-6xl">
              Every call, <span className="italic">through every storm.</span>
            </h2>
            <p className="mt-4 text-sm leading-relaxed text-muted">
              Jev commits before lights out, whatever the race brings: safety cars, red flags, rain. Its chaos rating says
              how wild it expects the race to get, and each race page paints both the call and what really happened.
            </p>
          </div>
        </div>
      </div>
    </section>
  )
}
