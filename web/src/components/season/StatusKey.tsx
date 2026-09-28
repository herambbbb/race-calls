// What each race status means, under the race list.
const KEYS: [string, string, string][] = [
  ['bg-muted', 'Upcoming', 'no call yet'],
  ['bg-sector-green', 'Called', 'committed before the start'],
  ['bg-sector-purple', 'Scored', 'on the leaderboard'],
  ['bg-sector-amber', 'Late', 'published, never scored'],
  ['bg-transparent ring-1 ring-muted', 'No prediction', 'no data in time'],
  ['bg-flag-red', 'Failed', 'the request failed'],
]

export function StatusKey() {
  return (
    <ul className="mt-4 flex flex-wrap gap-x-5 gap-y-2 text-xs text-muted" aria-label="Status key">
      {KEYS.map(([dot, label, meaning]) => (
        <li key={label} className="flex items-center gap-2">
          <span aria-hidden="true" className={`size-1.5 rounded-full ${dot}`} />
          <span className="text-text">{label}</span> {meaning}
        </li>
      ))}
    </ul>
  )
}
