// The scorecard's measures, shown for Jev and both baselines on one race.
import { score as fmt } from './format'
import { CONTENDERS, type Contender, type ContenderScore } from './scores'

/** Short labels for narrow columns. */
export const CONTENDER_SHORT: Record<Contender, string> = {
  jev: 'Jev',
  grid: 'Grid',
  form: 'Form',
}

export const CONTENDER_LABEL: Record<Contender, string> = {
  jev: 'Jev',
  grid: 'Grid baseline',
  form: 'Form baseline',
}

/**
 * The leaderboard's measures explained, over many races. The leaderboard and the
 * technical board both show these, so the two never disagree.
 */
export const EXPLAIN = {
  podium_brier:
    'Lower is better. The average squared gap between each podium chance and what happened. Saying 14% for everyone scores about 0.12.',
  winner_log_loss: 'Lower is better. How surprised the call was by the real winner: 0.69 means it gave the winner 50%, 2.30 means 10%.',
  winner_hits: 'Races where the most likely winner won.',
  podium_hits: 'Of the three drivers called for the podium in each race.',
  chaos_error: 'Lower is better. Average distance from the actual level, 0 to 4.',
} as const

interface Metric {
  label: string
  explain: string
  value: (s: ContenderScore) => number | null
  show: (s: ContenderScore) => string
  /** Which direction is better, to mark the best side. */
  better: 'lower' | 'higher'
}

export const METRICS: Metric[] = [
  {
    label: 'Podium Brier',
    explain: 'Lower is better. The average squared gap between each podium chance and what happened.',
    value: (s) => s.podium_brier,
    show: (s) => fmt(s.podium_brier),
    better: 'lower',
  },
  {
    label: 'Winner log loss',
    explain: 'Lower is better. How surprised the call was by the real winner.',
    value: (s) => s.winner_log_loss,
    show: (s) => fmt(s.winner_log_loss, 2),
    better: 'lower',
  },
  {
    label: 'Winner pick',
    explain: 'Did the most likely winner win?',
    value: (s) => (s.winner_hit ? 1 : 0),
    show: (s) => (s.winner_hit ? 'Hit' : 'Miss'),
    better: 'higher',
  },
  {
    label: 'Podium picks right',
    explain: 'Of the three drivers each side called for the podium.',
    value: (s) => s.podium_hits,
    show: (s) => `${s.podium_hits} of 3`,
    better: 'higher',
  },
  {
    label: 'Chaos error',
    explain: 'Lower is better. Distance from the actual level, on the 0 to 4 scale.',
    value: (s) => s.chaos_error,
    show: (s) => (s.chaos_error === null ? 'No call' : fmt(s.chaos_error, 2)),
    better: 'lower',
  },
]

/** The sides that share the best value for a metric; none if fewer than two have one. */
export function best(metric: Metric, scores: Record<Contender, ContenderScore>): Set<Contender> {
  const values = CONTENDERS.flatMap((c) => {
    const v = metric.value(scores[c])
    return v === null ? [] : [[c, v] as const]
  })
  // Best needs a comparison: at least two sides with a value.
  if (values.length < 2) return new Set()
  const target = metric.better === 'lower' ? Math.min(...values.map(([, v]) => v)) : Math.max(...values.map(([, v]) => v))
  // Ties are judged on the figures as shown: 0.064 and 0.064 are both best.
  const shown = (c: Contender) => metric.show(scores[c])
  const winner = values.find(([, v]) => v === target)![0]
  const top = values.filter(([c]) => shown(c) === shown(winner)).map(([c]) => c)
  return new Set(top.length === values.length ? [] : top)
}
