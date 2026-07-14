import { describe, expect, it } from 'vitest'
import {
  buildAudioTimelineV2,
  createTimelineClock,
  createTimelineSignature,
} from '@/lib/audio-design/timeline'
import type { FinalRenderClipPlan } from '@/lib/video-compose/final-render-plan'
import { createTestContinuityPlan } from '../../unit/audio-design/audio-timeline-fixture'

function stadiumClip(order: number, durationSeconds: number): FinalRenderClipPlan {
  return {
    order,
    sourceKind: 'panel',
    panelId: `panel-${order}`,
    groupId: null,
    shotNumber: order,
    shotNumbers: [order],
    source: `/media/stadium-${order}.mp4`,
    durationSeconds,
    description: `continuous stadium shot ${order}`,
    sound: 'native dialogue and synchronized physical action sounds',
  }
}

describe('SoundWorld continuity regression', () => {
  it('does not restart stadium ambience or score across three camera cuts in the same spacetime', () => {
    const clips = [stadiumClip(1, 3), stadiumClip(2, 3), stadiumClip(3, 4)]
    const clock = createTimelineClock({ clips, fpsNumerator: 24, fpsDenominator: 1 })
    const timeline = buildAudioTimelineV2({
      clips,
      clock,
      timelineSignature: createTimelineSignature({ clips, clock }),
      continuityPlan: createTestContinuityPlan(),
      nativeActionEvents: [],
    })

    expect(timeline.clips.map((clip) => clip.range)).toEqual([
      { startFrame: 0, endFrameExclusive: 72 },
      { startFrame: 72, endFrameExclusive: 144 },
      { startFrame: 144, endFrameExclusive: 240 },
    ])
    expect(timeline.soundWorlds).toHaveLength(1)
    expect(timeline.ambienceSources).toHaveLength(1)
    expect(timeline.ambienceSources[0]).toMatchObject({
      sourceContinuityId: 'storm-rain',
      range: { startFrame: 0, endFrameExclusive: 240 },
      playbackType: 'seamless_loop',
    })
    expect(timeline.scoreCues).toHaveLength(1)
    expect(timeline.scoreCues[0]?.range).toEqual({ startFrame: 0, endFrameExclusive: 240 })
  })
})
