import { describe, expect, it } from 'vitest'
import {
  buildAudioTimelineV2,
  buildTimelineClips,
  createTimelineClock,
  createTimelineSignature,
} from '@/lib/audio-design/timeline'
import { frameToSample, framesToSeconds } from '@/lib/audio-design/types'
import type { FinalRenderClipPlan } from '@/lib/video-compose/final-render-plan'
import { createTestContinuityPlan } from './audio-timeline-fixture'

function clip(order: number, durationSeconds: number): FinalRenderClipPlan {
  return {
    panelId: `panel-${order}`,
    groupId: null,
    sourceKind: 'panel',
    source: `/media/${order}.mp4`,
    durationSeconds,
    order,
    shotNumber: order,
    shotNumbers: [order],
    description: `shot ${order}`,
    sound: 'native dialogue and synchronized action sounds only',
  }
}

describe('frame-authoritative audio timeline', () => {
  it('uses the product 24 fps clock and maps each frame to exactly 2000 audio samples', () => {
    const clips = [clip(1, 5), clip(2, 5)]
    const clock = createTimelineClock({ clips, fpsNumerator: 24, fpsDenominator: 1 })

    expect(clock).toEqual({ fpsNumerator: 24, fpsDenominator: 1, sampleRate: 48_000, totalFrames: 240 })
    expect(frameToSample(1, clock)).toBe(2_000)
    expect(frameToSample(239, clock)).toBe(478_000)
    expect(framesToSeconds(240, clock)).toBe(10)
  })

  it('quantizes cumulative clip boundaries without gaps or overlaps', () => {
    const clips = [clip(1, 3.333), clip(2, 2.667), clip(3, 4)]
    const clock = createTimelineClock({ clips, fpsNumerator: 24, fpsDenominator: 1 })
    const timelineClips = buildTimelineClips(clips, clock)

    expect(timelineClips.map((item) => item.range)).toEqual([
      { startFrame: 0, endFrameExclusive: 80 },
      { startFrame: 80, endFrameExclusive: 144 },
      { startFrame: 144, endFrameExclusive: 240 },
    ])
  })

  it('keeps one ambience source and one score cue continuous across shot boundaries', () => {
    const clips = [clip(1, 5), clip(2, 5)]
    const clock = createTimelineClock({ clips, fpsNumerator: 24, fpsDenominator: 1 })
    const signature = createTimelineSignature({ clips, clock })
    const timeline = buildAudioTimelineV2({
      clips,
      clock,
      timelineSignature: signature,
      continuityPlan: createTestContinuityPlan(),
      nativeActionEvents: [],
    })

    expect(timeline.schemaVersion).toBe(4)
    expect(timeline.clips.map((item) => item.range)).toEqual([
      { startFrame: 0, endFrameExclusive: 120 },
      { startFrame: 120, endFrameExclusive: 240 },
    ])
    expect(timeline.ambienceSources[0]?.range).toEqual({ startFrame: 0, endFrameExclusive: 240 })
    expect(timeline.scoreCues[0]?.range).toEqual({ startFrame: 0, endFrameExclusive: 240 })
    expect(timeline.stemPlan.map((stem) => stem.role)).toEqual(['native_video', 'ambience', 'bgm'])
  })

  it('does not create ambience or BGM stems when presence selects native audio only', () => {
    const clips = [clip(1, 10)]
    const clock = createTimelineClock({ clips, fpsNumerator: 24, fpsDenominator: 1 })
    const base = createTestContinuityPlan()
    const timeline = buildAudioTimelineV2({
      clips,
      clock,
      timelineSignature: createTimelineSignature({ clips, clock }),
      nativeActionEvents: [],
      continuityPlan: {
        ...base,
        acousticTransitions: [],
        soundPresence: [{
          segmentId: 'native-only',
          range: { startFrame: 0, endFrameExclusive: 240 },
          mode: 'native_only',
          fadeInFrames: 12,
          fadeOutFrames: 12,
          reason: 'native dialogue and action carry the complete sequence',
        }],
        ambienceSources: [],
        scoreCues: [],
      },
    })

    expect(timeline.stemPlan.map((stem) => stem.role)).toEqual(['native_video'])
    expect(timeline.ambienceSources).toEqual([])
    expect(timeline.scoreCues).toEqual([])
  })
})
