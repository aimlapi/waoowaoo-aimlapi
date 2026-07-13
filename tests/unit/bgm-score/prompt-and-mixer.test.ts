import { describe, expect, it } from 'vitest'
import { buildDisplayBgmPlan, buildFinalBgmMusicRequests } from '@/lib/bgm-score/prompt'
import { createTestContinuityPlan, TEST_CLOCK } from '../audio-design/audio-timeline-fixture'

describe('BGM plan and provider prompt', () => {
  it('derives the UI plan and provider prompt from the same structured music spec', () => {
    const cue = createTestContinuityPlan().scoreCues[0]!
    const plan = buildDisplayBgmPlan({ cue, clock: TEST_CLOCK, locale: 'zh' })

    expect(plan.durationSeconds).toBe(10)
    expect(plan.creativeBrief.cueType).toBe('跨镜头连续纯器乐配乐')
    expect(plan.virtualLayers).toHaveLength(4)
    expect(plan.finalPrompt).toContain('60 BPM')
    const requests = buildFinalBgmMusicRequests({ cue, clock: TEST_CLOCK })
    expect(requests.map((request) => request.strategy)).toEqual([
      'balanced_ensemble',
      'counterpoint_clarity',
      'spectral_depth',
      'microdynamic_detail',
    ])
    expect(requests.every((request) => request.negativePrompt === plan.negativePrompt)).toBe(true)
  })

  it('does not leak internal narrative descriptions into the Lyria prompt', () => {
    const cue = createTestContinuityPlan().scoreCues[0]!
    const plan = buildDisplayBgmPlan({ cue, clock: TEST_CLOCK })

    expect(plan.finalPrompt).not.toContain(cue.narrativeDiagnosis.surfaceEmotion)
    expect(plan.finalPrompt).not.toContain(cue.narrativeDiagnosis.musicShouldNotDo)
    expect(plan.finalPrompt).not.toMatch(/blood|violence|torture|tooth/i)
  })
})
