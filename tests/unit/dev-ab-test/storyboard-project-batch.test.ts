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
  it('keeps baseline panel prompt free of explicit screen-lock blocking rules', () => {
    const prompt = buildStoryboardBatchPanelPrompt({
      schemeId: 'baseline',
      storyText: 'A woman stays left and a man stays right.',
      seed,
      locale: 'en',
    })

    expect(prompt).toContain('Story source: A woman stays left and a man stays right.')
    expect(prompt).not.toContain('Screen position continuity:')
    expect(prompt).not.toContain('俯视平面图')
    expect(prompt).not.toContain('No-axis rule:')
  })

  it('adds no-swap screen-side constraints for the screen-lock scheme', () => {
    const prompt = buildStoryboardBatchPanelPrompt({
      schemeId: 'screen-lock',
      storyText: 'A woman stays left and a man stays right.',
      seed,
      locale: 'en',
    })

    expect(prompt).toContain('Screen position continuity:')
    expect(prompt).toContain('A must remain screen-left; do not swap screen sides.')
    expect(prompt).toContain('B must remain screen-right; do not swap screen sides.')
    expect(prompt).toContain('Do not mirror the composition.')
  })

  it('adds top-down A/B/C blocking, master shot, reference, and no-axis rules for position testing', () => {
    const prompt = buildStoryboardBatchPanelPrompt({
      schemeId: 'top-down-abc',
      storyText: '女左男右，不能越轴。',
      seed,
      locale: 'zh',
    })

    expect(prompt).toContain('俯视平面图 + A/B/C 人物编号 + master shot + ControlNet/参考图 + 不越轴。')
    expect(prompt).toContain('A: position=(2.1,1.5), direction=180°, screen-left')
    expect(prompt).toContain('B: position=(4.7,1.8), direction=90°, screen-right')
    expect(prompt).toContain('Camera:')
    expect(prompt).toContain('position=(1.2,5.4)')
    expect(prompt).toContain('lens=50mm')
    expect(prompt).toContain('No-axis rule: keep the same camera side and never mirror, swap, or cross the character line.')
  })
})
