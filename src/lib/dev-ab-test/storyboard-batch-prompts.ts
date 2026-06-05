import type { Locale } from '@/i18n/routing'

export type StoryboardBatchSchemeId = 'baseline' | 'screen-lock' | 'top-down-abc'

export type CharacterSlot = 'screen-left' | 'screen-center' | 'screen-right'

export interface SchemeDefinition {
  readonly id: StoryboardBatchSchemeId
  readonly title: Record<Locale, string>
  readonly summary: Record<Locale, string>
}

export interface StoryboardBatchPanelPromptSeed {
  readonly panelNumber: number
  readonly shotType: string
  readonly cameraMove: string
  readonly duration: number
  readonly location: string
  readonly description: string
  readonly characterSlots: readonly CharacterSlot[]
  readonly props: readonly string[]
}

interface CreatedCharacterRef {
  readonly characterId: string
  readonly name: string
  readonly appearanceId: string
  readonly appearanceIndex: number
  readonly appearance: string
  readonly slot: CharacterSlot
}

export const SCHEMES: readonly SchemeDefinition[] = [
  {
    id: 'baseline',
    title: {
      zh: '基础文本分镜',
      en: 'Baseline text storyboard',
    },
    summary: {
      zh: '只使用普通镜头描述，不加入显式左右站位或俯视平面约束。',
      en: 'Only uses ordinary shot descriptions, without explicit screen-side or floor-plan constraints.',
    },
  },
  {
    id: 'screen-lock',
    title: {
      zh: '屏幕左右锁定分镜',
      en: 'Screen-side lock storyboard',
    },
    summary: {
      zh: '每个 panel 加入 screen-left / screen-right 角色槽位和禁止互换措辞。',
      en: 'Adds screen-left / screen-right character slots and direct no-swap wording to every panel.',
    },
  },
  {
    id: 'top-down-abc',
    title: {
      zh: '俯视 A/B/C 调度分镜',
      en: 'Top-down A/B/C blocking storyboard',
    },
    summary: {
      zh: '使用 A/B/C 人物编号、俯视坐标、master shot 相机位和不越轴规则。',
      en: 'Uses A/B/C character IDs, top-down coordinates, master-shot camera position, and no-axis-crossing rules.',
    },
  },
]

export const PANEL_SEEDS: readonly StoryboardBatchPanelPromptSeed[] = [
  {
    panelNumber: 1,
    shotType: 'wide master shot',
    cameraMove: 'static 50mm',
    duration: 6,
    location: 'story opening space',
    description: 'Opening beat: establish the main place and the protagonist entering the story world.',
    characterSlots: ['screen-left'],
    props: ['story prop'],
  },
  {
    panelNumber: 2,
    shotType: 'medium shot',
    cameraMove: 'static 50mm',
    duration: 6,
    location: 'story opening space',
    description: 'Inciting beat: the protagonist notices the key clue or emotional trigger.',
    characterSlots: ['screen-left'],
    props: ['story prop'],
  },
  {
    panelNumber: 3,
    shotType: 'wide two-shot',
    cameraMove: 'static 50mm',
    duration: 7,
    location: 'meeting space',
    description: 'First encounter beat: protagonist A meets character B and the spatial relationship is established.',
    characterSlots: ['screen-left', 'screen-right'],
    props: ['story prop'],
  },
  {
    panelNumber: 4,
    shotType: 'wide group master shot',
    cameraMove: 'static 50mm',
    duration: 7,
    location: 'meeting space',
    description: 'Complication beat: character C enters and changes the emotional balance of the scene.',
    characterSlots: ['screen-left', 'screen-center', 'screen-right'],
    props: ['story prop'],
  },
  {
    panelNumber: 5,
    shotType: 'medium group shot',
    cameraMove: 'static 50mm',
    duration: 7,
    location: 'meeting space',
    description: 'Reveal beat: the important object, scar, memory, or truth is shown between the characters.',
    characterSlots: ['screen-left', 'screen-left', 'screen-right'],
    props: ['story prop'],
  },
  {
    panelNumber: 6,
    shotType: 'medium close shot',
    cameraMove: 'static 50mm',
    duration: 7,
    location: 'meeting space',
    description: 'Recognition beat: the emotional recognition lands through restrained body language.',
    characterSlots: ['screen-left', 'screen-right', 'screen-left'],
    props: ['story prop'],
  },
  {
    panelNumber: 7,
    shotType: 'interior master shot',
    cameraMove: 'static 50mm',
    duration: 6,
    location: 'closing interior',
    description: 'Transition beat: the characters move into a quieter interior or safe space.',
    characterSlots: ['screen-left', 'screen-right', 'screen-right'],
    props: ['story prop'],
  },
  {
    panelNumber: 8,
    shotType: 'medium table shot',
    cameraMove: 'static 50mm',
    duration: 7,
    location: 'closing interior',
    description: 'Care beat: one character offers a small practical gesture instead of dramatic exposition.',
    characterSlots: ['screen-left', 'screen-right', 'screen-right'],
    props: ['story prop'],
  },
  {
    panelNumber: 9,
    shotType: 'quiet closing shot',
    cameraMove: 'static 50mm',
    duration: 6,
    location: 'closing interior',
    description: 'Closing beat: the characters settle into a restrained final image that implies the relationship has changed.',
    characterSlots: ['screen-left', 'screen-right', 'screen-right'],
    props: ['story prop'],
  },
]

