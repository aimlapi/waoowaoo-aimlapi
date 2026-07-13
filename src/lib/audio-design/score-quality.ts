import type { MusicTheorySpecV2 } from './types'
import type { ScoreCandidateQuality } from '@/lib/bgm-score/types'

function rms(samples: Float32Array, start: number, end: number): number {
  let sum = 0
  for (let index = start; index < end; index += 1) {
    const value = samples[index] ?? 0
    sum += value * value
  }
  return Math.sqrt(sum / Math.max(1, end - start))
}

function buildEnvelope(samples: Float32Array, sampleRate: number): readonly number[] {
  const windowSamples = Math.max(1, Math.round(sampleRate * 0.1))
  const envelope: number[] = []
  for (let start = 0; start < samples.length; start += windowSamples) {
    envelope.push(rms(samples, start, Math.min(samples.length, start + windowSamples)))
  }
  return envelope
}

function correlation(values: readonly number[], lag: number): number {
  if (lag <= 0 || lag >= values.length) return 0
  const count = values.length - lag
  let sumA = 0
  let sumB = 0
  for (let index = 0; index < count; index += 1) {
    sumA += values[index] ?? 0
    sumB += values[index + lag] ?? 0
  }
  const meanA = sumA / count
  const meanB = sumB / count
  let numerator = 0
  let denominatorA = 0
  let denominatorB = 0
  for (let index = 0; index < count; index += 1) {
    const a = (values[index] ?? 0) - meanA
    const b = (values[index + lag] ?? 0) - meanB
    numerator += a * b
    denominatorA += a * a
    denominatorB += b * b
  }
  const denominator = Math.sqrt(denominatorA * denominatorB)
  return denominator > 0 ? Math.max(-1, Math.min(1, numerator / denominator)) : 0
}

function measureRepetition(envelope: readonly number[], sampleRate: number): number {
  const windowsPerSecond = 10
  const minimumLag = Math.max(2, Math.round(windowsPerSecond * 1.5))
  const maximumLag = Math.min(envelope.length - 2, Math.round(windowsPerSecond * 8))
  if (maximumLag < minimumLag || sampleRate <= 0) return 0
  let maximum = 0
  for (let lag = minimumLag; lag <= maximumLag; lag += 1) {
    maximum = Math.max(maximum, correlation(envelope, lag))
  }
  return Math.max(0, maximum)
}

function expectedEnergyAt(spec: MusicTheorySpecV2, ratio: number): number {
  const phase = spec.phases.find((item, index) => {
    const firstFrame = spec.phases[0]?.range.startFrame ?? 0
    const lastFrame = spec.phases[spec.phases.length - 1]?.range.endFrameExclusive ?? 1
    const frame = firstFrame + ratio * Math.max(1, lastFrame - firstFrame)
    return frame >= item.range.startFrame
      && (frame < item.range.endFrameExclusive || index === spec.phases.length - 1)
  })
  return phase?.energy ?? spec.dynamics.minimumEnergy
}

function measureStructureError(envelope: readonly number[], spec: MusicTheorySpecV2): number {
  const maximum = Math.max(...envelope, 0)
  if (maximum <= 0 || envelope.length === 0) return 1
  let error = 0
  for (let index = 0; index < envelope.length; index += 1) {
    const actual = (envelope[index] ?? 0) / maximum
    const expected = expectedEnergyAt(spec, index / Math.max(1, envelope.length - 1))
    error += Math.abs(actual - expected)
  }
  return Math.min(1, error / envelope.length)
}

function targetTransientRate(policy: MusicTheorySpecV2['dynamics']['transientPolicy']): number {
  if (policy === 'suppressed') return 0.5
  if (policy === 'restrained') return 1.5
  return 4
}

export function analyzeScoreCandidate(input: {
  readonly samples: Float32Array
  readonly sampleRate: number
  readonly expectedDurationSeconds: number
  readonly sourceDurationSeconds: number
  readonly durationConformanceRatio: number
  readonly spec: MusicTheorySpecV2
}): ScoreCandidateQuality {
  if (!Number.isInteger(input.sampleRate) || input.sampleRate <= 0) {
    throw new Error('AUDIO_SCORE_QUALITY_SAMPLE_RATE_INVALID')
  }
  if (input.samples.length < input.sampleRate) throw new Error('AUDIO_SCORE_CANDIDATE_TOO_SHORT')
  const envelope = buildEnvelope(input.samples, input.sampleRate)
  let peakAmplitude = 0
  let sumSquares = 0
  let clippedSamples = 0
  for (const sample of input.samples) {
    const absolute = Math.abs(sample)
    peakAmplitude = Math.max(peakAmplitude, absolute)
    sumSquares += sample * sample
    if (absolute >= 0.999) clippedSamples += 1
  }
  const rmsAmplitude = Math.sqrt(sumSquares / input.samples.length)
  const clippingRatio = clippedSamples / input.samples.length
  const silenceRatio = envelope.filter((value) => value < 0.002).length / Math.max(1, envelope.length)
  let transientCount = 0
  for (let index = 1; index < envelope.length; index += 1) {
    if (Math.abs((envelope[index] ?? 0) - (envelope[index - 1] ?? 0)) > 0.035) transientCount += 1
  }
  const actualDurationSeconds = input.samples.length / input.sampleRate
  const transientRate = transientCount / Math.max(1, actualDurationSeconds)
  const repetitionScore = measureRepetition(envelope, input.sampleRate)
  const structureError = measureStructureError(envelope, input.spec)
  const durationErrorSeconds = Math.abs(actualDurationSeconds - input.expectedDurationSeconds)
  const durationError = durationErrorSeconds / input.expectedDurationSeconds
  const transientError = Math.min(1, Math.abs(transientRate - targetTransientRate(input.spec.dynamics.transientPolicy)) / 4)
  const periodicPenalty = input.spec.prohibitions.includes('periodic_phrase_cycle')
    ? Math.max(0, repetitionScore - 0.8)
    : 0
  const qualityScore = Math.max(0, Math.min(100,
    100
    - clippingRatio * 2_000
    - Math.max(0, silenceRatio - 0.25) * 80
    - structureError * 35
    - transientError * 15
    - periodicPenalty * 40
    - durationError * 100,
  ))
  const passed = peakAmplitude >= 0.01
    && clippingRatio <= 0.01
    && silenceRatio <= 0.5
    && durationErrorSeconds <= 0.001

  return {
    actualDurationSeconds,
    sourceDurationSeconds: input.sourceDurationSeconds,
    durationConformanceRatio: input.durationConformanceRatio,
    peakAmplitude,
    rmsAmplitude,
    clippingRatio,
    silenceRatio,
    transientRate,
    repetitionScore,
    structureError,
    qualityScore,
    passed,
  }
}

export function selectScoreCandidate(candidates: readonly ScoreCandidateQuality[]): number {
  if (candidates.length !== 2) throw new Error('AUDIO_SCORE_TWO_CANDIDATES_REQUIRED')
  const passing = candidates
    .map((quality, index) => ({ quality, index }))
    .filter(({ quality }) => quality.passed)
    .sort((a, b) => b.quality.qualityScore - a.quality.qualityScore)
  const selected = passing[0]
  if (!selected) throw new Error('AUDIO_SCORE_CANDIDATE_QUALITY_FAILED')
  return selected.index
}
