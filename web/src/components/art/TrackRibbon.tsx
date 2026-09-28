// The hero's racing art: a sweep of road under the night sky, red and white kerbs, after the
// vintage "always go for the gap" posters, with three generic cars running along it,
// speed streaks behind them. The road runs under the headline and rises behind the
// next-race card. With reduced motion the cars are parked. Decorative.
import { useId } from 'react'
import { useMediaQuery } from '../useMediaQuery'
import { CarShape } from './Car'

const ROAD = 'M60 980 C 380 820, 700 800, 930 640 S 1120 240, 1560 140'

const CARS: { body: string; streak: string; begin: number; parked: number }[] = [
  { body: '#f2ecdc', streak: '#f2ecdc', begin: 0, parked: 0.34 },
  { body: '#f5c542', streak: '#f5c542', begin: -1.5, parked: 0.27 },
  { body: '#6fb6ee', streak: '#6fb6ee', begin: -3.4, parked: 0.2 },
]

const DURATION = 11

export function TrackRibbon({ className = '', fit = 'slice' }: { className?: string; fit?: 'slice' | 'meet' }) {
  const reduced = useMediaQuery('(prefers-reduced-motion: reduce)')
  // Unique ids, so the page can hold more than one ribbon.
  const id = useId().replace(/:/g, '')
  const road = `${id}-road`
  return (
    <svg aria-hidden="true" viewBox="0 0 1500 900" preserveAspectRatio={`xMidYMax ${fit}`} className={className}>
      <defs>
        <path id={road} d={ROAD} />
        {CARS.map((car, i) => (
          <linearGradient key={i} id={`${id}-streak-${i}`} x1="0" x2="1">
            <stop offset="0" stopColor={car.streak} stopOpacity="0" />
            <stop offset="1" stopColor={car.streak} stopOpacity="0.55" />
          </linearGradient>
        ))}
      </defs>
      {/* Kerbs: a wider stroke in red and white shows at both edges of the road. */}
      <use href={`#${road}`} fill="none" stroke="#f2ecdc" strokeWidth="212" />
      <use href={`#${road}`} fill="none" stroke="#b8434a" strokeWidth="212" strokeDasharray="38 38" />
      {/* Asphalt, lighter than the panel so the road reads, and the worn racing line. */}
      <use href={`#${road}`} fill="none" stroke="#1a2440" strokeWidth="188" />
      <use href={`#${road}`} fill="none" stroke="#202c4b" strokeWidth="84" />
      <use href={`#${road}`} fill="none" stroke="#f2ecdc" strokeOpacity="0.28" strokeWidth="3" strokeDasharray="30 44" />
      {CARS.map((car, i) => (
        <g key={i}>
          <rect x="-260" y="-26" width="240" height="52" rx="26" fill={`url(#${id}-streak-${i})`} />
          {/* The car is drawn nose up; rotate it so the nose follows the road. */}
          <g transform="rotate(90) translate(-36 -90) scale(1.8)">
            <CarShape body={car.body} trim="#070d1c" />
          </g>
          <animateMotion
            dur={`${DURATION}s`}
            repeatCount="indefinite"
            rotate="auto"
            begin={`${car.begin}s`}
            {...(reduced ? { keyPoints: `${car.parked};${car.parked}`, keyTimes: '0;1', calcMode: 'linear' } : {})}
          >
            <mpath href={`#${road}`} />
          </animateMotion>
        </g>
      ))}
    </svg>
  )
}
