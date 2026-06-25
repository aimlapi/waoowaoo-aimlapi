import type { Locale } from '@/i18n/routing'
import type { EditScriptStyleBible } from '@/lib/edit-script/types'
import { renderStyleBiblePromptBlock } from '@/lib/edit-script/style-bible-prompt'

export type LocationSceneBoardViewId =
  | 'quad-grid'

export const LOCATION_SCENE_BOARD_VIEW_COUNT = 1

export interface LocationSceneBoardView {
  readonly id: LocationSceneBoardViewId
  readonly label: string
  readonly aspectRatio: '1:1'
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
    id: 'quad-grid',
    zhLabel: '四宫格空间板',
    enLabel: '2x2 spatial board',
    zhCoverage: '生成同一个地点的一张 2x2 四宫格场景空间板。四个格子必须分别展示前方、后方、左侧、右侧四个机位；每格都必须继承同一套房间结构、门窗位置、家具锚点、材质、色彩和光源，不得像四个不同地点。',
    enCoverage: 'Generate one 2x2 location spatial-board image for the same physical set. The four quadrants must show front, back, left, and right camera coverage; every quadrant must inherit the same room structure, doors/windows, furniture anchors, materials, palette, and light sources rather than looking like four different locations.',
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
      'The final prompt must describe exactly one empty reusable scene reference image as a 2x2 contact sheet: front view, back view, left view, right view.',
      'Use one square 1:1 frame containing four equal quadrants separated by clean thin dividers.',
      'Each quadrant should include a small readable corner label only: FRONT, BACK, LEFT, RIGHT. Do not add any other captions, subtitles, watermarks, UI marks, or explanatory text.',
      'Do not include named main characters or narrative action beats. Temporary tiny background silhouettes are allowed only when necessary for scale, but the asset must remain an empty reusable location reference.',
    ])
  }

  return joinLines([
    '只输出 JSON：{"prompt":"最终图片生成提示词"}。',
    'prompt 字段必须只包含最终图片提示词，不得包含分析说明、隐藏推理、策略名称、完整原始输入或“选择地点”这类任务指令。',
    '最终 prompt 必须描述且只描述一张 2x2 四宫格空场景参考图：前方、后方、左侧、右侧。',
    '使用 1:1 正方形画幅，内部四个等大格子，用干净细分隔线区分。',
    '每个格子只允许有一个小而清晰的角标：前、后、左、右。不要添加其他说明文字、字幕、水印、UI 标记或解释性文字。',
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
      'This image belongs to a coherent location spatial board. Every view must feel like the same physical set viewed from a different camera side.',
    ]
  }
  return [
    `场景来源输入：${description}`,
    '请从输入中推断地点身份、故事压力、空间锚点、美术规则、时代线索、材质色彩、灯光逻辑和后续分镜复用需求。',
    '这张图属于同一个地点的场景空间板。每个视角都必须像同一个真实布景从不同机位方向观察，而不是重新设计一个新地点。',
  ]
}

export function stripLocationSceneBoardSlotDescription(description: string): string {
  const zhMarker = '\n\n场景空间板槽位：'
  const enMarker = '\n\nScene-board slot:'
  const zhIndex = description.indexOf(zhMarker)
  if (zhIndex >= 0) return description.slice(0, zhIndex).trim()
  const enIndex = description.indexOf(enMarker)
  if (enIndex >= 0) return description.slice(0, enIndex).trim()
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
      'You are a film production designer building the locked spatial plan for a same-location multi-angle reference board.',
      ...sharedContext(input),
      styleBibleContext(input),
      'Create one internally consistent set layout that later front/back/left/right view prompts must inherit exactly.',
      'Use concrete spatial language: camera axes, wall names, fixed anchors, object positions, doorway/window placement, ceiling feature placement, floor zones, lighting direction, and usable blocking space.',
      layoutPlanOutputRule(input.locale),
    ])
    : joinLines([
      '你是电影美术指导，正在为同一地点的多角度场景空间板建立锁定空间布局。',
      ...sharedContext(input),
      styleBibleContext(input),
      '创建一套内部一致的布景空间关系，后续前/后/左/右视角 prompt 必须严格继承这套关系。',
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
      'You are a film production designer creating a coherent multi-angle location reference pack for later storyboards.',
      ...sharedContext(input),
      styleBibleContext(input),
      `Locked spatial layout plan:\n${input.layoutPlan}`,
      `Required spatial-board output: ${view.enLabel}.`,
      view.enCoverage,
      'Inside the single image, keep stable anchors across all four quadrants: architecture, window/door positions, ceiling/floor logic, furniture families, color accents, material texture, and motivated light direction.',
      'Make every quadrant useful for later shot planning, including clear foreground/midground/background and practical blocking space.',
      outputRule(input.locale),
    ])
    : joinLines([
      '你是电影美术指导，正在为后续分镜创建同一地点的多角度场景参考包。',
      ...sharedContext(input),
      styleBibleContext(input),
      `锁定空间布局说明：\n${input.layoutPlan}`,
      `指定空间板输出：${view.zhLabel}。`,
      view.zhCoverage,
      '必须在同一张图的四个格子里保持稳定锚点：建筑结构、门窗位置、天花/地面逻辑、家具类型、色彩重心、材质纹理和有动机的光源方向。',
      '每个格子的机位都要服务后续镜头规划，清楚呈现前景/中景/背景，并保留可调度人物的实用空间。',
      outputRule(input.locale),
    ])

  return {
    id: view.id,
    label: input.locale === 'en' ? view.enLabel : view.zhLabel,
    aspectRatio: '1:1',
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
      `Locked spatial layout plan that must be obeyed:\n${input.layoutPlan}`,
      `This is the ${view.enLabel} for a same-location spatial reference board.`,
      view.enCoverage,
      'Generate one square 1:1 image containing four equal quadrants: FRONT, BACK, LEFT, RIGHT. Use clean thin dividers and one small label per quadrant only.',
      'Keep all quadrants empty and reusable for later character placement and storyboard inheritance.',
    ])
    : joinLines([
      `必须遵守的锁定空间布局说明：\n${input.layoutPlan}`,
      `这是同一地点场景空间板的${view.zhLabel}。`,
      view.zhCoverage,
      '只生成一张 1:1 正方形图片，内部包含四个等大格子：前、后、左、右。使用干净细分隔线，每格只放一个小角标。',
      '四个格子都保持为空场景资产，方便后续人物落位和分镜继承。',
    ])
  return joinLines([input.prompt, rule])
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
