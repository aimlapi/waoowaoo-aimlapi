import type { ScoreCandidateQuality } from '@/lib/bgm-score/types'
import type { MusicTheorySpecV3 } from './types'

const SPECTRAL_BANDS = [
  { key: 'sub', centerHz: 45 },
  { key: 'low', centerHz: 120 },
  { key: 'lowMid', centerHz: 350 },
  { key: 'mid', centerHz: 1_200 },
  { key: 'highMid', centerHz: 3_500 },
  { key: 'high', centerHz: 8_000 },
  { key: 'air', centerHz: 15_000 },
] as const

type SpectralDistribution = ScoreCandidateQuality['spectralDistribution']

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

function measureRepetition(envelope: readonly number[]): number {
  const windowsPerSecond = 10
  const minimumLag = Math.max(2, Math.round(windowsPerSecond * 1.5))
  const maximumLag = Math.min(envelope.length - 2, Math.round(windowsPerSecond * 8))
  if (maximumLag < minimumLag) return 0
  let maximum = 0
  for (let lag = minimumLag; lag <= maximumLag; lag += 1) {
    maximum = Math.max(maximum, correlation(envelope, lag))
  }
  return Math.max(0, maximum)
}

function expectedEnergyAt(spec: MusicTheorySpecV3, ratio: number): number {
  const firstFrame = spec.phases[0]?.range.startFrame ?? 0
  const lastFrame = spec.phases[spec.phases.length - 1]?.range.endFrameExclusive ?? 1
  const frame = firstFrame + ratio * Math.max(1, lastFrame - firstFrame)
  const phase = spec.phases.find((item, index) => frame >= item.range.startFrame
    && (frame < item.range.endFrameExclusive || index === spec.phases.length - 1))
  return phase?.energy ?? spec.dynamics.minimumEnergy
}

