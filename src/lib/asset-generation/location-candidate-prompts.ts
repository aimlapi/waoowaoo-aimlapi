import type { Locale } from '@/i18n/routing'
import { AI_PROMPT_IDS, buildAiPrompt } from '@/lib/ai-prompts'
import type { EditScriptStyleBible } from '@/lib/edit-script/types'
import { renderStyleBiblePromptBlock } from '@/lib/edit-script/style-bible-prompt'

export type LocationCandidateStrategyId =
  | 'current_baseline'
  | 'narrative_core_set'
  | 'production_texture_set'

export const LOCATION_CANDIDATE_PROMPT_COUNT = 3

export interface LocationCandidateStrategy {
  readonly id: LocationCandidateStrategyId
  readonly label: string
  readonly draftInstruction: string
}

function normalizeText(value: string): string {
  return value.trim().replace(/\s+/g, ' ')
}

function joinLines(lines: ReadonlyArray<string | null>): string {
  return lines
    .map((line) => line?.trim() || '')
    .filter((line) => line.length > 0)
    .join('\n')
}

function outputRule(locale: Locale): string {
  if (locale === 'en') {
    return joinLines([
      'Output JSON only: {"prompt":"final image-generation prompt"}.',
      'The prompt value must be the final image prompt only. It must not include analysis notes, strategy names, hidden reasoning, the original full input, or instructions to choose a scene.',
      'The final image prompt must describe one reusable location identity through visible space, fixed structure, built-in elements, lighting, color, material, atmosphere, and stable structural anchors.',
      'Do not add any person, crowd, loose furniture, or prop presented as an independent asset subject. Fixed structures and built-in elements that constitute the location remain allowed.',
      'Do not prescribe aspect ratio, camera layout, subject count, or an alternate asset format. The execution policy applies the fixed location-asset format.',
    ])
  }

  return joinLines([
    '只输出 JSON：{"prompt":"最终图片生成提示词"}。',
    'prompt 字段必须只包含最终图片提示词，不得包含分析说明、策略名称、隐藏推理、完整原始输入或“选择场景”这类任务指令。',
    '最终 prompt 必须通过可见空间、固定结构、内建要素、灯光、色彩、材质、空气感和稳定结构锚点描述一个可复用场景身份。',
    '不加入任何人物、人群、松散家具或作为独立资产主体的道具；构成场景本身的固定结构与内建要素可以保留。',
    '不要自定画幅、机位版式、主体数量或另一套资产格式；固定场景资产图格式由执行 policy 统一追加。',
  ])
}

function sharedContext(input: { readonly description: string; readonly locale: Locale }): string[] {
  const description = normalizeText(input.description)
  if (input.locale === 'en') {
    return [
      `Scene source input: ${description}`,
      'Infer scene identity, story phase, implied genre, emotional direction, reusable video-reference needs, and visible production-design requirements only from this input plus any style block appended later by the system.',
      'Choose the most useful single scene asset for later full-reference video generation; do not merely repeat the first mentioned location if another visible space better carries the story.',
    ]
  }
  return [
    `场景来源输入：${description}`,
    '只能从这个输入以及系统稍后追加的风格块中推断场景身份、故事阶段、隐含类型、情绪走向、后续分镜复用需求和可见美术造景要求。',
    '要选择最适合后续分镜继承的单一场景资产，不要只是机械复述第一个被提到的地点。',
  ]
}

function styleBibleContext(input: {
  readonly locale: Locale
  readonly styleBible: EditScriptStyleBible | null
}): string | null {
  if (!input.styleBible) return null
  const block = renderStyleBiblePromptBlock({
    styleBible: input.styleBible,
    usage: 'assetImage',
    locale: input.locale,
  })
  return input.locale === 'en'
    ? `Project Style Bible:\n${block}`
    : `项目 Style Bible：\n${block}`
}

function buildCurrentBaseline(input: {
  readonly description: string
  readonly locale: Locale
  readonly styleBible: EditScriptStyleBible | null
}): LocationCandidateStrategy {
  const baseInstruction = buildAiPrompt({
    promptId: AI_PROMPT_IDS.LOCATION_CREATE,
    locale: input.locale,
    variables: {
      user_input: input.description,
    },
  })
  const draftInstruction = joinLines([
    baseInstruction,
    styleBibleContext(input),
    input.locale === 'en'
      ? 'Convert the result into a final reusable scene asset prompt.'
      : '请把结果转换成一条最终可复用场景资产图片提示词。',
    outputRule(input.locale),
  ])
  return {
    id: 'current_baseline',
    label: input.locale === 'en' ? 'Current baseline' : '当前基准',
    draftInstruction,
  }
}

