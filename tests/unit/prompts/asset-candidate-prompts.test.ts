import { describe, expect, it } from 'vitest'
import {
  buildCharacterCandidatePromptInstruction,
  parseCharacterCandidatePrompts,
} from '@/lib/asset-generation/character-candidate-prompts'
import {
  LOCATION_SCENE_BOARD_VIEW_COUNT,
  appendLocationSceneBoardViewRule,
  buildLocationSceneBoardView,
  parseLocationSceneBoardPrompt,
  resolveLocationSceneBoardView,
} from '@/lib/asset-generation/location-scene-board-prompts'

describe('asset candidate prompt builders', () => {
  it('builds one character instruction that asks for exactly three candidate prompts', () => {
    const instruction = buildCharacterCandidatePromptInstruction({
      description: '三十岁武僧，准备离开山寺。',
      locale: 'zh',
      styleBible: null,
    })

    expect(instruction).toContain('同一个角色')
    expect(instruction).toContain('三条不同的最终图片生成提示词')
    expect(instruction).toContain('给生图模型保留合理发挥空间')
    expect(instruction).toContain('只输出 JSON')
    expect(parseCharacterCandidatePrompts({
      prompts: ['身份轮廓版', '服装材质版', '分镜可用性版'],
    })).toEqual(['身份轮廓版', '服装材质版', '分镜可用性版'])
  })

  it('builds one 720-degree panorama location prompt with fixed spatial semantics', () => {
    const views = Array.from({ length: LOCATION_SCENE_BOARD_VIEW_COUNT }, (_value, imageIndex) => (
      buildLocationSceneBoardView({
        description: '午夜办公室只剩一排工位亮着，角落传来已故同事的键盘声。',
        locale: 'zh',
        styleBible: null,
        imageIndex,
        layoutPlan: '前方是玻璃门，后方是吧台，左侧是卡座，右侧是操作台。',
      })
    ))

    expect(views.map((view) => view.id)).toEqual(['panorama-720'])
    expect(views.every((view) => view.aspectRatio === '16:9')).toBe(true)
    expect(views[0]?.draftInstruction).toContain('720度全景空间图')
    expect(views[0]?.draftInstruction).toContain('连续 360 度展开环视')
    expect(views[0]?.draftInstruction).not.toContain('四宫格空间板')
    const finalPrompt = appendLocationSceneBoardViewRule({
      prompt: '旧办公室空场景',
      locale: 'zh',
      imageIndex: 0,
      layoutPlan: '前方是玻璃门，后方是吧台，左侧是卡座，右侧是操作台。',
    })
    expect(finalPrompt).toContain('720 度全景空间图')
    expect(finalPrompt).toContain('16:9 横版')
    expect(finalPrompt).toContain('两到三条横向全景带')
    expect(finalPrompt).toContain('不得生成 2x2 网格')
    expect(finalPrompt).not.toContain('左上=前，右上=后，左下=左，右下=右')
    expect(parseLocationSceneBoardPrompt({ prompt: '最终场景 prompt' })).toBe('最终场景 prompt')
  })

  it('rejects unknown location scene-board view indexes instead of silently recycling views', () => {
    expect(() => resolveLocationSceneBoardView(LOCATION_SCENE_BOARD_VIEW_COUNT)).toThrow(
      'LOCATION_SCENE_BOARD_VIEW_NOT_FOUND:1',
    )
  })
})
