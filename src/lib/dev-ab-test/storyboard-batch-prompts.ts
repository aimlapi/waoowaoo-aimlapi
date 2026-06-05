import type { Locale } from '@/i18n/routing'

export type StoryboardBatchSchemeId = 'global-continuity-prompt' | 'top-down-spatial-lock' | 'first-panel-img2img'

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
    id: 'global-continuity-prompt',
    title: {
      zh: '全局连续性 Prompt',
      en: 'Global continuity prompt',
    },
    summary: {
      zh: '使用完整 world state、角色状态、轴线规则、参考条件和负面约束生成单个 panel。',
      en: 'Uses a full world state, character state, axis rules, reference conditioning, and negative constraints for each panel.',
    },
  },
  {
    id: 'top-down-spatial-lock',
    title: {
      zh: '俯视图空间锁定',
      en: 'Top-down spatial lock',
    },
    summary: {
      zh: '先把俯视图作为空间真相，按 A/B/C 标记人物坐标；人物未移动时沿用锁定，发生移动时更新锁定。',
      en: 'Uses the top-down floor plan as spatial truth, marks A/B/C coordinates, carries locks forward unless a shot explicitly moves a character.',
    },
  },
  {
    id: 'first-panel-img2img',
    title: {
      zh: '首张参考图生图',
      en: 'First-panel image reference',
    },
    summary: {
      zh: '先生成第 1 张 panel 作为 master reference，后续 panel 完成后只基于这张图继续图生图。',
      en: 'Generates panel 1 as the master reference first, then submits the remaining panels using that image as the source-panel reference.',
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

function panelLabel(seed: StoryboardBatchPanelPromptSeed): string {
  return `Panel ${String(seed.panelNumber).padStart(2, '0')}`
}

function buildGlobalContinuityPrompt(input: {
  readonly seed: StoryboardBatchPanelPromptSeed
  readonly storyText: string
}): string {
  const story = compactStory(input.storyText)
  return [
    'You are generating storyboard panels for a continuous film scene.',
    '',
    'CREATIVE BRIEF / SHARED UPSTREAM STORY:',
    story,
    '',
    'GLOBAL WORLD STATE:',
    'Use the creative brief as the single source of truth for premise, mood, protagonist, time period, and environment.',
    'The story is a restrained realistic film scene chain, not a new fantasy, comedy, or action premise.',
    'Preserve the same social environment, hometown geography, season, clothing logic, and emotional tone across every panel.',
    '',
    'CHARACTER STATE:',
    'Character A is the protagonist described in the creative brief. Keep her age, gender, life situation, clothing continuity, body language, and emotional restraint consistent.',
    'Any supporting character must be grounded in the same realistic hometown environment and must not steal the protagonist focus.',
    'The protagonist should carry the emotional arc through small gestures, pauses, glances, and spatial distance rather than melodramatic posing.',
    '',
    'CAMERA / CONTINUITY:',
    '- Maintain spatial continuity from panel to panel.',
    '- Camera must stay on the same side of the axis for all shots.',
    '- Do not mirror the location.',
    '- Do not suddenly move fixed objects, roads, doors, windows, furniture, vehicles, or background geography.',
    '- Do not change the protagonist identity, age, clothing logic, or emotional state abruptly.',
    '- Preserve left-right continuity across every panel.',
    '',
    'REFERENCE CONDITIONING:',
    'Use the provided master shot as the spatial reference.',
    'Use the provided character and location references from the shared upstream project.',
    'Use the previous panel as continuity reference.',
    'The new panel should feel like a different camera angle inside the same physical world, not a newly generated story.',
    '',
    'SHOT TO GENERATE:',
    panelLabel(input.seed),
    `Shot size: ${input.seed.shotType}.`,
    `Camera position: ${input.seed.cameraMove}.`,
    'Lens: 35mm or 50mm naturalistic perspective.',
    `Location: ${input.seed.location}.`,
    `Action: ${input.seed.description}`,
    '',
    'VISUAL STYLE:',
    'Realistic cinematic storyboard, Hou Hsiao-hsien-inspired restraint, long-take sensibility, observational framing.',
    'Muted natural colors, quiet hometown textures, available light, emotional distance.',
    '35mm film texture.',
    'High realism, no cartoon style.',
    '',
    'NEGATIVE CONSTRAINTS:',
    '- No mirrored composition.',
    '- No changed protagonist identity.',
    '- No sudden genre change.',
    '- No new unrelated location.',
    '- No duplicate characters.',
    '- No inconsistent clothing.',
    '- No camera crossing the axis.',
  ].join('\n')
}

function buildTopDownSpatialLockPrompt(input: {
  readonly seed: StoryboardBatchPanelPromptSeed
  readonly storyText: string
}): string {
  const seed = input.seed
  const story = compactStory(input.storyText)
  const spatialBlock = buildTopDownBlock(seed)
  const lockedCharacters = seed.characterSlots.map((slot, index) => {
    const label = String.fromCharCode(65 + index)
    const movementRule = seed.panelNumber <= 1
      ? 'initialize this character lock from the top-down position.'
      : 'reuse the previous locked position unless the action explicitly moves this character.'
    return `Character ${label}: ${slot}; ${movementRule}`
  })
  return [
    'Generate one storyboard panel using the top-down floor plan as the spatial truth.',
    'The floor plan is not decorative. It is the binding source for character coordinates, camera side, entrances, exits, and fixed object positions.',
    '',
    'SHARED STORY SOURCE:',
    story,
    '',
    'SPATIAL TRUTH / TOP-DOWN LOCK:',
    spatialBlock,
    '',
    'CHARACTER POSITION LOCKS:',
    ...lockedCharacters,
    'If a character is not described as moving in this panel, keep that character at the prior top-down coordinate and preserve screen-side continuity.',
    'If a character enters, exits, or crosses to a new position, update only that character lock and keep every other lock unchanged.',
    '',
    'SHOT TO GENERATE:',
    panelLabel(seed),
    `Shot size: ${seed.shotType}.`,
    `Camera: ${seed.cameraMove}.`,
    `Location: ${seed.location}.`,
    `Action: ${seed.description}`,
    '',
    'CONTINUITY CONSTRAINTS:',
    '- Keep camera on the same side of the A/B axis.',
    '- Do not mirror the room or exterior geography.',
    '- Do not swap screen-left and screen-right character identities.',
    '- Do not invent new fixed furniture, doors, windows, roads, vehicles, or landmarks.',
    '- Use previous panel continuity plus the top-down lock; when they conflict, the top-down spatial truth wins.',
    '',
    'VISUAL STYLE:',
    'Realistic cinematic storyboard panel, muted earth tones, practical or natural light, 35mm film texture, high realism, no cartoon style.',
  ].join('\n')
}

function buildFirstPanelReferencePrompt(input: {
  readonly seed: StoryboardBatchPanelPromptSeed
  readonly storyText: string
}): string {
  const seed = input.seed
  const story = compactStory(input.storyText)
  const referenceLine = seed.panelNumber === 1
    ? 'This is the master reference panel. Establish the room geography clearly and make the image usable as the sole visual source for later panels.'
    : 'Use panel 01 as the only source-panel image reference. Preserve the same physical world, clothing, character identity, hometown texture, and spatial blocking from that image.'
  return [
    'Generate a realistic cinematic storyboard panel for the same continuous film scene.',
    `Creative brief: ${story}`,
    referenceLine,
    '',
    `Panel: ${panelLabel(seed)}`,
    `Shot size: ${seed.shotType}`,
    `Camera: ${seed.cameraMove}`,
    `Location: ${seed.location}`,
    `Action: ${seed.description}`,
    '',
    'Continuity locks:',
    '- Keep the protagonist from the creative brief recognizable across every panel.',
    '- Preserve the same hometown environment, clothing logic, fixed objects, and emotional restraint.',
    '- Do not mirror, do not cross the 180-degree axis, do not abruptly change the protagonist or location.',
    '',
    'Style: realistic cinematic storyboard, Hou Hsiao-hsien-inspired restraint, muted earth tones, available light, 35mm film texture.',
  ].join('\n')
}

export function buildStoryboardBatchPanelPrompt(input: {
  readonly schemeId: StoryboardBatchSchemeId
  readonly storyText: string
  readonly seed: StoryboardBatchPanelPromptSeed
  readonly allSeeds?: readonly StoryboardBatchPanelPromptSeed[]
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

  if (input.schemeId === 'global-continuity-prompt') {
    return buildGlobalContinuityPrompt({ seed: input.seed, storyText: input.storyText })
  }
  if (input.schemeId === 'top-down-spatial-lock') {
    return buildTopDownSpatialLockPrompt({
      seed: input.seed,
      storyText: input.storyText,
    })
  }
  if (input.schemeId === 'first-panel-img2img') {
    return `${buildFirstPanelReferencePrompt({ seed: input.seed, storyText: input.storyText })}\n\n${buildTopDownBlock(input.seed)}`
  }
  return `${base}\n\n${buildScreenLockBlock(input.seed)}`
}

export function buildCharacterRefs(input: {
  readonly seed: StoryboardBatchPanelPromptSeed
  readonly characterIds: readonly string[]
  readonly appearanceIds: readonly string[]
  readonly characterNames?: readonly string[]
}): CreatedCharacterRef[] {
  return input.seed.characterSlots.map((slot, index) => ({
    characterId: input.characterIds[index] ?? '',
    name: input.characterNames?.[index] ?? `Character ${String.fromCharCode(65 + index)}`,
    appearanceId: input.appearanceIds[index] ?? '',
    appearanceIndex: 0,
    appearance: 'storyboard test appearance',
    slot,
  })).filter((item) => item.characterId && item.appearanceId)
}
