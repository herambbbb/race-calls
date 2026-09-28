import { Link } from 'react-router'
import { Stamp } from '../components/Stamp'
import { StartLights } from '../components/StartLights'

export function NotFound() {
  return (
    <div className="mx-auto max-w-6xl space-y-5 px-4 py-20 sm:px-6">
      <StartLights />
      <h1 className="font-display text-6xl leading-none">
        Off the <span className="italic">track</span>
      </h1>
      <p className="text-muted">There is no call for this page.</p>
      <Stamp tone="amber" tilt={-4}>
        Track limits exceeded. Lap time deleted.
      </Stamp>
      <Link to="/season" className="text-link underline underline-offset-4 hover:no-underline">
        All races
      </Link>
    </div>
  )
}
