import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router'
import { describe, expect, it } from 'vitest'
import example from '../../../contracts/prediction-record.example.json'
import { slimRecord } from '../data/slim'
import type { LoadedRecord, SlimRecord } from '../data/types'
import { RaceView } from './RaceView'

// Rendered from the slimmed record, exactly what the build ships.
const record = slimRecord(example) as SlimRecord
const PATH = 'predictions/2026/99-example-grand-prix.json'

function render(r: SlimRecord): string {
  const entry: LoadedRecord = { record: r, path: PATH }
  return renderToStaticMarkup(
    <MemoryRouter>
      <RaceView entry={entry} />
    </MemoryRouter>,
  )
}

function text(html: string): string {
  return html.replace(/<[^>]+>/g, ' ').replace(/&#x27;/g, "'").replace(/\s+/g, ' ')
}

describe('RaceView before the race', () => {
  const html = render(record)
  const t = text(html)

  it('shows the race and the winner pick with its probability', () => {
    expect(t).toContain('Example Grand Prix')
    expect(t).toContain('Example Circuit')
    expect(t).toContain('Sun, 4 Oct 2026, 07:00 UTC')
    expect(t).toMatch(/Winner Lando Norris McLaren 41%/)
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
    expect(t).toContain("Jev's podium The three most likely top-three finishers, from the podium probabilities.")
    const pick = text(html.split('data-testid="podium-pick"')[1]!.split('</ol>')[0]!)
    expect(pick).toMatch(/P1 Lando Norris 61% P2 Max Verstappen 55% P3 Charles Leclerc 38%/)
  })

  it('shows the podium sum and no inconsistency for the example', () => {
    expect(t).toContain('Podium probabilities sum to 1.54 (three drivers finish on the podium)')
    expect(t).toContain("No driver's win probability exceeds their podium probability.")
  })

  it('shows the chaos score and the rubric exactly as sent', () => {
    expect(t).toContain('1.3 out of 4')
    for (const line of ['0: calm', '1: lively', '2: eventful', '3: chaotic', '4: bedlam']) {
      expect(t).toContain(line)
    }
  })

  it('links to the public commit history of the record', () => {
    expect(html).toContain(`href="https://github.com/herambbbb/race-calls/commits/master/${PATH}"`)
    expect(t).toContain('Called at Sat, 3 Oct 2026, 10:12 UTC')
  })

  it('shows the small print', () => {
    expect(t).toContain('typesafe/jev-1.13-20260917')
    expect(t).toContain('$0.000035')
    expect(t).toContain('4.1 s')
  })

  it('never names the series', () => {
    expect(t).not.toMatch(/\bF1\b|Formula 1/)
  })
})

describe('RaceView variants', () => {
  it("breaks a tie in Jev's podium by driver code", () => {
    const calls = record.calls!
    const html = render({ ...record, calls: { ...calls, podium: { NOR: 0.4, VER: 0.5, LEC: 0.4 } } })
    const pick = text(html.split('data-testid="podium-pick"')[1]!.split('</ol>')[0]!)
    expect(pick).toMatch(/P1 Max Verstappen 50% P2 Charles Leclerc 40% P3 Lando Norris 40%/)
  })

  it('flags a late call', () => {
    const t = text(render({ ...record, late: true }))
    expect(t).toContain('Made after the start: published, not scored.')
    expect(t).not.toContain('Called before lights out.')
  })

  it('shows the no-prediction banner and no calls', () => {
    const t = text(render({ ...record, status: 'no_prediction', calls: null, jev: null }))
    expect(t).toContain('No prediction for this race: qualifying data did not arrive in time.')
    expect(t).not.toContain('Podium probabilities sum')
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
})
