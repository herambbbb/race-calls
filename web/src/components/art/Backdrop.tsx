// The app's backdrop, fixed behind every page: a chequered flag in night tones rippling
// in the wind, fold shading that only ever darkens, a slow metallic sheen, and a faint
// cerulean glow. It shows in the gaps between sections, strongest toward the edges.
// Its brightest point never passes the `raised` surface (see backdropTones.ts), so
// text contrast is unchanged. Decorative.
import { BACKDROP } from './backdropTones'

export function Backdrop() {
  return (
    <div aria-hidden="true" className="pointer-events-none fixed inset-0 -z-10 overflow-hidden bg-ink">
      <div
        className="absolute inset-0"
        style={{
          backgroundImage: `radial-gradient(ellipse 60% 50% at 12% 8%, color-mix(in srgb, ${BACKDROP.glow} ${BACKDROP.glowAlpha * 100}%, transparent), transparent 70%), radial-gradient(ellipse 50% 45% at 92% 70%, color-mix(in srgb, ${BACKDROP.glow} ${BACKDROP.glowAlpha * 70}%, transparent), transparent 70%)`,
        }}
      />
      <svg className="backdrop-flag absolute -inset-[6%] h-[112%] w-[112%]" preserveAspectRatio="none">
        <defs>
          <pattern id="backdrop-chequer" width="64" height="64" patternUnits="userSpaceOnUse" patternTransform="rotate(-9)">
            <rect width="32" height="32" fill={BACKDROP.square} />
            <rect x="32" y="32" width="32" height="32" fill={BACKDROP.square} />
          </pattern>
          <filter id="backdrop-wave" x="-5%" y="-5%" width="110%" height="110%">
            <feTurbulence type="fractalNoise" baseFrequency="0.0022 0.008" numOctaves="2" seed="11" result="wind" />
            <feDisplacementMap in="SourceGraphic" in2="wind" scale="80" xChannelSelector="R" yChannelSelector="G" />
          </filter>
          <linearGradient id="backdrop-folds" x1="0" y1="0" x2="1" y2="0.3">
            {Array.from({ length: 11 }, (_, i) => (
              <stop key={i} offset={i / 10} stopColor="#000" stopOpacity={i % 2 ? 0.45 : 0} />
            ))}
          </linearGradient>
          <radialGradient id="backdrop-fade" cx="0.5" cy="0.5" r="0.72">
            <stop offset="0.2" stopColor="#000" />
            <stop offset="1" stopColor="#fff" />
          </radialGradient>
          <mask id="backdrop-mask">
            <rect width="100%" height="100%" fill="url(#backdrop-fade)" />
          </mask>
        </defs>
        <g mask="url(#backdrop-mask)">
          <g filter="url(#backdrop-wave)">
            <rect width="100%" height="100%" fill="url(#backdrop-chequer)" />
            {/* Folds in the cloth: darkening only, never lightening. */}
            <rect width="100%" height="100%" fill="url(#backdrop-folds)" />
          </g>
        </g>
      </svg>
      <div className="backdrop-sheen absolute inset-0" style={{ ['--sheen' as string]: BACKDROP.sheen }} />
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_50%_40%,transparent_60%,rgb(0_0_0/0.4)_100%)]" />
    </div>
  )
}
