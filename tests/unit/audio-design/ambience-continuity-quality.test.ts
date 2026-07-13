import { describe, expect, it } from 'vitest'
import {
  assertAmbienceContinuity,
  measureAmbienceContinuity,
} from '@/lib/audio-design/ambience-continuity-quality'
import { TEST_CLOCK } from './audio-timeline-fixture'

function constantSamples(firstHalf: number, secondHalf: number): Float32Array {
  const samples = new Float32Array(TEST_CLOCK.sampleRate * 10)
  samples.fill(firstHalf, 0, TEST_CLOCK.sampleRate * 5)
  samples.fill(secondHalf, TEST_CLOCK.sampleRate * 5)
  return samples
}

describe('ambience continuity quality', () => {
  it('accepts a continuous bed across a camera cut', () => {
    const measurements = measureAmbienceContinuity({
      samples: constantSamples(0.1, 0.1),
      clock: TEST_CLOCK,
      boundaryFrames: [120],
    })
    expect(measurements[0]).toMatchObject({ frame: 120, deltaDb: 0 })
    expect(() => assertAmbienceContinuity({ measurements })).not.toThrow()
  })

  it('rejects the final ambience bus when a cut creates an audible level cliff', () => {
    const measurements = measureAmbienceContinuity({
      samples: constantSamples(0.1, 0.02),
      clock: TEST_CLOCK,
      boundaryFrames: [120],
    })
    expect(measurements[0]?.deltaDb).toBeLessThan(-13)
    expect(() => assertAmbienceContinuity({ measurements })).toThrow(
      'FINAL_VIDEO_RENDER_AMBIENCE_CONTINUITY_FAILED:120',
    )
  })
})