export function clampPanelCount(value: number): number {
  if (!Number.isFinite(value)) return 6
  return Math.max(3, Math.min(9, Math.trunc(value)))
}

export function schemeById(id: StoryboardBatchSchemeId): SchemeDefinition {
  const scheme = SCHEMES.find((item) => item.id === id)
  if (!scheme) throw new Error(`STORYBOARD_BATCH_SCHEME_NOT_FOUND:${id}`)
  return scheme
}

function compactStory(storyText: string): string {
  return storyText.trim().replace(/\s+/g, ' ').slice(0, 1400)
}

export function buildTopDownBlock(seed: StoryboardBatchPanelPromptSeed): string {
  const characterLines = seed.characterSlots.map((slot, index) => {
    const label = String.fromCharCode(65 + index)
    const x = slot === 'screen-left' ? 2.1 + index * 0.4 : slot === 'screen-center' ? 3.2 : 4.5 + index * 0.2
    const direction = slot === 'screen-left' ? '180°' : slot === 'screen-center' ? '180°' : '90°'
    return `${label}: position=(${x.toFixed(1)},${(1.5 + index * 0.3).toFixed(1)}), direction=${direction}, ${slot}`
  })
  return [
    '俯视平面图 + A/B/C 人物编号 + master shot + ControlNet/参考图 + 不越轴。',
    'Room:',
    '- table',
    '- sofa',
    '- door',
    'Characters:',
    ...characterLines,
    'Camera:',
    'position=(1.2,5.4)',
    'lens=50mm',
    'No-axis rule: keep the same camera side and never mirror, swap, or cross the character line.',
  ].join('\n')
}

export function buildScreenLockBlock(seed: StoryboardBatchPanelPromptSeed): string {
  const lockLines = seed.characterSlots.map((slot, index) => {
    const label = String.fromCharCode(65 + index)
    return `${label} must remain ${slot}; do not swap screen sides.`
  })
  return [
    'Screen position continuity:',
    ...lockLines,
    'Master shot first. Keep the camera on one side of the axis. Do not mirror the composition.',
  ].join('\n')
}

export function buildStoryboardBatchPanelPrompt(input: {
  readonly schemeId: StoryboardBatchSchemeId
  readonly storyText: string
  readonly seed: StoryboardBatchPanelPromptSeed
  readonly locale: Locale
}): string {
  const story = compactStory(input.storyText)
  const base = input.locale === 'en'
    ? [
        `Story source: ${story}`,
        `Panel ${input.seed.panelNumber}: ${input.seed.description}`,
        `Location: ${input.seed.location}`,
        'Realistic short-film storyboard frame, restrained performance, concrete lived-in environment, no text overlays.',
      ].join('\n')
    : [
        `故事原文：${story}`,
        `Panel ${input.seed.panelNumber}：${input.seed.description}`,
        `场景：${input.seed.location}`,
        '写实短片分镜画面，表演克制，环境有真实生活质感，画面内不要文字标注。',
      ].join('\n')

  if (input.schemeId === 'baseline') return base
  if (input.schemeId === 'screen-lock') {
    return `${base}\n\n${buildScreenLockBlock(input.seed)}`
  }
  return `${base}\n\n${buildTopDownBlock(input.seed)}`
}

export function buildCharacterRefs(input: {
  readonly seed: StoryboardBatchPanelPromptSeed
  readonly characterIds: readonly string[]
  readonly appearanceIds: readonly string[]
}): CreatedCharacterRef[] {
  return input.seed.characterSlots.map((slot, index) => ({
    characterId: input.characterIds[index] ?? input.characterIds[0] ?? '',
    name: `Character ${String.fromCharCode(65 + index)}`,
    appearanceId: input.appearanceIds[index] ?? input.appearanceIds[0] ?? '',
    appearanceIndex: 0,
    appearance: 'storyboard test appearance',
    slot,
  })).filter((item) => item.characterId && item.appearanceId)
}
