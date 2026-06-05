import { describe, expect, it } from 'vitest'
import {
  buildPanelVisualDirectorPrompt,
  type PanelPromptContext,
} from '@/lib/workers/handlers/panel-image-prompt-context'

function basePromptContext(overrides: Partial<PanelPromptContext['panel']>): PanelPromptContext {
  return {
    panel: {
      panel_id: 'panel-1',
      shot_type: '平视中景',
      camera_move: '轻轻跟随',
      description: '中景：林晏从画面左侧走到周岑身边，在他左侧隔着半步停住，两人都面向墙上画作',
      image_prompt: '',
      video_prompt: '中年女子从画面左侧慢慢走到中年男子身边，在他左侧隔着半步停住，两人都面向墙上画作',
      location: '美术馆展厅',
      characters: [
        {
          characterId: 'character-lin',
          name: '林晏',
          appearanceId: 'appearance-lin',
          appearanceIndex: 0,
          appearance: '选角定妆',
          slot: '美术馆展厅画作前偏左位置，面向画作站定',
        },
        {
          characterId: 'character-zhou',
          name: '周岑',
          appearanceId: 'appearance-zhou',
          appearanceIndex: 0,
          appearance: '选角定妆',
          slot: '美术馆展厅画作前偏右位置，面向画作站定',
        },
      ],
      source_text: '林晏走到他身边，和他隔着半步，也停住。',
      photography_rules: null,
      shot_blocking: null,
      acting_notes: null,
      ...overrides,
    },
    context: {
      character_appearances: [],
      location_reference: {
        name: '美术馆展厅',
        description: '白盒子美术馆展厅，左侧白墙挂着室内画，右后方有门洞。',
        spatial_profile: null,
      },
      scene_continuity_state: {
        scene_anchor_name: '美术馆展厅',
        inference_source: 'same_storyboard_same_location',
        featured_characters: [],
        present_characters: [],
        non_featured_presence_policy: {
          required: false,
          allowed_visibility: ['edge', 'partial_body', 'hands', 'shoulder', 'back', 'reflection', 'silhouette', 'distant_blur'],
          offscreen_allowed: false,
        },
        environment_or_insert_policy: {
          maintain_present_characters: true,
          allow_subject_focus_without_character_removal: true,
        },
        scene_props: '',
        previous_same_scene_panel: {
          panel_number: 2,
          shot_type: '平视中景',
          description: '中景：周岑独自站在画作前偏右位置，面向画作',
          characters: ['周岑'],
          props: '',
        },
        screen_position_locks: [
          {
            name: '林晏',
            characterId: 'character-lin',
            appearanceId: 'appearance-lin',
            appearance: '选角定妆',
            position: 'left',
            positionLabel: '画面左侧',
            forbiddenPositionLabel: '画面右侧',
            slot: '美术馆展厅画作前偏左位置，面向画作站定',
            sourcePanelNumbers: [3],
          },
          {
            name: '周岑',
            characterId: 'character-zhou',
            appearanceId: 'appearance-zhou',
            appearance: '选角定妆',
            position: 'right',
            positionLabel: '画面右侧',
            forbiddenPositionLabel: '画面左侧',
            slot: '美术馆展厅画作前偏右位置，面向画作站定',
            sourcePanelNumbers: [3],
          },
        ],
        next_same_scene_panel: null,
      },
      reference_images: [],
      additional_reference_images: [],
    },
  }
}

function renderPrompt(context: PanelPromptContext): string {
  return buildPanelVisualDirectorPrompt({
    promptContext: context,
    aspectRatio: '16:9',
    sourceText: context.panel.source_text,
    styleText: '侯麦式自然主义写实电影感，低饱和冷白美术馆空间。',
  })
}

describe('panel image prompt context final-frame execution layer', () => {
  it('locks screen coordinates and prevents swapping side-by-side gallery characters', () => {
    const prompt = renderPrompt(basePromptContext({}))

    expect(prompt).toContain('【当前镜头执行层 - 最高优先级】')
    expect(prompt).toContain('slot 中的“左/右/中央/边缘”一律理解为观众最终看到的画面左侧/画面右侧/画面中央/画面边缘')
    expect(prompt).toContain('林晏：必须画在画面左侧，按最终画面坐标执行 slot「美术馆展厅画作前偏左位置，面向画作站定」；禁止把 林晏 画到画面右侧')
    expect(prompt).toContain('周岑：必须画在画面右侧，按最终画面坐标执行 slot「美术馆展厅画作前偏右位置，面向画作站定」；禁止把 周岑 画到画面左侧')
    expect(prompt).toContain('禁止互换角色 screen-left / screen-right 关系')
    expect(prompt).toContain('不要把人物左右互换，不要把并排关系改成面对面对峙')
    expect(prompt).toContain('【最终站位覆盖 - 最高优先级，必须按观众看到的画面执行】')
    expect(prompt).toContain('林晏 最终必须位于画面左侧')
    expect(prompt).toContain('周岑 最终必须位于画面右侧')
    expect(prompt).toContain('【俯视平面图 + A/B/C 人物编号 + Master Shot + 参考图控制 + 不越轴】')
    expect(prompt).toContain('A=林晏')
    expect(prompt).toContain('B=周岑')
    expect(prompt).toContain('人物编号只供生成理解，不要把字母画进图像')
    expect(prompt).toContain('人物屏幕顺序固定为：A/林晏=画面左侧；B/周岑=画面右侧')
    expect(prompt).toContain('Master shot 约束')
    expect(prompt).toContain('不越轴约束')
    expect(prompt).toContain('ControlNet/参考图约束')
    expect(prompt).toContain('不得把女性/男性的位置互换')
    expect(prompt.lastIndexOf('【最终站位覆盖')).toBeGreaterThan(prompt.lastIndexOf('动态意图转为单帧定格'))
    expect(prompt).not.toContain('禁止让人物正面肖像抢走画面中心')
  })

  it('keeps an object gaze target visible instead of converting close shot into a character portrait', () => {
    const prompt = renderPrompt(basePromptContext({
      shot_type: '平视近景',
      camera_move: '缓缓推近',
      description: '近景：周岑没有离开画前，视线落在画里的空椅子位置，缓慢开口',
      video_prompt: '中年男子没有离开画前，视线落在画里的空椅子位置，喉结轻轻起伏后缓慢开口',
      source_text: '我妻子以前看展，老先找画里的椅子。',
      characters: [
        {
          characterId: 'character-zhou',
          name: '周岑',
          appearanceId: 'appearance-zhou',
          appearanceIndex: 0,
          appearance: '选角定妆',
          slot: '美术馆展厅画作前右侧，面向画作略偏向林晏',
        },
      ],
    }))

    expect(prompt).toContain('视觉主体/视线目标：画里的空椅子')
    expect(prompt).toContain('它必须在画面中可见并承担叙事重点')
    expect(prompt).toContain('近景不等于人物正面肖像')
    expect(prompt).toContain('允许用越肩、侧影、局部身体或虚化人物来突出目标物')
    expect(prompt).toContain('禁止让人物正面肖像抢走画面中心')
    expect(prompt).toContain('禁止把道具、画中对象或视线目标画得不可辨认')
  })
})
