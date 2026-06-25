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

  it('builds five 4:3 location scene-board views with fixed spatial semantics', () => {
    const views = Array.from({ length: LOCATION_SCENE_BOARD_VIEW_COUNT }, (_value, imageIndex) => (
      buildLocationSceneBoardView({
        description: '午夜办公室只剩一排工位亮着，角落传来已故同事的键盘声。',
        locale: 'zh',
        styleBible: null,
        imageIndex,
      })
    ))

    expect(views.map((view) => view.id)).toEqual([
      'establishing',
      'front',
      'back',
      'left',
      'right',
    ])
    expect(views.every((view) => view.aspectRatio === '4:3')).toBe(true)
    expect(views[0]?.draftInstruction).toContain('主氛围图')
    expect(views[1]?.draftInstruction).toContain('前方覆盖视角')
    expect(views[2]?.draftInstruction).toContain('后方覆盖视角')
    expect(views[3]?.draftInstruction).toContain('左侧覆盖视角')
    expect(views[4]?.draftInstruction).toContain('右侧覆盖视角')
    expect(appendLocationSceneBoardViewRule({
      prompt: '旧办公室空场景',
      locale: 'zh',
      imageIndex: 3,
    })).toContain('左侧视角')
    expect(parseLocationSceneBoardPrompt({ prompt: '最终场景 prompt' })).toBe('最终场景 prompt')
  })

  it('rejects unknown location scene-board view indexes instead of silently recycling views', () => {
    expect(() => resolveLocationSceneBoardView(LOCATION_SCENE_BOARD_VIEW_COUNT)).toThrow(
      'LOCATION_SCENE_BOARD_VIEW_NOT_FOUND:5',
    )
  })
})
