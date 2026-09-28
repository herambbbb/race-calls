// Radial speed lines bursting from a point, after the Suzuka poster. Decorative.
export function SpeedBurst({ className = '', rays = 56 }: { className?: string; rays?: number }) {
  const lines = Array.from({ length: rays }, (_, i) => {
    const a = (i / rays) * Math.PI * 2
    // Uneven lengths and weights read as motion, not a clock face.
    const inner = 14 + ((i * 7) % 9) * 2
    const outer = 70 + ((i * 13) % 5) * 6
    const w = 0.6 + ((i * 11) % 4) * 0.45
    return (
      <line
        key={i}
        x1={50 + inner * Math.cos(a)}
        y1={50 + inner * Math.sin(a)}
        x2={50 + outer * Math.cos(a)}
        y2={50 + outer * Math.sin(a)}
        strokeWidth={w}
      />
    )
  })
  return (
    <svg aria-hidden="true" viewBox="0 0 100 100" className={className} stroke="currentColor" strokeLinecap="round" overflow="visible">
      {lines}
    </svg>
  )
}
