export interface AmbienceLoopBoundaryMeasurement {
  readonly edgeJump: number
  readonly rmsDifference: number
  readonly dcOffsetDifference: number
  readonly boundaryScore: number
}

function rms(samples: Float32Array, start: number, end: number): number {
  let sum = 0
  for (let index = start; index < end; index += 1) {
    const value = samples[index] ?? 0
    sum += value * value
  }
  return Math.sqrt(sum / Math.max(1, end - start))
}

function mean(samples: Float32Array, start: number, end: number): number {
  let sum = 0
  for (let index = start; index < end; index += 1) sum += samples[index] ?? 0
  return sum / Math.max(1, end - start)
}

export function measureAmbienceLoopBoundary(input: {
  readonly samples: Float32Array
  readonly sampleRate: number
  readonly analysisWindowSeconds?: number
}): AmbienceLoopBoundaryMeasurement {
  if (!Number.isInteger(input.sampleRate) || input.sampleRate <= 0) {
    throw new Error('AUDIO_AMBIENCE_LOOP_SAMPLE_RATE_INVALID')
  }
  if (input.samples.length < input.sampleRate) {
    throw new Error('AUDIO_AMBIENCE_LOOP_CANDIDATE_TOO_SHORT')
  }
  const requestedWindow = input.analysisWindowSeconds ?? 0.25
  if (!Number.isFinite(requestedWindow) || requestedWindow <= 0 || requestedWindow > 1) {
    throw new Error('AUDIO_AMBIENCE_LOOP_ANALYSIS_WINDOW_INVALID')
  }
  const windowSamples = Math.min(
    Math.floor(input.samples.length / 4),
    Math.max(1, Math.round(input.sampleRate * requestedWindow)),
  )
  const tailStart = input.samples.length - windowSamples
  const headRms = rms(input.samples, 0, windowSamples)
  const tailRms = rms(input.samples, tailStart, input.samples.length)
  const headMean = mean(input.samples, 0, windowSamples)
  const tailMean = mean(input.samples, tailStart, input.samples.length)
  const edgeJump = Math.abs((input.samples[0] ?? 0) - (input.samples[input.samples.length - 1] ?? 0))
  const rmsDifference = Math.abs(headRms - tailRms)
  const dcOffsetDifference = Math.abs(headMean - tailMean)
  return {
    edgeJump,
    rmsDifference,
    dcOffsetDifference,
    boundaryScore: edgeJump + rmsDifference + dcOffsetDifference,
  }
}

export function selectBestAmbienceLoopCandidate<T extends { readonly boundaryScore: number }>(
  candidates: readonly T[],
): number {
  if (candidates.length !== 2) throw new Error('AUDIO_AMBIENCE_LOOP_TWO_CANDIDATES_REQUIRED')
  const [first, second] = candidates
  if (!first || !second || !Number.isFinite(first.boundaryScore) || !Number.isFinite(second.boundaryScore)) {
    throw new Error('AUDIO_AMBIENCE_LOOP_BOUNDARY_SCORE_INVALID')
  }
  return first.boundaryScore <= second.boundaryScore ? 0 : 1
}

export function assertAmbienceLoopBoundaryQuality(
  measurement: AmbienceLoopBoundaryMeasurement,
): void {
  if (
    measurement.edgeJump > 0.2
    || measurement.rmsDifference > 0.12
    || measurement.dcOffsetDifference > 0.05
  ) {
    throw new Error('AUDIO_AMBIENCE_LOOP_BOUNDARY_QUALITY_FAILED')
  }
}
