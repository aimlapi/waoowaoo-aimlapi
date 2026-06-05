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
    expect(prompt).toContain('GLOBAL WORLD STATE:')
    expect(prompt).toContain('Scene ID: family_dinner_01')
    expect(prompt).toContain('- Door: back-right side of the room.')
    expect(prompt).toContain('Character A:')
    expect(prompt).toContain('- Screen rule: must always appear on the left side of the frame when A and B are both visible.')
    expect(prompt).toContain('CAMERA AXIS / CONTINUITY:')
    expect(prompt).toContain('- Do not swap Character A and Character B.')
    expect(prompt).toContain('REFERENCE CONDITIONING:')
    expect(prompt).toContain('Use the previous panel as continuity reference.')
    expect(prompt).toContain('NEGATIVE CONSTRAINTS:')
    expect(prompt).toContain('- No camera crossing the axis.')
  })

  it('builds a storyboard shot-card board format prompt', () => {
    const prompt = buildStoryboardBatchPanelPrompt({
      schemeId: 'shot-card-board',
      storyText: 'A woman stays left and a man stays right.',
      seed,
      locale: 'en',
    })

    expect(prompt).toContain('Create a cinematic storyboard shot-card board inspired by a professional film previsualization sheet.')
    expect(prompt).toContain('BOARD FORMAT:')
    expect(prompt).toContain('- Warm off-white production-board background.')
    expect(prompt).toContain('- The card contains two horizontal cinematic thumbnails: first frame on the left, next frame on the right.')
    expect(prompt).toContain('SCENE CARD:')
    expect(prompt).toContain('Scene 03')
    expect(prompt).toContain('CONTINUITY RULES:')
    expect(prompt).toContain('- Character A is female in a blue sweater and must remain screen-left.')
  })

  it('builds first-panel image-reference instructions plus top-down A/B/C blocking', () => {
    const prompt = buildStoryboardBatchPanelPrompt({
      schemeId: 'first-panel-img2img',
      storyText: '女左男右，不能越轴。',
      seed,
      locale: 'zh',
    })

    expect(prompt).toContain('Use panel 01 as the only source-panel image reference.')
    expect(prompt).toContain('俯视平面图 + A/B/C 人物编号 + master shot + ControlNet/参考图 + 不越轴。')
    expect(prompt).toContain('A: position=(2.1,1.5), direction=180°, screen-left')
    expect(prompt).toContain('B: position=(4.7,1.8), direction=90°, screen-right')
    expect(prompt).toContain('Camera:')
    expect(prompt).toContain('position=(1.2,5.4)')
    expect(prompt).toContain('lens=50mm')
    expect(prompt).toContain('No-axis rule: keep the same camera side and never mirror, swap, or cross the character line.')
  })
})
