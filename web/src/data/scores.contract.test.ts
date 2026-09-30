import { describe, expect, it } from 'vitest'
import example from '../../../contracts/score-record.example.json'
import { isScoreRecord, parseScores } from './scores'

// The pipeline writes this file from its own scorer (pipeline/tests/test_score.py), so a
// change on either side that breaks the other fails here or there.
describe('the score record the pipeline writes', () => {
  it('is accepted by the site', () => {
    expect(isScoreRecord(example)).toBe(true)
    expect(parseScores({ 'scores/2026/99-example-grand-prix.json': example })).toHaveLength(1)
  })
})
