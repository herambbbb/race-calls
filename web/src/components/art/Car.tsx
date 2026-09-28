// A generic open-wheel single-seater, seen from above, nose up. Original artwork in the
// poster style: flat body colour, dark tyres and cockpit, no livery, no marks.
// Drawn in a 40 by 100 box. Decorative.
export function CarShape({ body = 'currentColor', trim = 'var(--color-ink)' }: { body?: string; trim?: string }) {
  return (
    <>
      {/* Tyres */}
      <rect x="1" y="17" width="8" height="15" rx="2.5" fill={trim} />
      <rect x="31" y="17" width="8" height="15" rx="2.5" fill={trim} />
      <rect x="0" y="68" width="10" height="18" rx="3" fill={trim} />
      <rect x="30" y="68" width="10" height="18" rx="3" fill={trim} />
      {/* Suspension */}
      <path d="M9 22 L17 26 M9 28 L17 30 M31 22 L23 26 M31 28 L23 30 M10 74 L15 72 M10 80 L15 78 M30 74 L25 72 M30 80 L25 78" stroke={trim} strokeWidth="1.2" />
      {/* Front wing */}
      <path d="M3 5 H37 L36 10 H4 Z" fill={body} />
      <rect x="2" y="3" width="2" height="9" rx="0.8" fill={body} />
      <rect x="36" y="3" width="2" height="9" rx="0.8" fill={body} />
      {/* Nose, sidepods, engine cover */}
      <path
        d="M18 8 H22 L24 34 C29 38 32 44 32 52 L31 66 C30 74 27 80 24 84 H16 C13 80 10 74 9 66 L8 52 C8 44 11 38 16 34 Z"
        fill={body}
      />
      {/* Cockpit and halo */}
      <ellipse cx="20" cy="46" rx="4" ry="7" fill={trim} />
      <path d="M15.5 41 C16 36 24 36 24.5 41" fill="none" stroke={trim} strokeWidth="1.6" strokeLinecap="round" />
      <line x1="20" y1="37" x2="20" y2="40" stroke={trim} strokeWidth="1.4" />
      {/* Spine and airbox */}
      <path d="M20 54 V82" stroke={trim} strokeOpacity="0.35" strokeWidth="1" />
      {/* Rear wing */}
      <path d="M5 88 H35 V95 H5 Z" fill={body} />
      <rect x="4" y="86" width="2" height="11" rx="0.8" fill={body} />
      <rect x="34" y="86" width="2" height="11" rx="0.8" fill={body} />
    </>
  )
}

export function Car({ className = '', body, trim }: { className?: string; body?: string; trim?: string }) {
  return (
    <svg aria-hidden="true" viewBox="0 0 40 100" className={className}>
      <CarShape {...(body ? { body } : {})} {...(trim ? { trim } : {})} />
    </svg>
  )
}
