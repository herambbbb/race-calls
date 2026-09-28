import { useParams } from 'react-router'
import { useDocumentTitle } from '../components/useDocumentTitle'
import { calendarRace } from '../data/calendar'
import { findRecord, findScore, RECORDS } from '../data/load'
import type { Kind } from '../data/types'
import { NotFound } from './NotFound'
import { RaceView } from './RaceView'
import { UpcomingRace } from './UpcomingRace'

export function RacePage({ kind }: { kind: Kind }) {
  const { round } = useParams()
  const number = round && /^\d+$/.test(round) ? Number(round) : undefined
  const entry = number === undefined ? undefined : findRecord(RECORDS, kind, number)
  // A live race on the calendar with no record yet still has a page: upcoming, or no call.
  const scheduled = !entry && kind === 'live' && number !== undefined ? calendarRace(number) : undefined
  const name = entry?.record.race_name ?? scheduled?.race_name
  useDocumentTitle(name ? `${name}${kind === 'backtest' ? ' (backtest)' : ''}` : 'Not found')
  // Keyed per race, so the spoiler guard and its timers never carry over between races.
  const key = `${kind}:${number}`
  if (entry) return <RaceView key={key} entry={entry} score={findScore(entry.record)} />
  if (scheduled) return <UpcomingRace key={key} race={scheduled} />
  return <NotFound />
}
