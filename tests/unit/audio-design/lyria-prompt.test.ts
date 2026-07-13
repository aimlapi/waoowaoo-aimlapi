import { describe, expect, it } from 'vitest'
import { assertLyriaPromptSafe, buildLyriaPrompts } from '@/lib/audio-design/lyria-prompt'
import { createTestContinuityPlan, TEST_CLOCK } from './audio-timeline-fixture'

describe('Lyria provider-safe prompt', () => {
  it('never forwards the internal narrative diagnosis to Lyria', () => {
    const cue = createTestContinuityPlan().scoreCues[0]!
    const { prompt, negativePrompt } = buildLyriaPrompts({
      cue,
      clock: TEST_CLOCK,
      strategy: 'spectral_depth',
    })

    expect(prompt).toContain('60 BPM')
    expect(prompt).toContain('weakened pitch field centered on D')
    expect(prompt).toContain('minor second aggregation')
    expect(prompt).not.toMatch(/restrained tension|warm intimacy|hopeful resolution/i)
    expect(prompt).not.toContain(cue.narrativeDiagnosis.surfaceEmotion)
    expect(prompt).not.toContain(cue.narrativeDiagnosis.musicShouldDo)
    expect(prompt).not.toMatch(/blood|violence|torture|tooth/i)
    expect(prompt).toContain('Target spectral budget')
    expect(prompt).toContain('bass-clarinet-partial')
    expect(prompt).toContain('Render priority: full planned spectral depth')
    expect(negativePrompt).toContain('foreground brass fanfare intervals')
    expect(negativePrompt).toContain('global energy apex followed by consonant tonal stabilization')
  })

  it('rejects provider prompts containing violent narrative language', () => {
    expect(() => assertLyriaPromptSafe('Instrumental score for a violent bloody scene.'))
      .toThrow('LYRIA_PROMPT_POLICY_VALIDATION_FAILED')
  })
})
