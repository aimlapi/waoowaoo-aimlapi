import { describe, expect, it } from 'vitest'
import { buildDisplayBgmPlan, buildFinalBgmMusicRequest } from '@/lib/bgm-score/prompt'
import { createTestContinuityPlan, TEST_CLOCK } from '../audio-design/audio-timeline-fixture'

describe('BGM plan and provider prompt', () => {
  it('derives the UI plan and provider prompt from the same structured music spec', () => {
    const cue = createTestContinuityPlan().scoreCues[0]!
    const plan = buildDisplayBgmPlan({ cue, clock: TEST_CLOCK, locale: 'zh' })

    expect(plan.durationSeconds).toBe(10)
    expect(plan.creativeBrief.cueType).toBe('跨镜头连续纯器乐配乐')
    expect(plan.virtualLayers).toHaveLength(2)
    expect(plan.finalPrompt).toContain('60 BPM')
    expect(buildFinalBgmMusicRequest(plan)).toEqual({
      prompt: plan.finalPrompt,
      negativePrompt: plan.negativePrompt,
    })
  })

  it('does not leak internal narrative descriptions into the Lyria prompt', () => {
    const cue = createTestContinuityPlan().scoreCues[0]!
    const plan = buildDisplayBgmPlan({ cue, clock: TEST_CLOCK })

    expect(plan.finalPrompt).not.toContain(cue.narrativeDiagnosis.surfaceEmotion)
    expect(plan.finalPrompt).not.toContain(cue.narrativeDiagnosis.musicShouldNotDo)
    expect(plan.finalPrompt).not.toMatch(/blood|violence|torture|tooth/i)
  })
})
