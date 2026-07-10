import { describe, expect, it } from 'vitest'
import {
  assertAmbienceLoopBoundaryQuality,
  measureAmbienceLoopBoundary,
  selectBestAmbienceLoopCandidate,
} from '@/lib/audio-design/ambience-loop'

describe('ambience loop quality', () => {
  it('prefers the candidate with the quieter loop boundary', () => {
    expect(selectBestAmbienceLoopCandidate([
      { boundaryScore: 0.2 },
      { boundaryScore: 0.05 },
    ])).toBe(1)
  })

  it('measures endpoint and window discontinuity', () => {
    const samples = new Float32Array(48_000)
    samples.fill(0.1)
    const measurement = measureAmbienceLoopBoundary({ samples, sampleRate: 48_000 })
    expect(measurement).toEqual({
      edgeJump: 0,
      rmsDifference: 0,
      dcOffsetDifference: 0,
      boundaryScore: 0,
    })
  })

  it('rejects both generated candidates when the selected loop seam remains audible', () => {
    expect(() => assertAmbienceLoopBoundaryQuality({
      edgeJump: 0.3,
      rmsDifference: 0.02,
      dcOffsetDifference: 0.01,
      boundaryScore: 0.33,
    })).toThrow('AUDIO_AMBIENCE_LOOP_BOUNDARY_QUALITY_FAILED')
  })
})
