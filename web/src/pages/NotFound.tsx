import { Link } from 'react-router'

export function NotFound() {
  return (
    <div className="space-y-3">
      <h1 className="font-display text-4xl">Nothing here</h1>
      <p className="text-muted">There is no call for this page.</p>
      <Link to="/" className="text-flag-blue underline underline-offset-2 hover:no-underline">
        All races
      </Link>
    </div>
  )
}
