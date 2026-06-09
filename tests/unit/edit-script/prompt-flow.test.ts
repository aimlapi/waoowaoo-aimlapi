import { describe, expect, it } from 'vitest'
import { AI_PROMPT_IDS, buildAiPrompt } from '@/lib/ai-prompts'

describe('edit script block-first prompt flow', () => {
  it('keeps edit prompts free of text-only style sources before visual references', () => {
    const screenplayText = [
      '标题：《灯下的人》',
      '',
      '故事梗概：人物进入房间，顺着光线发现桌上的旧物。',
      '',
      '场景 1｜内景. 房间 - 夜晚',
      '',
      '动作：人物走入昏暗房间，沿着窗边的光线慢慢前行，在桌前停下。',
    ].join('\n')

    const storyDevelopmentPrompt = buildAiPrompt({
      promptId: AI_PROMPT_IDS.EDIT_SCRIPT_STORY_DEVELOPMENT,
      locale: 'zh',
      variables: {
        user_request: '一个过气童星靠短视频博流量，童年作品突然翻红',
        duration_seconds: '60',
        aspect_ratio: '16:9',
      },
    })

    expect(storyDevelopmentPrompt).toContain('Story Development Layer')
    expect(storyDevelopmentPrompt).toContain('禁止从 Premise 直接生成故事大纲或剧本')
    expect(storyDevelopmentPrompt).toContain('Protagonist Analysis -> Theme Engine -> Antagonist System')
    expect(storyDevelopmentPrompt).toContain('"schemaVersion": 2')
    expect(storyDevelopmentPrompt).toContain('"themeEngine"')
    expect(storyDevelopmentPrompt).toContain('"antagonistSystem"')
    expect(storyDevelopmentPrompt).toContain('"pressureLadder"')
    expect(storyDevelopmentPrompt).toContain('"hardChoices"')
    expect(storyDevelopmentPrompt).toContain('goal -> pressure -> choice -> cost -> newValueState')

    const screenplayPrompt = buildAiPrompt({
      promptId: AI_PROMPT_IDS.EDIT_SCRIPT_SCREENPLAY,
      locale: 'zh',
      variables: {
        user_request: '生成一条连续短片',
        story_development_json: JSON.stringify({
          protagonist: { name: '人物', want: '寻找旧物', need: '面对失去' },
          storyExpansion: { majorTurn: '发现旧物来自被回避的关系' },
        }),
        duration_seconds: '8',
        aspect_ratio: '9:16',
      },
    })

    expect(screenplayPrompt).toContain('Story Development Package')
    expect(screenplayPrompt).toContain('禁止直接根据用户原始需求另起故事')
    expect(screenplayPrompt).toContain('AI 可控短片剧本')
    expect(screenplayPrompt).toContain('后续角色、场景、道具、风格案例和分镜生成')
    expect(screenplayPrompt).toContain('这里只写剧情内容')
    expect(screenplayPrompt).toContain('不要出现“镜头”“特写”“推镜”“剪切”“CUT TO”')
    expect(screenplayPrompt).not.toContain('Style Bible')
    expect(screenplayPrompt).not.toContain('柔和自然光，低对比度，轻微柔焦')

    const primaryPrompt = buildAiPrompt({
      promptId: AI_PROMPT_IDS.EDIT_SCRIPT_PRIMARY,
      locale: 'zh',
      variables: {
        user_request: '生成一条连续短片',
        screenplay_text: screenplayText,
        duration_seconds: '8',
        aspect_ratio: '9:16',
      },
    })

    expect(primaryPrompt).toContain('统一剪辑结构表 Agent')
    expect(primaryPrompt).toContain('本阶段不生成画风、不选择媒介、不写全局色彩/材质/滤镜规则')
    expect(primaryPrompt).toContain('videoBlocks 是视频生成主结构')
    expect(primaryPrompt).toContain('本阶段只生成结构、动作、摄影、声音和片段编排')
    expect(primaryPrompt).toContain('shots[].videoPrompt 和 videoBlocks[].prompt 会在资产提取与资产描述完成后由下一阶段生成')
    expect(primaryPrompt).toContain('15 秒是最高优先级硬上限')
    expect(primaryPrompt).toContain('禁止为了“稳定”而默认每 2 个 shot 切一个 group')
    expect(primaryPrompt).not.toContain('timeline_json')
    expect(primaryPrompt).not.toContain('visual_action_json')
    expect(primaryPrompt).not.toContain('2x2')
    expect(primaryPrompt).not.toContain('宫格')
    expect(primaryPrompt).not.toContain('Style Bible')
    expect(primaryPrompt).not.toContain('style_bible_json')

    const assetExtractPrompt = buildAiPrompt({
      promptId: AI_PROMPT_IDS.EDIT_SCRIPT_ASSET_EXTRACT,
      locale: 'zh',
      variables: {
        edit_script_json: JSON.stringify({ shots: [], videoBlocks: [] }),
      },
    })

    expect(assetExtractPrompt).toContain('角色资产必须同时生成非空 voiceTimbreText')
    expect(assetExtractPrompt).toContain('即使角色在当前剪辑表中没有对白、旁白或画外音，也必须')
    expect(assetExtractPrompt).toContain('character 必须输出非空 voiceTimbreText；location 禁止输出 voiceTimbreText')
    expect(assetExtractPrompt).toContain('禁止因为当前角色无台词而省略、置空、写 null')

    const videoPromptBlock = buildAiPrompt({
      promptId: AI_PROMPT_IDS.EDIT_SCRIPT_VIDEO_PROMPT_BLOCK,
      locale: 'zh',
      variables: {
        user_request: '生成一条连续短片，要安静克制',
        screenplay_text: screenplayText,
        video_block_json: JSON.stringify({ sourceVideoBlockIndex: 0, shotNumbers: [1] }),
        block_shots_json: JSON.stringify([{ shotNumber: 1 }]),
        asset_context_json: JSON.stringify({ assets: [] }),
        adjacent_blocks_json: JSON.stringify({ previous: null, next: null }),
        aspect_ratio: '9:16',
      },
    })

    expect(videoPromptBlock).toContain('风格案例图会在后续图像和视频生成时作为唯一风格源追加')
    expect(videoPromptBlock).not.toContain('rawUserStyle')
    expect(videoPromptBlock).not.toContain('styleBible')
    expect(videoPromptBlock).not.toContain('style_bible_json')
    expect(videoPromptBlock).toContain('固定音色必须逐字使用资产字段')
    expect(videoPromptBlock).not.toContain('videoPromptBible')

    const panelFinalPromptBlock = buildAiPrompt({
      promptId: AI_PROMPT_IDS.EDIT_SCRIPT_STORYBOARD_PANEL_FINAL_PROMPT_BLOCK,
      locale: 'zh',
      variables: {
        source_snapshot_json: JSON.stringify({ shots: [], videoBlocks: [] }),
        visual_reference_camera_policy_json: JSON.stringify({ imageFilterPrompt: '柔和自然光，低对比度' }),
        spatial_profile_strategy_output_json: JSON.stringify({ strategy: 'spatial_text_blocking', locations: [] }),
        video_block_json: JSON.stringify({ sourceVideoBlockId: 'block-1' }),
        block_shots_json: JSON.stringify([{ shotNumber: 1 }]),
        adjacent_blocks_json: JSON.stringify({ previous: null, next: null }),
        panel_contract_json: JSON.stringify([{ panelIndex: 0, sourceShotNumber: 1 }]),
      },
    })

    expect(panelFinalPromptBlock).toContain('videoBlock 最终分镜图片提示词生成器')
    expect(panelFinalPromptBlock).toContain('核心产物是每个 panel 的 finalPanelPrompt')
    expect(panelFinalPromptBlock).toContain('visual_reference_camera_policy_json 是从选中风格案例图派生出的视觉参考镜头策略')
    expect(panelFinalPromptBlock).toContain('风格只能影响画面表达方式')
    expect(panelFinalPromptBlock).toContain('严禁因为风格添加原 shot、videoPrompt、资产图或空间档案里没有的人物、道具、建筑、天气、时代元素、服装、符号或剧情动作')
    expect(panelFinalPromptBlock).toContain('不要只在末尾堆成“风格：……”')
    expect(panelFinalPromptBlock).toContain('完整输出示例仅用于学习字段完整度和通用风格融合写法')
    expect(panelFinalPromptBlock).toContain('人物A / 人物B / 当前场景 / 主要锚点 / 空间层次')
    expect(panelFinalPromptBlock).toContain('"shotScale": "中景"')
    expect(panelFinalPromptBlock).toContain('"shotScale": "近景"')
    expect(panelFinalPromptBlock).toContain('"shotScale": "全景"')
    expect(panelFinalPromptBlock).toContain('禁止空字符串、泛泛的“string”、泛泛的“同上”')
    expect(panelFinalPromptBlock).toContain('panelFinalPromptBlockOutput')
    expect(panelFinalPromptBlock).not.toContain('panelVisualPlanBlockOutput')
    expect(panelFinalPromptBlock).not.toContain('cameraPlanBlockOutput')

    const englishPrimaryPrompt = buildAiPrompt({
      promptId: AI_PROMPT_IDS.EDIT_SCRIPT_PRIMARY,
      locale: 'en',
      variables: {
        user_request: 'Create a continuous short film',
        screenplay_text: screenplayText,
        duration_seconds: '8',
        aspect_ratio: '9:16',
      },
    })

    expect(englishPrimaryPrompt).toContain('This stage must not generate rendering style')
    expect(englishPrimaryPrompt).toContain('15-second limit is the highest-priority hard ceiling')
    expect(englishPrimaryPrompt).toContain('Do not mechanically split them into multiple 2-shot groups')
    expect(englishPrimaryPrompt).not.toContain('Style Bible')
  })
})
