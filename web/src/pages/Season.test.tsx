import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router'
import { describe, expect, it } from 'vitest'
import example from '../../../contracts/prediction-record.example.json'
import type { CalendarRace } from '../data/calendar'
import { slimRecord } from '../data/slim'
import type { LoadedRecord, SlimRecord } from '../data/types'
import { Backtests } from './Backtests'
import { Landing } from './Landing'
import { Season } from './Season'

const record = slimRecord(example) as SlimRecord
const live: LoadedRecord = { record, path: 'predictions/2026/99-example-grand-prix.json' }
const backtest: LoadedRecord = { record: { ...record, kind: 'backtest', round: 3 }, path: 'predictions/backtest/03-example.json' }
const calendar: CalendarRace[] = [
  {
    season: 2026,
    round: 99,
    slug: 'example-grand-prix',
    race_name: 'Example Grand Prix',
    circuit_name: 'Example Circuit',
    locality: 'Example Town',
    country: 'Example',
    qualifying_start: '2026-10-03T08:00:00Z',
    race_start: record.race_start,
    sprint: false,
  },
]
const AT = Date.parse('2026-10-03T12:00:00Z')

function text(html: string): string {
  return html.replace(/<[^>]+>/g, ' ').replace(/&#x27;/g, "'").replace(/\s+/g, ' ')
}

const render = (node: React.ReactNode) => text(renderToStaticMarkup(<MemoryRouter>{node}</MemoryRouter>))

describe('Season', () => {
  const t = render(<Season records={[live, backtest]} scores={[]} at={AT} calendar={calendar} />)

  it('lists the called race without giving away the pick', () => {
    expect(t).toContain('Called')
    expect(t).not.toMatch(/Pick NOR/)
    expect(t).not.toContain('41%')
  })

  it('says how many live races count, starting at zero', () => {
    expect(t).toMatch(/Live races counted 0 of 1/)
    expect(t).toContain('Nothing counted yet.')
  })

  it('leaves the backtests to their own page', () => {
    expect(t).not.toContain('The model may have seen these results')
  })

  it('never names the series', () => {
    expect(t).not.toMatch(/\bF1\b|Formula 1/)
  })
})

describe('Landing', () => {
  const t = render(<Landing records={[live, backtest]} scores={[]} at={AT} calendar={calendar} />)

  it('introduces the site and the next race, and hides the pick', () => {
    expect(t).toContain('Race Calls:')
    expect(t).toContain('Committed. Pick hidden until you ask.')
    expect(t).not.toContain('41%')
  })

  it('opens onto the season, the backtests, and the method', () => {
    for (const label of ['The season so far', 'The first 1, after the fact', 'Three questions, one request']) {
      expect(t).toContain(label)
    }
  })
})

describe('Backtests', () => {
  const t = render(<Backtests records={[live, backtest]} scores={[]} />)

  it('keeps backtests apart, with their label and span', () => {
    expect(t).toContain('The model may have seen these results')
    expect(t).toContain('Rounds 3 to 3 of 2026')
    expect(t).not.toContain('Round 99')
  })

  it('credits the circuit outlines', () => {
    expect(t).toContain('Tomislav Bacinger (MIT licence)')
  })
})
