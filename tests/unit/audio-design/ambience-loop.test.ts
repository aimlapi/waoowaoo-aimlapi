import { describe, expect, it } from 'vitest'
import {
  assertAmbienceLoopBoundaryQuality,
  measureAmbienceCandidateQuality,
  measureAmbienceLoopBoundary,
  selectBestAmbienceCandidate,
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

  it('selects the acoustically appropriate candidate instead of relying on loop seam alone', () => {
    expect(selectBestAmbienceCandidate([{
      boundaryScore: 0.01,
      quality: {
        rmsAmplitude: 0.4, peakAmplitude: 0.9, transientRate: 18,
        salienceScore: 0.9, qualityScore: 45, passed: false,
      },
    }, {
      boundaryScore: 0.03,
      quality: {
        rmsAmplitude: 0.05, peakAmplitude: 0.2, transientRate: 1,
        salienceScore: 0.25, qualityScore: 92, passed: true,
      },
    }])).toBe(1)
  })

  it('measures a stable ambience bed as low-transient and eligible', () => {
    const samples = new Float32Array(48_000)
    for (let index = 0; index < samples.length; index += 1) {
      samples[index] = Math.sin(index / 80) * 0.02
    }
    const quality = measureAmbienceCandidateQuality({
      samples,
      sampleRate: 48_000,
      targetSalience: 0.2,
      maximumTransientRate: 4,
      boundaryScore: 0.01,
    })
    expect(quality.transientRate).toBe(0)
    expect(quality.passed).toBe(true)
    expect(quality.qualityScore).toBeGreaterThan(55)
  })
})
