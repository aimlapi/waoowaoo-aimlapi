import type { PanelCharacterReference } from './image-task-handler-shared'

interface PanelExecutionContinuity {
  previous_same_scene_panel: {
    description: string | null
  } | null
  next_same_scene_panel: {
    description: string | null
  } | null
  non_featured_presence_policy: {
    required: boolean
  }
}

export interface PanelFinalFrameExecutionContext {
  panel: {
    shot_type: string
    camera_move: string
    description: string
    image_prompt: string
    video_prompt: string
    location: string
    characters: PanelCharacterReference[]
    source_text: string
    acting_notes: unknown
  }
  context: {
    scene_continuity_state: PanelExecutionContinuity
  }
}

function compactPromptText(value: string | null | undefined, limit: number): string | null {
  if (typeof value !== 'string') return null
  const normalized = value.replace(/\s+/g, ' ').trim()
  if (!normalized) return null
  if (normalized.length <= limit) return normalized
  return `${normalized.slice(0, limit).trim()}...`
}

function collectPromptStrings(value: unknown): string[] {
  if (typeof value === 'string') return value.trim() ? [value.trim()] : []
  if (Array.isArray(value)) return value.flatMap((item) => collectPromptStrings(item))
  if (value && typeof value === 'object') {
    return Object.values(value as Record<string, unknown>).flatMap((item) => collectPromptStrings(item))
  }
  return []
}

function stripTargetNoise(value: string): string {
  return value
    .replace(/^(的|了|在|向|朝|到|着)+/, '')
    .replace(/(位置|地方|方向|那里|那边|上|里|中|前方|后方)+$/, '')
    .trim()
}

function extractVisualTarget(text: string): string | null {
  const patterns = [
    /(?:视线|目光|眼神)(?:落在|停在|停留在|看向|注视|盯着|贴在)([^，。；;、]{2,40})/,
    /(?:看着|看向|注视|盯着|凝视)([^，。；;、]{2,40})/,
    /(?:视觉主体|画面主体|焦点|聚焦|特写|细节)(?:是|为|：|:)?([^，。；;、]{2,40})/,
  ]
  for (const pattern of patterns) {
    const matched = text.match(pattern)
    const target = matched?.[1] ? stripTargetNoise(matched[1]) : ''
    if (target.length >= 2) return target
  }
  return null
}

function containsObjectFocusCue(value: string): boolean {
  return /画里|画中|道具|物件|空椅|椅子|杯|票|入场单|手部|手指|窗|门|雨痕|桌|餐桌|镜面|倒影|信|手机|屏幕/.test(value)
}

function characterNames(characters: ReadonlyArray<PanelCharacterReference>): string[] {
  return characters
    .map((character) => character.name.trim())
    .filter((name) => name.length > 0)
}

function isCharacterTarget(target: string | null, names: ReadonlyArray<string>): boolean {
  if (!target) return false
  return names.some((name) => name.length > 0 && target.includes(name))
}

function screenPositionFromSlot(slot: string | null | undefined): 'left' | 'right' | 'center' | null {
  if (!slot) return null
  if (/画面左|屏幕左|银幕左|screen-left|左侧|偏左|左边/.test(slot)) return 'left'
  if (/画面右|屏幕右|银幕右|screen-right|右侧|偏右|右边/.test(slot)) return 'right'
  if (/画面中央|画面中间|屏幕中央|银幕中央|center|中央|中间/.test(slot)) return 'center'
  return null
}

function screenPositionLabel(position: 'left' | 'right' | 'center'): string {
  if (position === 'left') return '画面左侧'
  if (position === 'right') return '画面右侧'
  return '画面中央'
}

function oppositeScreenPositionLabel(position: 'left' | 'right' | 'center'): string | null {
  if (position === 'left') return '画面右侧'
  if (position === 'right') return '画面左侧'
  return null
}

function buildCharacterScreenLines(characters: ReadonlyArray<PanelCharacterReference>): string[] {
  if (characters.length === 0) {
    return ['当前镜头没有主体角色时，优先表现环境、道具或视线目标；同场景人物如需保持连续性，只能以远景、边缘、虚化、背影、肩膀或倒影出现。']
  }
  const lines = characters.map((character) => {
    const slot = compactPromptText(character.slot, 120)
    const screenPosition = screenPositionFromSlot(character.slot)
    if (slot && screenPosition) {
      const forbiddenPosition = oppositeScreenPositionLabel(screenPosition)
      return `${character.name}：必须画在${screenPositionLabel(screenPosition)}，按最终画面坐标执行 slot「${slot}」${forbiddenPosition ? `；禁止把 ${character.name} 画到${forbiddenPosition}` : ''}。`
    }
    if (slot) return `${character.name}：按最终画面坐标执行 slot「${slot}」。`
    return `${character.name}：按当前镜头描述和同场景连续性确定位置，保持前后镜头的银幕左右关系。`
  })
  lines.push('slot 中的“左/右/中央/边缘”一律理解为观众最终看到的画面左侧/画面右侧/画面中央/画面边缘，不是角色自身左右，也不是行走方向。')
  if (characters.length >= 2) {
    lines.push('多人物镜头必须保持上述画面左右顺序和半步距离；不要把人物左右互换，不要把并排关系改成面对面对峙。')
  }
  return lines
}

