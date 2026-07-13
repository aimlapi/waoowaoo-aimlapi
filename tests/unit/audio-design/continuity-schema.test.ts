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

  it('rejects an orchestration count that contradicts the planned ensemble complexity', () => {
    const plan = createTestContinuityPlan()
    const cue = plan.scoreCues[0]!
    const result = audioContinuityPlanSchema.safeParse({
      ...plan,
      scoreCues: [{
        ...cue,
        musicTheorySpec: {
          ...cue.musicTheorySpec,
          ensembleComplexity: 'architectural',
        },
      }],
    })

    expect(result.success).toBe(false)
    if (result.success) throw new Error('TEST_ENSEMBLE_COMPLEXITY_REJECTION_REQUIRED')
    expect(result.error.issues.map((issue) => issue.message)).toContain(
      'AUDIO_SCORE_ENSEMBLE_COMPLEXITY_COUNT_INVALID:architectural',
    )
  })

  it('rejects an orchestration part that omits a formal phase state', () => {
    const plan = createTestContinuityPlan()
    const cue = plan.scoreCues[0]!
    const result = audioContinuityPlanSchema.safeParse({
      ...plan,
      scoreCues: [{
        ...cue,
        musicTheorySpec: {
          ...cue.musicTheorySpec,
          orchestration: cue.musicTheorySpec.orchestration.map((part, index) => index === 0
            ? { ...part, phaseStates: [] }
            : part),
        },
      }],
    })

    expect(result.success).toBe(false)
    if (result.success) throw new Error('TEST_ORCHESTRATION_PHASE_STATE_REJECTION_REQUIRED')
    expect(result.error.issues.some((issue) => issue.path.join('.').includes('phaseStates'))).toBe(true)
  })

  it('rejects same-family padding that masquerades as a rich chamber orchestration', () => {
    const plan = createTestContinuityPlan()
    const cue = plan.scoreCues[0]!
    const stringInstruments = ['contrabass', 'solo_cello', 'solo_viola', 'string_harmonics'] as const
    const result = audioContinuityPlanSchema.safeParse({
      ...plan,
      scoreCues: [{
        ...cue,
        musicTheorySpec: {
          ...cue.musicTheorySpec,
          orchestration: cue.musicTheorySpec.orchestration.map((part, index) => ({
            ...part,
            family: 'strings',
            instrument: stringInstruments[index],
          })),
        },
      }],
    })

    expect(result.success).toBe(false)
    if (result.success) throw new Error('TEST_INSTRUMENT_FAMILY_DIVERSITY_REJECTION_REQUIRED')
    expect(result.error.issues.some((issue) => issue.message.startsWith(
      'AUDIO_SCORE_INSTRUMENT_FAMILY_DIVERSITY_INSUFFICIENT',
    ))).toBe(true)
  })
})
