import type { Locale } from '@/i18n/routing'
import type { EditScriptStyleBible } from '@/lib/edit-script/types'
import { renderStyleBiblePromptBlock } from '@/lib/edit-script/style-bible-prompt'

export type LocationSceneBoardViewId =
  | 'panorama-720'

export const LOCATION_SCENE_BOARD_VIEW_COUNT = 1

export interface LocationSceneBoardView {
  readonly id: LocationSceneBoardViewId
  readonly label: string
  readonly aspectRatio: '16:9'
  readonly draftInstruction: string
}

export interface LocationSceneBoardLayoutPlan {
  readonly draftInstruction: string
}

interface LocationSceneBoardViewSpec {
  readonly id: LocationSceneBoardViewId
  readonly zhLabel: string
  readonly enLabel: string
  readonly zhCoverage: string
  readonly enCoverage: string
}

const LOCATION_SCENE_BOARD_VIEW_SPECS: readonly LocationSceneBoardViewSpec[] = [
  {
    id: 'panorama-720',
    zhLabel: '720度全景空间图',
    enLabel: '720-degree panoramic spatial map',
    zhCoverage: '生成同一个地点的一张 720 度全景场景空间图。画面必须是连续横向展开的空间参考，可用两到三条横向 360 度环视带组成，总覆盖约 720 度；每条全景带都必须继承同一套房间结构、门窗位置、家具锚点、材质、色彩和光源，不得像不同地点拼接。',
    enCoverage: 'Generate one 720-degree panoramic spatial map for the same physical set. The image must be a continuous horizontal unfolded space reference, using two or three horizontal 360-degree survey bands for roughly 720-degree coverage; every panorama band must inherit the same room structure, doors/windows, furniture anchors, materials, palette, and light sources rather than looking like stitched different locations.',
  },
]

function normalizeText(value: string): string {
  return value.trim().replace(/\s+/g, ' ')
}