function measureStructureError(envelope: readonly number[], spec: MusicTheorySpecV3): number {
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

function targetTransientRate(policy: MusicTheorySpecV3['dynamics']['transientPolicy']): number {
  if (policy === 'suppressed') return 0.5
  if (policy === 'restrained') return 1.5
  return 4
}

function percentile(values: readonly number[], ratio: number): number {
  if (values.length === 0) return 0
  const ordered = [...values].sort((a, b) => a - b)
  const index = Math.min(ordered.length - 1, Math.max(0, Math.round((ordered.length - 1) * ratio)))
  return ordered[index] ?? 0
}

function goertzelPower(
  samples: Float32Array,
  start: number,
  length: number,
  sampleRate: number,
  frequency: number,
): number {
  const coefficient = 2 * Math.cos((2 * Math.PI * frequency) / sampleRate)
  let previous = 0
  let previousPrevious = 0
  for (let offset = 0; offset < length; offset += 1) {
    const phase = offset / Math.max(1, length - 1)
    const window = 0.5 - 0.5 * Math.cos(2 * Math.PI * phase)
    const current = (samples[start + offset] ?? 0) * window + coefficient * previous - previousPrevious
    previousPrevious = previous
    previous = current
  }
  return Math.max(0, previousPrevious * previousPrevious + previous * previous - coefficient * previous * previousPrevious)
}

function normalizeSpectrum(values: readonly number[]): readonly number[] {
  const total = values.reduce((sum, value) => sum + value, 0)
  if (total <= 0) return values.map(() => 0)
  return values.map((value) => value / total)
}

function measureSpectrum(input: {
  readonly samples: Float32Array
  readonly sampleRate: number
}): {
  readonly distribution: SpectralDistribution
  readonly timbralVariation: number
} {
  const windowLength = Math.min(4_096, input.samples.length)
  const stride = Math.max(windowLength, Math.round(input.sampleRate * 0.5))
  const accumulated = SPECTRAL_BANDS.map(() => 0)
  const windowDistributions: number[][] = []
  for (let start = 0; start + windowLength <= input.samples.length; start += stride) {
    const powers = SPECTRAL_BANDS.map((band) => goertzelPower(
      input.samples,
      start,
      windowLength,
      input.sampleRate,
      band.centerHz,
    ))
    const normalized = normalizeSpectrum(powers)
    windowDistributions.push([...normalized])
    normalized.forEach((value, index) => {
      accumulated[index] = (accumulated[index] ?? 0) + value
    })
  }
  const distributionValues = normalizeSpectrum(accumulated)
  let variationSum = 0
  for (let index = 1; index < windowDistributions.length; index += 1) {
    const previous = windowDistributions[index - 1] ?? []
    const current = windowDistributions[index] ?? []
    variationSum += current.reduce(
      (sum, value, bandIndex) => sum + Math.abs(value - (previous[bandIndex] ?? 0)),
      0,
    ) / 2
  }
  const timbralVariation = Math.min(1, variationSum / Math.max(1, windowDistributions.length - 1))
  const distribution = Object.fromEntries(
    SPECTRAL_BANDS.map((band, index) => [band.key, distributionValues[index] ?? 0]),
  ) as SpectralDistribution
  return { distribution, timbralVariation }
}

function measureSpectralBudgetError(
  distribution: SpectralDistribution,
  budget: MusicTheorySpecV3['spectralBudget'],
): number {
  const actual = SPECTRAL_BANDS.map((band) => distribution[band.key])
  const expected = [budget.sub, budget.low, budget.lowMid, budget.mid, budget.highMid, budget.high, budget.air]
  return Math.min(1, actual.reduce(
    (sum, value, index) => sum + Math.abs(value - (expected[index] ?? 0) / 100),
    0,
  ) / 2)
}

function minimumSpectralCoverage(complexity: MusicTheorySpecV3['ensembleComplexity']): number {
  if (complexity === 'minimal') return 2
  if (complexity === 'chamber') return 3
  if (complexity === 'hybrid') return 4
  return 5
}

export function analyzeScoreCandidate(input: {
  readonly samples: Float32Array
  readonly sampleRate: number
  readonly expectedDurationSeconds: number
  readonly sourceDurationSeconds: number
  readonly durationConformanceRatio: number
  readonly spec: MusicTheorySpecV3
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
  const repetitionScore = measureRepetition(envelope)
  const structureError = measureStructureError(envelope, input.spec)
  const durationErrorSeconds = Math.abs(actualDurationSeconds - input.expectedDurationSeconds)
  const durationError = durationErrorSeconds / input.expectedDurationSeconds
  const transientError = Math.min(1, Math.abs(transientRate - targetTransientRate(input.spec.dynamics.transientPolicy)) / 4)
  const periodicPenalty = input.spec.prohibitions.includes('periodic_phrase_cycle')
    ? Math.max(0, repetitionScore - 0.8)
    : 0
  const spectral = measureSpectrum(input)
  const spectralBudgetError = measureSpectralBudgetError(spectral.distribution, input.spec.spectralBudget)
  const spectralCoverage = Object.values(spectral.distribution).filter((value) => value >= 0.02).length
  const audibleEnvelope = envelope.filter((value) => value >= 0.002)
  const lowEnvelope = percentile(audibleEnvelope, 0.1)
  const highEnvelope = percentile(audibleEnvelope, 0.9)
  const dynamicRangeDb = lowEnvelope > 0 ? Math.max(0, 20 * Math.log10(highEnvelope / lowEnvelope)) : 0
  const crestFactorDb = rmsAmplitude > 0 ? Math.max(0, 20 * Math.log10(peakAmplitude / rmsAmplitude)) : 0
  const qualityScore = Math.max(0, Math.min(100,
    100
    - clippingRatio * 2_000
    - Math.max(0, silenceRatio - 0.25) * 80
    - structureError * 25
    - transientError * 10
    - periodicPenalty * 30
    - spectralBudgetError * 25
    - Math.max(0, minimumSpectralCoverage(input.spec.ensembleComplexity) - spectralCoverage) * 5
    - Math.max(0, 0.015 - spectral.timbralVariation) * 200
    - durationError * 100,
  ))
  const passed = peakAmplitude >= 0.01
    && clippingRatio <= 0.01
    && silenceRatio <= 0.5
    && durationErrorSeconds <= 0.001
    && spectralBudgetError <= 0.8
    && spectralCoverage >= minimumSpectralCoverage(input.spec.ensembleComplexity)

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
    spectralDistribution: spectral.distribution,
    spectralBudgetError,
    spectralCoverage,
    timbralVariation: spectral.timbralVariation,
    crestFactorDb,
    dynamicRangeDb,
    qualityScore,
    passed,
  }
}

export function selectScoreCandidate(candidates: readonly ScoreCandidateQuality[]): number {
  if (candidates.length !== 4) throw new Error('AUDIO_SCORE_FOUR_CANDIDATES_REQUIRED')
  const passing = candidates
    .map((quality, index) => ({ quality, index }))
    .filter(({ quality }) => quality.passed)
    .sort((a, b) => b.quality.qualityScore - a.quality.qualityScore)
  const selected = passing[0]
  if (!selected) throw new Error('AUDIO_SCORE_CANDIDATE_QUALITY_FAILED')
  return selected.index
}