function buildNarrativeCore(input: {
  readonly description: string
  readonly locale: Locale
  readonly styleBible: EditScriptStyleBible | null
}): LocationCandidateStrategy {
  const draftInstruction = input.locale === 'en'
    ? joinLines([
      'You are a film production designer and story-aware location designer. Convert the scene source input into one final image-generation prompt.',
      ...sharedContext(input),
      styleBibleContext(input),
      'Strategy: choose the location that best carries the story conflict, reveal, reversal, recurring dramatic pressure, or emotional turn. Make that choice visible through set design, not explanatory text.',
      'Use production design: architecture, negative space, fixed structural rhythm, motivated lighting, color contrast, material age, and atmosphere should imply the story tension.',
      'General example of the expected reasoning-to-prompt style, do not copy the subject: if a story calls for an oppressive underground archive, express it through low concrete vaults, deep structural bays, a built-in security door, aging wall surfaces, and a distant integrated indicator light rather than loose objects.',
      outputRule(input.locale),
    ])
    : joinLines([
      '你是电影美术指导和故事导向的选景设计师。请把场景来源输入转换成一条最终图片生成提示词。',
      ...sharedContext(input),
      styleBibleContext(input),
      '策略：选择最能承载故事冲突、揭示、反转、反复戏剧压力或情绪转折的地点。最终 prompt 要通过造景本身体现这个选择，不要写解释文字。',
      '使用电影美术造景思维：建筑结构、负空间、固定结构节奏、灯光动机、色彩对比、材质新旧和空气氛围都要暗示故事张力。',
      '泛化示例，只学习方式不要复制题材：需要压迫感的地下档案空间时，通过低矮混凝土拱顶、纵深结构柱列、内建防护门、老化墙面和深处一处嵌入式指示灯表达，而不是加入松散物件。',
      outputRule(input.locale),
    ])
  return {
    id: 'narrative_core_set',
    label: input.locale === 'en' ? 'Narrative core set' : '叙事核心造景',
    draftInstruction,
  }
}

function buildProductionTexture(input: {
  readonly description: string
  readonly locale: Locale
  readonly styleBible: EditScriptStyleBible | null
}): LocationCandidateStrategy {
  const draftInstruction = input.locale === 'en'
    ? joinLines([
      'You are a senior film art director specializing in set detail, texture, atmosphere, and production-design quality. Convert the scene source input into one final image-generation prompt.',
      ...sharedContext(input),
      styleBibleContext(input),
      'Strategy: prioritize concrete architectural texture. Infer era, genre, class texture, emotional temperature, and visual subtext, then translate them into spatial structure, built-in elements, surface materials, use traces, practical light sources, palette, haze, reflections, and shadow design.',
      'The prompt must be detailed enough that every important structural element has a purpose. It should feel designed like a film set, not a generic location description, without adding people or independent prop dressing.',
      'General example of the expected art-direction density, do not copy the subject: for a clean near-future spacecraft, describe white composite wall panels, a seamless luminous ceiling, polished pale-gray floor, rounded built-in doorways, thin integrated status lights, and hidden ventilation seams.',
      outputRule(input.locale),
    ])
    : joinLines([
      '你是擅长景物细节、质感、氛围和美术完成度的资深电影美术指导。请把场景来源输入转换成一条最终图片生成提示词。',
      ...sharedContext(input),
      styleBibleContext(input),
      '策略：优先追求具体可见的建筑质感。根据输入推断年代、类型、阶层质感、情绪温度和视觉潜台词，再转译成空间结构、内建要素、表面材质、使用痕迹、实景光源、色彩、雾气／反光和阴影设计。',
      'prompt 必须细到每个重要结构都有作用，像经过电影美术设计的专属场景，而不是泛泛的地点描述；不能加入人物或独立道具陈设。',
      '泛化示例，只学习美术密度不要复制题材：如果是洁净近未来飞船，应写白色复合墙板、无缝发光天花、抛光浅灰地面、圆角内建舱门、细蓝白嵌入式状态灯和隐藏通风缝。',
      outputRule(input.locale),
    ])
  return {
    id: 'production_texture_set',
    label: input.locale === 'en' ? 'Production texture set' : '电影美术质感造景',
    draftInstruction,
  }
}

export function buildLocationCandidateStrategies(input: {
  readonly description: string
  readonly locale: Locale
  readonly styleBible: EditScriptStyleBible | null
}): LocationCandidateStrategy[] {
  return [
    buildCurrentBaseline(input),
    buildNarrativeCore(input),
    buildProductionTexture(input),
  ]
}

export function parseLocationCandidatePrompt(parsed: Record<string, unknown>): string {
  const prompt = parsed.prompt
  if (typeof prompt !== 'string' || !prompt.trim()) {
    throw new Error('LOCATION_CANDIDATE_PROMPT_INVALID')
  }
  return prompt.trim()
}
