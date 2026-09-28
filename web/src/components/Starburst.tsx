// Poster ornaments, decorative only: a starburst and a four-point sparkle.
export function Starburst({ className = '', points = 16 }: { className?: string; points?: number }) {
  const d = Array.from({ length: points * 2 }, (_, i) => {
    const r = i % 2 === 0 ? 50 : 30 + ((i * 37) % 11)
    const a = (Math.PI * i) / points - Math.PI / 2
    return `${(50 + r * Math.cos(a)).toFixed(2)},${(50 + r * Math.sin(a)).toFixed(2)}`
  }).join(' ')
  return (
    <svg aria-hidden="true" viewBox="0 0 100 100" className={className}>
      <polygon points={d} fill="currentColor" />
    </svg>
  )
}

export function Sparkle({ className = '' }: { className?: string }) {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" className={className}>
      <path d="M12 0c.9 7.6 4.4 11.1 12 12-7.6.9-11.1 4.4-12 12-.9-7.6-4.4-11.1-12-12C7.6 11.1 11.1 7.6 12 0Z" fill="currentColor" />
    </svg>
  )
}
