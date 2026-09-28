// Display formatting. Probabilities are shown as whole percents; times in UTC and local.

export function pct(p: number | undefined): string {
  if (p === undefined) return '-'
  if (p > 0 && p < 0.005) return '<1%'
  return `${Math.round(p * 100)}%`
}

const UTC = new Intl.DateTimeFormat('en-GB', {
  weekday: 'short',
  day: 'numeric',
  month: 'short',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  timeZone: 'UTC',
})

export function formatUtc(iso: string): string {
  return `${UTC.format(new Date(iso))} UTC`
}

/** In the viewer's own time zone (the browser's), with its short name. */
export function formatLocal(iso: string): string {
  return new Intl.DateTimeFormat(undefined, {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
    timeZoneName: 'short',
  }).format(new Date(iso))
}

/** Day and month only, in UTC: "4 Oct". */
export function formatDay(iso: string): string {
  return new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' }).format(new Date(iso))
}

/** A score to a fixed number of decimals, or a dash when there is none yet. */
export function score(value: number | null | undefined, digits = 3): string {
  return value === null || value === undefined ? '-' : value.toFixed(digits)
}

export function formatCount(value: number | null): string {
  return value === null ? '-' : new Intl.NumberFormat('en-US').format(value)
}

export function formatDate(iso: string): string {
  return new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }).format(
    new Date(iso),
  )
}

const USD = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumSignificantDigits: 2 })

export function formatUsd(value: number): string {
  return USD.format(value)
}

export function formatLatency(ms: number): string {
  return ms < 1000 ? `${ms} ms` : `${(ms / 1000).toFixed(1)} s`
}

export const REPO = 'https://github.com/herambbbb/race-calls'

/** GitHub's public commit history for one record file: the proof of when it was made. */
export function commitHistoryUrl(path: string): string {
  return `${REPO}/commits/master/${path}`
}

/** A classification as shown: "P3", or why there is no position. */
export function finishLabel(text: string | undefined): string {
  if (text === undefined) return '-'
  if (text === 'R') return 'Out'
  if (text === 'D') return 'DSQ'
  if (text === 'W' || text === 'N' || text === 'F') return 'DNS'
  return `P${text}`
}
