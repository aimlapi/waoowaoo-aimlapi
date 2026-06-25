import type { Locale } from '@/i18n/routing'
import type { EditScriptStyleBible } from '@/lib/edit-script/types'
import { renderStyleBiblePromptBlock } from '@/lib/edit-script/style-bible-prompt'

export type LocationSceneBoardViewId =
  | 'establishing'
  | 'front'
  | 'back'
  | 'left'
  | 'right'

export const LOCATION_SCENE_BOARD_VIEW_COUNT = 5

export interface LocationSceneBoardView {
  readonly id: LocationSceneBoardViewId
  readonly label: string
  readonly aspectRatio: '4:3'
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
    id: 'establishing',
    zhLabel: '主氛围图',
    enLabel: 'Establishing mood view',
    zhCoverage: '生成这个地点的主氛围建立镜头。画面要像可复用的电影场景资产：展示整体空间格局、主视觉锚点、入口/出口、主要家具或建筑结构、光源方向和可供后续人物落位的区域。',
    enCoverage: 'Generate the establishing mood view for this location. The image must work as a reusable film location asset: show the overall layout, primary visual anchors, entrances/exits, major furniture or architecture, lighting direction, and usable areas for later character placement.',
  },
  {
    id: 'front',
    zhLabel: '前方视角',
    enLabel: 'Front coverage view',
    zhCoverage: '生成同一地点的前方覆盖视角。镜头站在空间前轴，面向主要背景墙、窗景、舞台面或最能承载叙事的正面方向；必须与主氛围图共享同一套建筑、家具、材质、色彩和光源，只改变观察方向。',
    enCoverage: 'Generate the front coverage view of the same location. Place the camera on the front axis, looking toward the main background wall, window view, stage plane, or strongest narrative-facing direction; keep the same architecture, furniture, materials, palette, and light sources as the establishing view, changing only the viewing direction.',
  },
  {
    id: 'back',
    zhLabel: '后方视角',
    enLabel: 'Back coverage view',
    zhCoverage: '生成同一地点的后方覆盖视角。镜头站在与前方视角相反的一侧，展示前方视角看不见的入口、吧台、走廊、墙面、后场结构或逃离路线；必须延续同一空间的锚点和美术规则。',
    enCoverage: 'Generate the back coverage view of the same location. Place the camera on the opposite side from the front view, revealing entrances, counters, corridors, rear walls, backstage structure, or escape routes hidden from the front view; preserve the same spatial anchors and production-design rules.',
  },
  {
    id: 'left',
    zhLabel: '左侧视角',
    enLabel: 'Left coverage view',
    zhCoverage: '生成同一地点的左侧覆盖视角。镜头从空间左侧横向观察，重点展示左侧墙面、侧向动线、桌椅/门窗/柱体关系和可用于侧向调度的地面区域；不得把地点改成新场景。',
    enCoverage: 'Generate the left coverage view of the same location. Observe laterally from the left side, emphasizing the left wall, side movement path, furniture/door/window/column relationships, and floor areas useful for lateral blocking; do not turn it into a different scene.',
  },
  {
    id: 'right',
    zhLabel: '右侧视角',
    enLabel: 'Right coverage view',
    zhCoverage: '生成同一地点的右侧覆盖视角。镜头从空间右侧横向观察，重点展示右侧墙面、侧向动线、桌椅/门窗/柱体关系和可用于反打或运动镜头的地面区域；必须与左侧视角形成同一空间的互补覆盖。',
    enCoverage: 'Generate the right coverage view of the same location. Observe laterally from the right side, emphasizing the right wall, side movement path, furniture/door/window/column relationships, and floor areas useful for reverse angles or moving shots; it must complement the left view within the same space.',
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
      'The final prompt must describe exactly one empty reusable scene reference image for the requested spatial-board view.',
      'Use a 4:3 landscape frame. Do not make a contact sheet, collage, blueprint, map, storyboard panel, or multi-panel layout.',
      'Do not add visible direction labels, arrows, captions, subtitles, watermarks, UI marks, or explanatory text.',
      'Do not include named main characters or narrative action beats. Temporary tiny background silhouettes are allowed only when necessary for scale, but the asset must remain an empty reusable location reference.',
    ])
  }

  return joinLines([
    '只输出 JSON：{"prompt":"最终图片生成提示词"}。',
    'prompt 字段必须只包含最终图片提示词，不得包含分析说明、隐藏推理、策略名称、完整原始输入或“选择地点”这类任务指令。',
    '最终 prompt 必须描述且只描述一张空场景参考图，服务于指定的空间板视角。',
    '使用 4:3 横版画幅。不要生成拼图、接触表、蓝图、地图、分镜格或多宫格。',
    '不要添加可见方向标签、箭头、说明文字、字幕、水印、UI 标记或解释性文字。',
    '不要出现有名主角或叙事动作瞬间。只有在需要标尺时才允许极小的背景人影，但资产本质必须仍是可复用空场景参考。',
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

export function resolveLocationSceneBoardView(imageIndex: number): LocationSceneBoardViewSpec {
  const view = LOCATION_SCENE_BOARD_VIEW_SPECS[imageIndex]
  if (!view) {
    throw new Error(`LOCATION_SCENE_BOARD_VIEW_NOT_FOUND:${imageIndex}`)
  }
  return view
}

export function buildLocationSceneBoardView(input: {
  readonly description: string
  readonly locale: Locale
  readonly styleBible: EditScriptStyleBible | null
  readonly imageIndex: number
}): LocationSceneBoardView {
  const view = resolveLocationSceneBoardView(input.imageIndex)
  const draftInstruction = input.locale === 'en'
    ? joinLines([
      'You are a film production designer creating a coherent multi-angle location reference pack for later storyboards.',
      ...sharedContext(input),
      styleBibleContext(input),
      `Required spatial-board view: ${view.enLabel}.`,
      view.enCoverage,
      'Preserve stable anchors across the whole pack: architecture, window/door positions, ceiling/floor logic, furniture families, color accents, material texture, and motivated light direction.',
      'Make the camera angle useful for later shot planning, including clear foreground/midground/background and practical blocking space.',
      outputRule(input.locale),
    ])
    : joinLines([
      '你是电影美术指导，正在为后续分镜创建同一地点的多角度场景参考包。',
      ...sharedContext(input),
      styleBibleContext(input),
      `指定空间板视角：${view.zhLabel}。`,
      view.zhCoverage,
      '必须在整套空间板中保持稳定锚点：建筑结构、门窗位置、天花/地面逻辑、家具类型、色彩重心、材质纹理和有动机的光源方向。',
      '机位角度要服务后续镜头规划，清楚呈现前景/中景/背景，并保留可调度人物的实用空间。',
      outputRule(input.locale),
    ])

  return {
    id: view.id,
    label: input.locale === 'en' ? view.enLabel : view.zhLabel,
    aspectRatio: '4:3',
    draftInstruction,
  }
}

export function appendLocationSceneBoardViewRule(input: {
  readonly prompt: string
  readonly locale: Locale
  readonly imageIndex: number
}): string {
  const view = resolveLocationSceneBoardView(input.imageIndex)
  const rule = input.locale === 'en'
    ? joinLines([
      `This is the ${view.enLabel} in a same-location spatial reference board.`,
      view.enCoverage,
      'Generate one 4:3 landscape image only. No contact sheet, no multi-panel layout, no labels, no arrows, no readable overlay text.',
      'Keep it empty and reusable for later character placement and storyboard inheritance.',
    ])
    : joinLines([
      `这是同一地点场景空间板中的${view.zhLabel}。`,
      view.zhCoverage,
      '只生成一张 4:3 横版图片。不要拼图，不要多宫格，不要标签，不要箭头，不要可读叠加文字。',
      '保持为空场景资产，方便后续人物落位和分镜继承。',
    ])
  return joinLines([input.prompt, rule])
}

export function parseLocationSceneBoardPrompt(parsed: Record<string, unknown>): string {
  const prompt = parsed.prompt
  if (typeof prompt !== 'string' || !prompt.trim()) {
    throw new Error('LOCATION_SCENE_BOARD_PROMPT_INVALID')
  }
  return prompt.trim()
}

