import { describe, expect, it } from 'vitest'
import {
  buildStoryboardBatchPanelPrompt,
  type StoryboardBatchPanelPromptSeed,
} from '@/lib/dev-ab-test/storyboard-batch-prompts'

const seed: StoryboardBatchPanelPromptSeed = {
  panelNumber: 3,
  shotType: 'wide two-shot',
  cameraMove: 'static 50mm',
  duration: 7,
  location: 'meeting space',
  description: 'Female A and male B meet while holding their screen positions.',
  characterSlots: ['screen-left', 'screen-right'],
  props: ['table'],
}

describe('storyboard project batch prompts', () => {
  it('builds the global continuity prompt with fixed world state, axis rules, and negative constraints', () => {
    const prompt = buildStoryboardBatchPanelPrompt({
      schemeId: 'global-continuity-prompt',
      storyText: 'A woman stays left and a man stays right.',
      seed,
      locale: 'en',
    })

    expect(prompt).toContain('You are generating storyboard panels for a continuous film scene.')
    expect(prompt).toContain('CREATIVE BRIEF / SHARED UPSTREAM STORY:')
    expect(prompt).toContain('A woman stays left and a man stays right.')
    expect(prompt).toContain('GLOBAL WORLD STATE:')
    expect(prompt).toContain('Use the creative brief as the single source of truth')
    expect(prompt).toContain('CHARACTER STATE:')
    expect(prompt).toContain('Character A is the protagonist described in the creative brief.')
    expect(prompt).toContain('CAMERA / CONTINUITY:')
    expect(prompt).toContain('- Do not change the protagonist identity, age, clothing logic, or emotional state abruptly.')
    expect(prompt).toContain('REFERENCE CONDITIONING:')
    expect(prompt).toContain('Use the previous panel as continuity reference.')
    expect(prompt).toContain('NEGATIVE CONSTRAINTS:')
    expect(prompt).toContain('- No camera crossing the axis.')
  })

  it('builds a single-image storyboard shot-card overview prompt', () => {
    const prompt = buildStoryboardBatchPanelPrompt({
      schemeId: 'shot-card-board',
      storyText: 'A woman stays left and a man stays right.',
      seed,
      allSeeds: [seed],
      locale: 'en',
    })

    expect(prompt).toContain('Create one single cinematic storyboard overview image inspired by a professional film previsualization sheet.')
    expect(prompt).toContain('This one image must contain all storyboard panels and production information')
    expect(prompt).toContain('BOARD FORMAT:')
    expect(prompt).toContain('- Warm off-white production-board background.')
    expect(prompt).toContain('- A grid of compact storyboard cards, one card per panel.')
    expect(prompt).toContain('COMPLETE STORYBOARD BOARD:')
    expect(prompt).toContain('Anchor panel for task routing: Panel 03.')
    expect(prompt).toContain('Panel 03 | timecode 00:06 - 00:09 | shot wide two-shot')
    expect(prompt).toContain('Creative brief: A woman stays left and a man stays right.')
    expect(prompt).toContain('CONTINUITY RULES:')
    expect(prompt).toContain('- Keep the protagonist, hometown environment, clothing continuity, season, and emotional tone from the creative brief.')
  })

  it('builds first-panel image-reference instructions plus top-down A/B/C blocking', () => {
    const prompt = buildStoryboardBatchPanelPrompt({
      schemeId: 'first-panel-img2img',
      storyText: '女左男右，不能越轴。',
      seed,
      locale: 'zh',
    })

    expect(prompt).toContain('Use panel 01 as the only source-panel image reference.')
    expect(prompt).toContain('Creative brief: 女左男右，不能越轴。')
    expect(prompt).toContain('俯视平面图 + A/B/C 人物编号 + master shot + ControlNet/参考图 + 不越轴。')
    expect(prompt).toContain('A: position=(2.1,1.5), direction=180°, screen-left')
    expect(prompt).toContain('B: position=(4.7,1.8), direction=90°, screen-right')
    expect(prompt).toContain('Camera:')
    expect(prompt).toContain('position=(1.2,5.4)')
    expect(prompt).toContain('lens=50mm')
    expect(prompt).toContain('No-axis rule: keep the same camera side and never mirror, swap, or cross the character line.')
  })
})
