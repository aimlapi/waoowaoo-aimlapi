import { describe, expect, it } from 'vitest'
import { assertLyriaPromptSafe, buildLyriaPrompt } from '@/lib/audio-design/lyria-prompt'
import { createTestContinuityPlan, TEST_CLOCK } from './audio-timeline-fixture'

describe('Lyria provider-safe prompt', () => {
  it('never forwards the internal narrative diagnosis to Lyria', () => {
    const cue = createTestContinuityPlan().scoreCues[0]!
    const prompt = buildLyriaPrompt({ cue, clock: TEST_CLOCK })

    expect(prompt).toContain('60 BPM')
    expect(prompt).toContain('key of D minor')
    expect(prompt).not.toContain(cue.narrativeDiagnosis.surfaceEmotion)
    expect(prompt).not.toContain(cue.narrativeDiagnosis.musicShouldDo)
    expect(prompt).not.toMatch(/blood|violence|torture|tooth/i)
  })

  it('rejects provider prompts containing violent narrative language', () => {
    expect(() => assertLyriaPromptSafe('Instrumental score for a violent bloody scene.'))
      .toThrow('LYRIA_PROMPT_POLICY_VALIDATION_FAILED')
  })
})
