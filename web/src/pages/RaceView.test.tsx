import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router'
import { describe, expect, it } from 'vitest'
import example from '../../../contracts/prediction-record.example.json'
import type { ScoreRecord } from '../data/scores'
import { slimRecord } from '../data/slim'
import type { LoadedRecord, SlimRecord } from '../data/types'
import { RaceView } from './RaceView'

// Rendered from the slimmed record, exactly what the build ships.
const record = slimRecord(example) as SlimRecord
const PATH = 'predictions/2026/99-example-grand-prix.json'

const SCORE: ScoreRecord = {
  season: 2026,
  round: 99,
  kind: 'live',
  scored_at: '2026-10-05T03:00:00Z',
  result: { winner: 'VER', podium: ['VER', 'LEC', 'NOR'], finish: { VER: '1', LEC: '2', NOR: '3' } },
  chaos: { actual: 4, reason: 'Red flag on lap 12.' },
  scores: {
    jev: { podium_brier: 0.21, winner_log_loss: 0.99, winner_hit: false, podium_pick: ['NOR', 'VER', 'LEC'], podium_hits: 3, chaos_error: 2.72 },
    grid: { podium_brier: 0.19, winner_log_loss: 1.4, winner_hit: false, podium_pick: ['NOR', 'VER', 'LEC'], podium_hits: 3, chaos_error: null },
    form: { podium_brier: 0.25, winner_log_loss: 1.1, winner_hit: false, podium_pick: ['NOR', 'VER', 'LEC'], podium_hits: 3, chaos_error: null },
  },
}

function render(r: SlimRecord, opts: { score?: ScoreRecord; revealed?: boolean } = {}): string {
  const entry: LoadedRecord = { record: r, path: PATH }
  return renderToStaticMarkup(
    <MemoryRouter>
      <RaceView entry={entry} score={opts.score} initiallyRevealed={opts.revealed ?? true} />
    </MemoryRouter>,
  )
}

