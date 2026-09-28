import { useParams } from 'react-router'
import { useDocumentTitle } from '../components/useDocumentTitle'
import { findRecord, RECORDS } from '../data/load'
import type { Kind } from '../data/types'
import { NotFound } from './NotFound'
import { RaceView } from './RaceView'

export function RacePage({ kind }: { kind: Kind }) {
  const { round } = useParams()
  const entry = round && /^\d+$/.test(round) ? findRecord(RECORDS, kind, Number(round)) : undefined
  useDocumentTitle(entry ? `${entry.record.race_name}${kind === 'backtest' ? ' (backtest)' : ''}` : 'Not found')
  if (!entry) return <NotFound />
  return <RaceView entry={entry} />
}
