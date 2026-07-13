import { frameToSample, type TimelineClock } from './types'

export type AmbienceContinuityMeasurement = {
  readonly frame: number
  readonly beforeDb: number
  readonly afterDb: number
  readonly deltaDb: number
}

const MIN_RMS = 1e-9

function rms(samples: Float32Array, startSample: number, endSampleExclusive: number): number {
  let sumSquares = 0
  for (let index = startSample; index < endSampleExclusive; index += 1) {
    const sample = samples[index] ?? 0
    sumSquares += sample * sample
  }
  return Math.sqrt(sumSquares / Math.max(1, endSampleExclusive - startSample))
}

function toDb(value: number): number {
  return 20 * Math.log10(Math.max(MIN_RMS, value))
}

export function measureAmbienceContinuity(input: {
  readonly samples: Float32Array
  readonly clock: TimelineClock
  readonly boundaryFrames: readonly number[]
  readonly windowFrames?: number
}): readonly AmbienceContinuityMeasurement[] {
  const windowFrames = input.windowFrames ?? 24
  if (!Number.isInteger(windowFrames) || windowFrames <= 0) {
    throw new Error('AUDIO_AMBIENCE_CONTINUITY_WINDOW_INVALID')
  }
  return [...new Set(input.boundaryFrames)].sort((left, right) => left - right).map((frame) => {
    if (!Number.isInteger(frame) || frame <= 0 || frame >= input.clock.totalFrames) {
      throw new Error(`AUDIO_AMBIENCE_CONTINUITY_BOUNDARY_INVALID:${frame}`)
    }
    const startSample = frameToSample(Math.max(0, frame - windowFrames), input.clock)
    const boundarySample = frameToSample(frame, input.clock)
    const endSample = frameToSample(Math.min(input.clock.totalFrames, frame + windowFrames), input.clock)
    if (endSample > input.samples.length) {
      throw new Error(`AUDIO_AMBIENCE_CONTINUITY_PCM_TOO_SHORT:${input.samples.length}:${endSample}`)
    }
    const beforeDb = toDb(rms(input.samples, startSample, boundarySample))
    const afterDb = toDb(rms(input.samples, boundarySample, endSample))
    return {
      frame,
      beforeDb,
      afterDb,
      deltaDb: afterDb - beforeDb,
    }
  })
}

export function assertAmbienceContinuity(input: {
  readonly measurements: readonly AmbienceContinuityMeasurement[]
  readonly maximumDeltaDb?: number
}): void {
  const maximumDeltaDb = input.maximumDeltaDb ?? 6
  if (!Number.isFinite(maximumDeltaDb) || maximumDeltaDb <= 0) {
    throw new Error('AUDIO_AMBIENCE_CONTINUITY_THRESHOLD_INVALID')
  }
  const failure = input.measurements.find((measurement) => Math.abs(measurement.deltaDb) > maximumDeltaDb)
  if (failure) {
    throw new Error(
      `FINAL_VIDEO_RENDER_AMBIENCE_CONTINUITY_FAILED:${failure.frame}:${failure.deltaDb.toFixed(3)}`,
    )
  }
}