function text(html: string): string {
  return html.replace(/<[^>]+>/g, ' ').replace(/&#x27;/g, "'").replace(/&quot;/g, '"').replace(/\s+/g, ' ')
}

function between(html: string, testId: string, end: string): string {
  return text(html.split(`data-testid="${testId}"`)[1]!.split(end)[0]!)
}

describe('RaceView before the race', () => {
  const html = render(record)
  const t = text(html)

  it('shows the race and the winner pick with its probability', () => {
    expect(t).toContain('Example')
    expect(t).toContain('Example Circuit')
    expect(t).toContain('Sun, 4 Oct 2026, 07:00 UTC')
    expect(between(html, 'winner-pick', 'Win chance')).toMatch(/Lando Norris McLaren 41%/)
  })

  it('lists the three drivers in grid order with their calls', () => {
    const rows = html.split('data-testid="grid-row"').slice(1).map(text)
    expect(rows).toHaveLength(3)
    expect(rows[0]).toContain('Lando Norris')
    expect(rows[0]).toContain('61%')
    expect(rows[1]).toContain('Max Verstappen')
    expect(rows[2]).toContain('Charles Leclerc')
  })

  it("shows Jev's podium from the podium probabilities, in order", () => {
    expect(t).toContain('The three highest podium chances, in order.')
    const pick = between(html, 'podium-pick', '</ol>')
    expect(pick).toMatch(/P1 NOR Lando Norris 61%.*P2 VER Max Verstappen 55%.*P3 LEC Charles Leclerc 38%/)
  })

  it('shows the podium sum and no inconsistency for the example', () => {
    expect(t).toContain('Podium chances sum to 1.54 (the true number is 3).')
    expect(t).toContain("No driver's win chance is higher than their podium chance.")
  })

  it('shows the chaos score and the rubric exactly as sent', () => {
    expect(t).toContain('1.28 out of 4')
    for (const line of ['0: calm', '1: lively', '2: eventful', '3: chaotic', '4: bedlam']) {
      expect(t).toContain(line)
    }
  })

  it('links to the public commit history of the record', () => {
    expect(html).toContain(`href="https://github.com/herambbbb/race-calls/commits/master/${PATH}"`)
    expect(t).toContain('Called at Sat, 3 Oct 2026, 10:12 UTC')
    expect(t).toContain('Before lights out')
  })

  it('says Jev gives no reasons', () => {
    expect(t).toContain('Jev gives no reasons.')
  })

  it('shows the small print', () => {
    expect(t).toContain('typesafe/jev-1.13-20260917')
    expect(t).toContain('$0.000035')
    expect(t).toContain('4.1 s')
  })

  it('shows the provisional-grid note', () => {
    expect(t).toContain('Provisional grid: penalties confirmed after the call may change the starting order.')
  })

  it('shows no result before the race', () => {
    expect(t).not.toContain('What really happened')
    expect(html).not.toContain('data-testid="scorecard"')
  })

  it('never names the series', () => {
    expect(t).not.toMatch(/\bF1\b|Formula 1/)
  })
})

describe('RaceView spoiler guard', () => {
  const html = render(record, { revealed: false })
  const t = text(html)

  it('shows the grid but not the calls until asked', () => {
    expect(t).toContain("Show Jev's calls")
    expect(t).toContain('They are public in the repository anyway')
    expect(html.split('data-testid="grid-row"').slice(1).map(text)[0]).not.toContain('61%')
    expect(html).not.toContain('data-testid="winner-pick"')
  })

  it('offers the result too once the race is scored', () => {
    expect(text(render(record, { revealed: false, score: SCORE }))).toContain("Show Jev's calls and the result")
  })
})

describe('RaceView after the race', () => {
  const html = render(record, { score: SCORE })
  const t = text(html)

  it('stamps the winner pick a miss and names the real winner', () => {
    expect(between(html, 'winner-pick', '</div></div>')).toMatch(/Miss Won by Max Verstappen \(Jev gave 37%\)/)
  })

  it('shows the real podium and chaos with its reason', () => {
    expect(t).toMatch(/P1 Max Verstappen .* P2 Charles Leclerc .* P3 Lando Norris/)
    expect(t).toContain('Red flag on lap 12.')
  })

  it('prints the scorecard with both baselines and marks the best', () => {
    const card = between(html, 'scorecard', '</table>')
    expect(card).toContain('Winner miss')
    expect(card).toContain('Podium 3/3')
    expect(card).toMatch(/Podium Brier .* 0\.210 0\.190 Best 0\.250/)
    // Only Jev made a chaos call, so nobody is marked best on it.
    expect(card.trim()).toMatch(/Chaos error [^B]* 2\.72 No call No call$/)
  })

  it("puts each podium chance next to the driver's result", () => {
    const rows = between(html, 'called-vs-actual', '</ol>')
    expect(rows).toMatch(/NOR .*61% P3/)
  })

  it('never scores a late call', () => {
    const late = text(render({ ...record, late: true }, { score: SCORE }))
    expect(late).toContain('Made after the start: published, not scored.')
    expect(late).not.toContain('What really happened')
  })
})

describe('RaceView variants', () => {
  it("breaks a tie in Jev's podium by driver code", () => {
    const calls = record.calls!
    const html = render({ ...record, calls: { ...calls, podium: { NOR: 0.4, VER: 0.5, LEC: 0.4 } } })
    const pick = between(html, 'podium-pick', '</ol>')
    expect(pick).toMatch(/P1 VER .*50%.*P2 LEC .*40%.*P3 NOR .*40%/)
  })

  it('flags a late call', () => {
    const t = text(render({ ...record, late: true }))
    expect(t).toContain('Made after the start: published, not scored.')
    expect(t).not.toContain('Called before lights out.')
  })

  it('shows the no-prediction banner and no calls', () => {
    const t = text(render({ ...record, status: 'no_prediction', calls: null, jev: null }))
    expect(t).toContain('No prediction for this race: qualifying data did not arrive in time.')
    expect(t).not.toContain('Podium chances sum')
    expect(t).not.toContain("Show Jev's calls")
  })

  it('shows the failed banner', () => {
    const t = text(render({ ...record, status: 'failed', calls: null }))
    expect(t).toContain('The prediction failed, so there is no call for this race.')
  })

  it('shows the backtest banner', () => {
    const t = text(render({ ...record, kind: 'backtest' }))
    expect(t).toContain('Backtest: the model may have seen these results.')
  })

  it('lists a driver whose win probability exceeds their podium probability', () => {
    const calls = record.calls!
    const t = text(render({ ...record, calls: { ...calls, podium: { ...calls.podium, LEC: 0.1 } } }))
    expect(t).toContain('Charles Leclerc: win 22%, podium 10%')
  })

  it('shows the facts Jev was given, verbatim', () => {
    const facts = { race: ['Qualifying was dry.'], drivers: { NOR: 'Lando Norris (McLaren) starts 1st, on pole.' } }
    const t = text(render({ ...record, facts }))
    expect(t).toContain('Qualifying was dry.')
    expect(t).toContain('Lando Norris (McLaren) starts 1st, on pole.')
  })
})

describe('RaceView chaos paintings', () => {
  it("paints Jev's call, labelled in text, and hides the painting from assistive technology", () => {
    const html = render(record)
    const panel = between(html, 'chaos-paintings', '</figure>')
    expect(panel).toMatch(/Jev's call 1\.28 , lively to eventful/)
    const block = html.split('data-testid="chaos-paintings"')[1]!.split('</figure>')[0]!
    expect(block).toMatch(/<span aria-hidden="true"[^>]*><canvas/)
  })

  it('puts the actual level and its reason beside the call after the race', () => {
    const t = text(render(record, { score: SCORE }).split('data-testid="chaos-paintings"')[1]!.split('</div>')[0]!)
    expect(t).toMatch(/Jev's call 1\.28 , lively to eventful Actual 4 , bedlam Red flag on lap 12\./)
  })

  it('shows no chaos painting before the reveal', () => {
    expect(render(record, { revealed: false })).not.toContain('data-testid="chaos-paintings"')
  })
})