function joinLines(lines: ReadonlyArray<string | null>): string {
  return lines
    .map((line) => line?.trim() || '')
    .filter((line) => line.length > 0)
    .join('\n')
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

function outputRule(locale: Locale): string {
  if (locale === 'en') {
    return joinLines([
      'Output JSON only: {"prompt":"final image-generation prompt"}.',
      'The prompt value must be the final image prompt only. It must not include analysis notes, hidden reasoning, strategy names, the original full input, or instructions to choose a location.',
      'The final prompt must describe exactly one empty reusable 720-degree panoramic scene reference image, not a 2x2 contact sheet and not a single cropped room view.',
      'Hard layout: one wide 16:9 canvas containing two or three clean horizontal panorama bands. Each band is a continuous 360-degree unfolded survey of the same set; together they provide roughly 720-degree spatial coverage.',
      'Use small unobtrusive degree marks only when helpful, such as 0°, 90°, 180°, 270°, 360°. Do not add panel labels, shot numbers, story text, or UI decorations.',
      'The image is invalid if it becomes a four-panel contact sheet, a square 2x2 grid, isolated unrelated room thumbnails, or an irregular collage.',
      'Do not include named main characters or narrative action beats. Temporary tiny background silhouettes are allowed only when necessary for scale, but the asset must remain an empty reusable location reference.',
    ])
  }

  return joinLines([
    '只输出 JSON：{"prompt":"最终图片生成提示词"}。',
    'prompt 字段必须只包含最终图片提示词，不得包含分析说明、隐藏推理、策略名称、完整原始输入或“选择地点”这类任务指令。',
    '最终 prompt 必须描述且只描述一张空的、可复用的 720 度全景场景空间图，不是 2x2 四宫格，也不是单一裁切房间视角。',
    '硬性版式：一张 16:9 横版画布，内部包含两到三条清晰横向全景带。每条全景带都是同一布景的连续 360 度展开环视，合计提供约 720 度空间覆盖。',
    '只在有帮助时使用小而不干扰的角度标记，例如 0°、90°、180°、270°、360°。不得添加 panel 标签、镜头编号、剧情文字或 UI 装饰。',
    '若画面变成四格 contact sheet、正方形 2x2 网格、互不相关的房间缩略图或不规则拼贴，视为失败。',
    '不要出现有名主角或叙事动作瞬间。只有在需要标尺时才允许极小的背景人影，但资产本质必须仍是可复用空场景参考。',
  ])
}

function layoutPlanOutputRule(locale: Locale): string {
  if (locale === 'en') {
    return joinLines([
      'Output JSON only: {"layoutPlan":"locked spatial layout plan"}.',
      'The layoutPlan must be a compact production-design spatial bible, not an image prompt.',
      'It must define the same physical set for every later camera angle: room shape, front/back/left/right walls, fixed doors/windows, ceiling/floor logic, furniture positions, landmark objects, lighting direction, and practical blocking zones.',
      'Do not write multiple alternative layouts. Do not include hidden reasoning.',
    ])
  }

  return joinLines([
    '只输出 JSON：{"layoutPlan":"锁定空间布局说明"}。',
    'layoutPlan 必须是一份紧凑的电影美术空间圣经，不是图片生成提示词。',
    '它必须为后续所有机位定义同一个真实布景：房间形状、前/后/左/右墙面、固定门窗、天花/地面逻辑、家具位置、标志性物体、光源方向和可调度人物区域。',
    '不要写多个备选布局。不要包含隐藏推理。',
  ])
}

function sharedContext(input: {
  readonly description: string
  readonly locale: Locale
}): string[] {
  const description = normalizeText(input.description)
  if (input.locale === 'en') {
    return [
      `Location source input: ${description}`,
      'Infer the location identity, story pressure, spatial anchors, production-design rules, era cues, material palette, lighting logic, and later storyboard needs from this input.',
      'This image belongs to a coherent 720-degree location panorama reference. Every panorama band must feel like the same physical set unfolded from a continuous camera survey.',
    ]
  }
  return [
    `场景来源输入：${description}`,
    '请从输入中推断地点身份、故事压力、空间锚点、美术规则、时代线索、材质色彩、灯光逻辑和后续分镜复用需求。',
    '这张图属于同一个地点的 720 度全景场景参考。每条全景带都必须像同一个真实布景被连续环视展开，而不是重新设计一个新地点。',
  ]
}

export function stripLocationSceneBoardSlotDescription(description: string): string {
  const markers = [
    '\n\n场景全景槽位：',
    '\n\nScene panorama slot:',
  ]
  for (const marker of markers) {
    const index = description.indexOf(marker)
    if (index >= 0) return description.slice(0, index).trim()
  }
  return description.trim()
}

export function resolveLocationSceneBoardView(imageIndex: number): LocationSceneBoardViewSpec {
  const view = LOCATION_SCENE_BOARD_VIEW_SPECS[imageIndex]
  if (!view) {
    throw new Error(`LOCATION_SCENE_BOARD_VIEW_NOT_FOUND:${imageIndex}`)
  }
  return view
}

export function buildLocationSceneBoardLayoutPlan(input: {
  readonly description: string
  readonly locale: Locale
  readonly styleBible: EditScriptStyleBible | null
}): LocationSceneBoardLayoutPlan {
  const draftInstruction = input.locale === 'en'
    ? joinLines([
      'You are a film production designer building the locked spatial plan for a same-location 720-degree panoramic reference asset.',
      ...sharedContext(input),
      styleBibleContext(input),
      'Create one internally consistent set layout that later panoramic reference prompts must inherit exactly.',
      'Use concrete spatial language: camera axes, wall names, fixed anchors, object positions, doorway/window placement, ceiling feature placement, floor zones, lighting direction, and usable blocking space.',
      layoutPlanOutputRule(input.locale),
    ])
    : joinLines([
      '你是电影美术指导，正在为同一地点的 720 度全景场景参考建立锁定空间布局。',
      ...sharedContext(input),
      styleBibleContext(input),
      '创建一套内部一致的布景空间关系，后续全景场景参考 prompt 必须严格继承这套关系。',
      '使用具体空间语言：机位轴线、墙面命名、固定锚点、物体位置、门窗位置、天花特征位置、地面分区、光源方向和可调度人物区域。',
      layoutPlanOutputRule(input.locale),
    ])

  return { draftInstruction }
}

export function buildLocationSceneBoardView(input: {
  readonly description: string
  readonly locale: Locale
  readonly styleBible: EditScriptStyleBible | null
  readonly imageIndex: number
  readonly layoutPlan: string
}): LocationSceneBoardView {
  const view = resolveLocationSceneBoardView(input.imageIndex)
  const draftInstruction = input.locale === 'en'
    ? joinLines([
      'You are a film production designer creating a coherent 720-degree panoramic location reference for later storyboards.',
      ...sharedContext(input),
      styleBibleContext(input),
      `Locked spatial layout plan:\n${input.layoutPlan}`,
      `Required spatial reference output: ${view.enLabel}.`,
      view.enCoverage,
      'Inside the single image, keep stable anchors across every panorama band: architecture, window/door positions, ceiling/floor logic, furniture families, color accents, material texture, and motivated light direction.',
      'Make the panorama useful for later shot planning, including clear foreground/midground/background zones and practical blocking space across the full room circumference.',
      outputRule(input.locale),
    ])
    : joinLines([
      '你是电影美术指导，正在为后续分镜创建同一地点的 720 度全景场景参考。',
      ...sharedContext(input),
      styleBibleContext(input),
      `锁定空间布局说明：\n${input.layoutPlan}`,
      `指定空间参考输出：${view.zhLabel}。`,
      view.zhCoverage,
      '必须在同一张图的每条全景带里保持稳定锚点：建筑结构、门窗位置、天花/地面逻辑、家具类型、色彩重心、材质纹理和有动机的光源方向。',
      '全景展开必须服务后续镜头规划，清楚呈现可绕行空间的前景/中景/背景关系，并保留可调度人物的实用空间。',
      outputRule(input.locale),
    ])

  return {
    id: view.id,
    label: input.locale === 'en' ? view.enLabel : view.zhLabel,
    aspectRatio: '16:9',
    draftInstruction,
  }
}

export function appendLocationSceneBoardViewRule(input: {
  readonly prompt: string
  readonly locale: Locale
  readonly imageIndex: number
  readonly layoutPlan: string
}): string {
  const view = resolveLocationSceneBoardView(input.imageIndex)
  const rule = input.locale === 'en'
    ? joinLines([
      'CRITICAL IMAGE FORMAT - MUST OBEY BEFORE ANY SCENE CONTENT:',
      'ONE FINAL IMAGE ONLY. The final image must be a wide 16:9 720-degree panoramic spatial map for one reusable location.',
      'The image must contain two or three horizontal panorama bands, each reading as a continuous 360-degree unfolded survey of the same physical set.',
      'If the output is a square 2x2 contact sheet, four separate panels, an irregular collage, or one cropped single-angle room image, the output is wrong.',
      `Locked spatial layout plan that must be obeyed:\n${input.layoutPlan}`,
      `This is the ${view.enLabel} for a same-location spatial reference asset.`,
      view.enCoverage,
      'Generate exactly one wide 16:9 image. Use subtle horizontal separators only if there are multiple panorama bands; do not use vertical panel dividers.',
      'Keep the full panorama empty and reusable for later character placement and storyboard inheritance.',
      'Do not create a 2x2 grid, contact sheet, four thumbnails, shot panels, labels, or numbered storyboard cells.',
    ])
    : joinLines([
      'CRITICAL IMAGE FORMAT - MUST OBEY BEFORE ANY SCENE CONTENT:',
      'ONE FINAL IMAGE ONLY. The final image must be a wide 16:9 720-degree panoramic spatial map for one reusable location.',
      'The image must contain two or three horizontal panorama bands, each reading as a continuous 360-degree unfolded survey of the same physical set.',
      'If the output is a square 2x2 contact sheet, four separate panels, an irregular collage, or one cropped single-angle room image, the output is wrong.',
      '关键版式要求，优先级高于所有场景内容：',
      '只输出一张最终图片。最终图片必须是一张 16:9 横版 720 度全景空间图，用于一个可复用场景。',
      '画面必须包含两到三条横向全景带，每条都像同一个真实布景的连续 360 度展开环视。',
      '如果输出是正方形 2x2 contact sheet、四个独立 panel、不规则拼贴，或单一裁切角度房间图，就是错误结果。',
      `必须遵守的锁定空间布局说明：\n${input.layoutPlan}`,
      `这是同一地点场景参考资产的${view.zhLabel}。`,
      view.zhCoverage,
      '只生成一张 16:9 横版图片。多条全景带之间可以有细横向分隔线，但不得使用竖向 panel 分隔线。',
      '整张全景都保持为空场景资产，方便后续人物落位和分镜继承。',
      '不得生成 2x2 网格、contact sheet、四张缩略图、镜头 panel、标签或分镜编号。',
    ])
  return joinLines([
    rule,
    input.prompt,
    rule,
  ])
}

export function parseLocationSceneBoardLayoutPlan(parsed: Record<string, unknown>): string {
  const layoutPlan = parsed.layoutPlan
  if (typeof layoutPlan !== 'string' || !layoutPlan.trim()) {
    throw new Error('LOCATION_SCENE_BOARD_LAYOUT_PLAN_INVALID')
  }
  return layoutPlan.trim()
}

export function parseLocationSceneBoardPrompt(parsed: Record<string, unknown>): string {
  const prompt = parsed.prompt
  if (typeof prompt !== 'string' || !prompt.trim()) {
    throw new Error('LOCATION_SCENE_BOARD_PROMPT_INVALID')
  }
  return prompt.trim()
}
