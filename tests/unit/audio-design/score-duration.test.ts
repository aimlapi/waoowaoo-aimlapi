import { describe, expect, it } from 'vitest'
import { resolveScoreDurationConformance } from '@/lib/audio-design/score-duration'

describe('score duration conformance', () => {
  it('accepts a small provider duration deviation and derives a deterministic tempo ratio', () => {
    expect(resolveScoreDurationConformance({
      sourceDurationSeconds: 86.334625,
      targetDurationSeconds: 88.20833333333333,
    })).toMatchObject({
      targetDurationSeconds: 88.20833333333333,
      requiresProcessing: true,
      tempoRatio: 0.9787581483230988,
    })
  })

  it('rejects a large duration deviation instead of padding or looping the score', () => {
    expect(() => resolveScoreDurationConformance({
      sourceDurationSeconds: 80,
      targetDurationSeconds: 90,
    })).toThrow('AUDIO_SCORE_DURATION_CONFORMANCE_OUT_OF_RANGE:0.888889')
  })
})
