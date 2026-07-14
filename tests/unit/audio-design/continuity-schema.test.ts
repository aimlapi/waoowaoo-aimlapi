import { describe, expect, it } from 'vitest'
import { audioContinuityPlanSchema } from '@/lib/audio-design/types'
import { createTestContinuityPlan } from './audio-timeline-fixture'

describe('audio continuity relationship contract', () => {
  it('requires one full-range bed for every SoundWorld', () => {
    const plan = createTestContinuityPlan()
    const result = audioContinuityPlanSchema.safeParse({
      ...plan,
      ambienceSources: plan.ambienceSources.map((source) => ({ ...source, role: 'detail' })),
    })
    expect(result.success).toBe(false)
    if (result.success) throw new Error('TEST_SOUND_WORLD_BED_REJECTION_REQUIRED')
    expect(result.error.issues.map((issue) => issue.message)).toContain(
      'AUDIO_SOUND_WORLD_BED_REQUIRED:stadium-world',
    )
  })

  it('rejects duplicate ambience gain automation for a deterministic acoustic transition', () => {
    const plan = createTestContinuityPlan()
    const result = audioContinuityPlanSchema.safeParse({
      ...plan,
      automationLanes: [{
        laneId: 'duplicate-exit-gain',
        targetBus: 'ambience',
        targetSourceId: 'rain-bed',
        parameter: 'gain_db',
        keyframes: [
          { frame: 108, value: -8, interpolation: 'smooth' },
          { frame: 132, value: -2, interpolation: 'smooth' },
        ],
        postBehavior: 'hold',
        reason: 'duplicate transition gain',
        sourceEventId: 'exit-stadium',
      }],
    })
    expect(result.success).toBe(false)
    if (result.success) throw new Error('TEST_DUPLICATE_TRANSITION_AUTOMATION_REJECTION_REQUIRED')
    expect(result.error.issues.map((issue) => issue.message)).toContain(
      'AUDIO_TRANSITION_DUPLICATE_GAIN_AUTOMATION:duplicate-exit-gain',
    )
  })

  it('rejects SoundWorld gaps instead of leaving frames without an acoustic authority', () => {
    const plan = createTestContinuityPlan()
    const firstWorld = plan.soundWorlds[0]
    if (!firstWorld) throw new Error('TEST_SOUND_WORLD_REQUIRED')
    const result = audioContinuityPlanSchema.safeParse({
      ...plan,
      soundWorlds: [{
        ...firstWorld,
        range: { startFrame: 0, endFrameExclusive: 100 },
        perspectives: [{
          ...firstWorld.perspectives[0],
          range: { startFrame: 0, endFrameExclusive: 100 },
        }],
      }, {
        ...firstWorld,
        worldId: 'stadium-world-after-gap',
        range: { startFrame: 120, endFrameExclusive: 240 },
        perspectives: [{
          ...firstWorld.perspectives[1],
          range: { startFrame: 120, endFrameExclusive: 240 },
        }],
      }],
    })

    expect(result.success).toBe(false)
    if (result.success) throw new Error('TEST_SOUND_WORLD_GAP_REJECTION_REQUIRED')
    expect(result.error.issues.map((issue) => issue.message)).toContain('AUDIO_SOUND_WORLDS_NOT_CONTIGUOUS')
  })
})
