import { describe, expect, it } from 'vitest'
import { analyzeScoreCandidate, selectScoreCandidate } from '@/lib/audio-design/score-quality'
import { createTestContinuityPlan } from './audio-timeline-fixture'

function sineCandidate(input: {
  readonly seconds: number
  readonly sampleRate: number
  readonly amplitude: number
  readonly clipped?: boolean
}): Float32Array {
  const samples = new Float32Array(input.seconds * input.sampleRate)
  for (let index = 0; index < samples.length; index += 1) {
    samples[index] = input.clipped
      ? 1
      : input.amplitude * Math.sin(2 * Math.PI * 55 * index / input.sampleRate)
  }
  return samples
}

describe('score candidate structural quality', () => {
  it('rejects clipped output and selects the passing candidate', () => {
    const spec = createTestContinuityPlan().scoreCues[0]!.musicTheorySpec
    const passing = analyzeScoreCandidate({
      samples: sineCandidate({ seconds: 10, sampleRate: 48_000, amplitude: 0.2 }),
      sampleRate: 48_000,
      expectedDurationSeconds: 10,
      sourceDurationSeconds: 10,
      durationConformanceRatio: 1,
      spec,
    })
    const clipped = analyzeScoreCandidate({
      samples: sineCandidate({ seconds: 10, sampleRate: 48_000, amplitude: 1, clipped: true }),
      sampleRate: 48_000,
      expectedDurationSeconds: 10,
      sourceDurationSeconds: 10,
      durationConformanceRatio: 1,
      spec,
    })

    expect(passing.passed).toBe(true)
    expect(clipped).toMatchObject({ clippingRatio: 1, passed: false })
    expect(selectScoreCandidate([clipped, passing])).toBe(1)
  })

  it('fails explicitly when neither candidate passes technical quality', () => {
    const failed = {
      actualDurationSeconds: 10,
      sourceDurationSeconds: 10,
      durationConformanceRatio: 1,
      peakAmplitude: 0,
      rmsAmplitude: 0,
      clippingRatio: 0,
      silenceRatio: 1,
      transientRate: 0,
      repetitionScore: 0,
      structureError: 1,
      qualityScore: 0,
      passed: false,
    }
    expect(() => selectScoreCandidate([failed, failed]))
      .toThrow('AUDIO_SCORE_CANDIDATE_QUALITY_FAILED')
  })
})