function buildContinuityExecutionLines(context: PanelFinalFrameExecutionContext): string[] {
  const continuity = context.context.scene_continuity_state
  const previous = continuity.previous_same_scene_panel
  const next = continuity.next_same_scene_panel
  const lines: string[] = []
  if (previous?.description) {
    lines.push(`延续上一同场景镜头的空间关系：上一镜为「${compactPromptText(previous.description, 160)}」。当前镜头只改变取景和动作瞬间，不重排人物位置。`)
  }
  if (next?.description) {
    lines.push(`下一同场景镜头参考：下一镜为「${compactPromptText(next.description, 120)}」。当前镜头要为该关系留下自然衔接。`)
  }
  if (continuity.non_featured_presence_policy.required) {
    lines.push('同场景但非主体角色不得凭空消失；可以放在边缘、局部身体、肩膀、背影、倒影、剪影或远处虚化里。')
  }
  return lines
}

function buildCameraExecutionLines(input: {
  panel: PanelFinalFrameExecutionContext['panel']
  hasObjectTarget: boolean
}): string[] {
  const { panel, hasObjectTarget } = input
  const lines: string[] = []
  if (panel.shot_type || panel.camera_move) {
    lines.push(`镜头执行：${panel.shot_type || '未指定景别'}，${panel.camera_move || '静态观察'}；只画运镜完成后的一个最终单帧，不画动作过程或连续帧。`)
  }
  if (/近景|特写|close|Close/.test(panel.shot_type)) {
    if (hasObjectTarget) {
      lines.push('近景不等于人物正面肖像；如果本镜头存在道具、画中对象或视线目标，允许用越肩、侧影、局部身体或虚化人物来突出目标物。')
    } else {
      lines.push('近景要保留视线方向、身体朝向和关键环境锚点，不要默认让角色正面直视镜头。')
    }
  }
  if (/中景|medium|Medium/.test(panel.shot_type)) {
    lines.push('中景必须看清人物站位、身体朝向和主要场景锚点，避免只裁成半身肖像。')
  }
  if (/面向墙上画作|面向画作|画前|画里的|画中|画作/.test(`${panel.description} ${panel.video_prompt}`)) {
    lines.push('涉及墙上画作时，必须清楚保留画作、展墙和人物面向画作的关系；不要把画作退化成无关背景。')
  }
  return lines
}

function buildMustShowLines(input: {
  panel: PanelFinalFrameExecutionContext['panel']
  target: string | null
}): string[] {
  const lines: string[] = []
  if (input.target) lines.push(`必须清楚表现视觉目标：${input.target}。`)
  if (input.panel.location) lines.push(`必须保留场景：${input.panel.location} 的主要空间锚点。`)
  for (const character of input.panel.characters) {
    lines.push(`必须保持 ${character.name} 的身份、发型、服装、体型和主要外观与角色参考一致。`)
  }
  return lines
}

function buildMustNotShowLines(input: {
  panel: PanelFinalFrameExecutionContext['panel']
  hasObjectTarget: boolean
}): string[] {
  const lines = [
    '禁止让动态动作词覆盖最终定格构图；走动、让开、推近、横移、环绕都只能转译为单帧姿态。',
    '禁止角色直视镜头，除非原文明确要求主观视角、采访、自拍或监控视角。',
  ]
  if (input.panel.characters.length >= 2) {
    lines.push('禁止互换角色 screen-left / screen-right 关系，禁止把并排站位误画成面对面隔空对话。')
  }
  if (input.hasObjectTarget) {
    lines.push('禁止让人物正面肖像抢走画面中心，禁止把道具、画中对象或视线目标画得不可辨认。')
  }
  if (/画前|画作|展墙|墙上/.test(`${input.panel.description} ${input.panel.video_prompt}`)) {
    lines.push('禁止把人物挪到展厅中央、门洞前或新的空间关系里；必须保持在同一画作/展墙关系中。')
  }
  return lines
}

export function buildFinalFrameExecutionPrompt(context: PanelFinalFrameExecutionContext): string {
  const panel = context.panel
  const names = characterNames(panel.characters)
  const textCorpus = [
    panel.description,
    panel.image_prompt,
    panel.video_prompt,
    panel.source_text,
    ...collectPromptStrings(panel.acting_notes),
  ].filter((item): item is string => typeof item === 'string' && item.trim().length > 0).join(' ')
  const visualTarget = extractVisualTarget(textCorpus)
  const objectCueSuggestsFocus = containsObjectFocusCue(textCorpus)
    && /近景|特写|细节|插入|空镜|insert|Insert|close|Close/.test(`${panel.shot_type} ${panel.description} ${panel.video_prompt}`)
  const hasObjectTarget = Boolean(visualTarget && !isCharacterTarget(visualTarget, names)) || objectCueSuggestsFocus
  const visualSubject = visualTarget
    ? `视觉主体/视线目标：${visualTarget}。${hasObjectTarget ? '它必须在画面中可见并承担叙事重点，角色表演服务于它。' : '人物互动服务于这个视线关系。'}`
    : panel.characters.length > 0
      ? '视觉主体：当前镜头的人物站位、视线方向和与场景锚点的关系，而不是单纯人物肖像。'
      : '视觉主体：当前镜头的环境、道具或空间情绪。'

  return [
    '【当前镜头执行层 - 最高优先级】',
    `最终单帧目标：${compactPromptText(panel.description || panel.video_prompt || panel.source_text, 220) || '按当前 panel 生成一个明确的电影分镜定格。'}`,
    visualSubject,
    '人物银幕调度：',
    ...buildCharacterScreenLines(panel.characters).map((line) => `- ${line}`),
    '机位与取景：',
    ...buildCameraExecutionLines({ panel, hasObjectTarget }).map((line) => `- ${line}`),
    ...buildContinuityExecutionLines(context).map((line) => `- ${line}`),
    '必须出现：',
    ...buildMustShowLines({ panel, target: visualTarget }).map((line) => `- ${line}`),
    '禁止误读：',
    ...buildMustNotShowLines({ panel, hasObjectTarget }).map((line) => `- ${line}`),
  ].join('\n')
}
