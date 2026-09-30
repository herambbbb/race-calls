import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router'
import { describe, expect, it } from 'vitest'
import example from '../../../contracts/prediction-record.example.json'
import scoreExample from '../../../contracts/score-record.example.json'
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

describe('the backtest leaderboard', () => {
  const score = { ...scoreExample, kind: 'backtest' as const, round: 3 }
  const t = render(<Backtests records={[live, backtest]} scores={[score]} />)

  it('scores the backtests on their own board, labelled, and never the live season', () => {
    expect(t).toContain('Backtest leaderboard')
    expect(t).toContain('Backtests counted')
    expect(t).toMatch(/Backtests counted 1 of 1/)
    expect(t).toContain('test the plumbing, not the skill')
  })

  it('explains why every number is uncertain', () => {
    for (const reason of ['It is a sport', 'The samples are tiny', 'The calls are not independent', 'The inputs are imperfect', 'Backtests may be memorised']) {
      expect(t).toContain(reason)
    }
  })

  it('keeps backtests off the season board', () => {
    const season = render(<Season records={[live, backtest]} scores={[score]} at={AT} calendar={calendar} />)
    expect(season).toMatch(/Live races counted 0 of 1/)
    expect(season).toContain('It is a sport')
  })
})

describe('the technical and calls sections', () => {
  const score = { ...scoreExample, kind: 'backtest' as const, round: 3 }
  const html = renderToStaticMarkup(
    <MemoryRouter>
      <Backtests records={[live, backtest]} scores={[score]} />
    </MemoryRouter>,
  )
  const t = text(html)

  it('shows both for the backtests, numbered after the leaderboard', () => {
    expect(t).toMatch(/02 Technical Every backtest, every measure/)
    expect(t).toMatch(/03 Calls vs reality What Jev said, what happened/)
    expect(t).toMatch(/04 Calibration/)
    expect(t).toMatch(/05 Races/)
  })

  it('lays out the technical board with means, the calibration error, and how to read it', () => {
    expect(t).toContain('Round 03 Example Grand Prix')
    expect(t).toContain('Means, hits as totals')
    expect(t).toContain('1.54')
    expect(html).toContain('data-testid="podium-ece"')
    expect(t).toContain('0.407')
    expect(t).toContain('How to read this')
    expect(t).toContain('Saying 14% for everyone scores about 0.12.')
  })

  it('writes every verdict in words, and says when a chance was not recorded', () => {
    expect(t).toContain('made the podium')
    expect(t).toContain('missed the podium')
    expect(t).toContain('miss: the pick did not win')
    expect(t).toContain('2 eventful a full safety car')
    expect(t).toContain('Not recorded for this race.')
  })

  it('shows the empty state on the season with only backtest scores', () => {
    const season = renderToStaticMarkup(
      <MemoryRouter>
        <Season records={[live, backtest]} scores={[score]} at={AT} calendar={calendar} />
      </MemoryRouter>,
    )
    expect(season).toContain('data-testid="technical-empty"')
    expect(season).toContain('data-testid="calls-empty"')
    expect(text(season)).toContain('No live race scored yet.')
    expect(text(season)).not.toContain('Example Grand Prix Jev')
    expect(season).not.toContain('missed the podium')
  })

  it('never uses a long dash', () => {
    expect(html).not.toMatch(/[\u2013\u2014]/)
  })
})
