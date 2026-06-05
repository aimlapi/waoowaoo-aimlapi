import type { Locale } from '@/i18n/routing'

export type StoryboardBatchSchemeId = 'global-continuity-prompt' | 'shot-card-board' | 'first-panel-img2img'

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
    id: 'shot-card-board',
    title: {
      zh: '分镜板 Shot Card 版式',
      en: 'Storyboard shot-card board',
    },
    summary: {
      zh: '参考电影分镜板排版：场景编号、时间码、双画面、箭头、镜头参数、角色参考和技术规格。',
      en: 'Uses a film storyboard-board layout: scene number, timecode, paired frames, arrows, shot metadata, character refs, and technical specs.',
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

function buildFamilyDinnerContinuityPrompt(seed: StoryboardBatchPanelPromptSeed): string {
  const isPanelFour = seed.panelNumber === 4
  return [
    'You are generating storyboard panels for a continuous film scene.',
    '',
    'GLOBAL WORLD STATE:',
    'Scene ID: family_dinner_01',
    'Location: small apartment dining room.',
    'Fixed objects:',
    '- Door: back-right side of the room.',
    '- Dining table: center of the room.',
    '- Sofa: left wall.',
    '- Window: back-left wall.',
    '',
    'CHARACTER STATE:',
    'Character A:',
    '- female, 35, blue sweater.',
    '- Position: left side of the table.',
    '- Facing: toward Character B.',
    '- Screen rule: must always appear on the left side of the frame when A and B are both visible.',
    '',
    'Character B:',
    '- male, 38, dark jacket.',
    '- Position: right side of the table.',
    '- Facing: toward Character A.',
    '- Screen rule: must always appear on the right side of the frame when A and B are both visible.',
    '',
    'Character C:',
    '- male, 50, gray coat.',
    '- Initial position: outside the door.',
    '- Action: enters through the back-right door and stops behind the table.',
    '',
    'CAMERA AXIS / CONTINUITY:',
    '- Maintain the 180-degree axis between Character A and Character B.',
    '- Camera must stay on the same side of the axis for all shots.',
    '- Do not mirror the room.',
    '- Do not swap Character A and Character B.',
    '- Do not change furniture positions.',
    '- Do not move the door, sofa, table, or window.',
    '- Preserve left-right continuity across every panel.',
    '',
    'REFERENCE CONDITIONING:',
    'Use the provided master shot as the spatial reference.',
    'Use the provided character reference images for A, B, and C.',
    'Use the previous panel as continuity reference.',
    'The new panel should feel like a different camera angle inside the same physical room, not a newly generated room.',
    '',
    'SHOT TO GENERATE:',
    isPanelFour ? 'Panel 04' : panelLabel(seed),
    isPanelFour ? 'Shot size: medium wide shot.' : `Shot size: ${seed.shotType}.`,
    'Camera position: near the dining table, still on the same side of the A-B axis.',
    'Lens: 35mm.',
    isPanelFour
      ? 'Composition: A remains on screen-left, B remains on screen-right, C enters from the back-right door.'
      : 'Composition: A remains on screen-left, B remains on screen-right, fixed room layout remains unchanged.',
    isPanelFour
      ? 'Action: C opens the door and steps into the room. A turns her head slightly toward C. B stays still.'
      : `Action: ${seed.description}`,
    '',
    'VISUAL STYLE:',
    'Realistic cinematic storyboard.',
    'Muted earth tones.',
    'Soft practical interior lighting.',
    '35mm film texture.',
    'High realism, no cartoon style.',
    '',
    'NEGATIVE CONSTRAINTS:',
    '- No mirrored composition.',
    '- No character position swapping.',
    '- No new furniture.',
    '- No missing table.',
    '- No changed door location.',
    '- No duplicate characters.',
    '- No inconsistent clothing.',
    '- No camera crossing the axis.',
  ].join('\n')
}

function buildShotCardBoardPrompt(seed: StoryboardBatchPanelPromptSeed): string {
  const startSecond = Math.max(0, (seed.panelNumber - 1) * 3)
  const endSecond = startSecond + 3
  return [
    'Create a cinematic storyboard shot-card board inspired by a professional film previsualization sheet.',
    '',
    'BOARD FORMAT:',
    '- Warm off-white production-board background.',
    '- One clearly framed scene card for the requested panel.',
    '- Header contains scene number, timecode, shot title, and lens.',
    '- The card contains two horizontal cinematic thumbnails: first frame on the left, next frame on the right.',
    '- Put a simple white arrow between the two thumbnails to show action direction.',
    '- Add compact production metadata below the frames: location, shot size, camera, action, characters, props.',
    '- Include small character reference tiles and a tiny floor-plan/compass continuity marker along the bottom edge.',
    '',
    'SCENE CARD:',
    `Scene ${String(seed.panelNumber).padStart(2, '0')}`,
    `Timecode: 00:${String(startSecond).padStart(2, '0')} - 00:${String(endSecond).padStart(2, '0')}`,
    `Shot size: ${seed.shotType}`,
    `Camera: ${seed.cameraMove}`,
    `Location: ${seed.location}`,
    `Action: ${seed.description}`,
    '',
    'CONTINUITY RULES:',
    '- Character A is female in a blue sweater and must remain screen-left.',
    '- Character B is male in a dark jacket and must remain screen-right.',
    '- Character C is male in a gray coat and enters from the back-right door when visible.',
    '- Dining table center, sofa left wall, window back-left wall, door back-right.',
    '- Do not mirror the room. Do not swap A and B. Do not move furniture.',
    '',
    'VISUAL STYLE:',
    'Realistic cinematic storyboard thumbnails, muted earth tones, practical interior light, 35mm film texture.',
    'No cartoon style. No messy unreadable layout. No duplicate characters.',
  ].join('\n')
}

function buildFirstPanelReferencePrompt(seed: StoryboardBatchPanelPromptSeed): string {
  const referenceLine = seed.panelNumber === 1
    ? 'This is the master reference panel. Establish the room geography clearly and make the image usable as the sole visual source for later panels.'
    : 'Use panel 01 as the only source-panel image reference. Preserve the same room, furniture positions, clothing, character identity, and screen-left/screen-right blocking from that image.'
  return [
    'Generate a realistic cinematic storyboard panel for the same family_dinner_01 scene.',
    referenceLine,
    '',
    `Panel: ${panelLabel(seed)}`,
    `Shot size: ${seed.shotType}`,
    `Camera: ${seed.cameraMove}`,
    `Location: ${seed.location}`,
    `Action: ${seed.description}`,
    '',
    'Continuity locks:',
    '- A: female, blue sweater, screen-left / left side of table.',
    '- B: male, dark jacket, screen-right / right side of table.',
    '- C: male, gray coat, enters from the back-right door when present.',
    '- Fixed objects: dining table center, sofa left wall, window back-left wall, door back-right.',
    '- Do not mirror, do not cross the 180-degree axis, do not swap A and B.',
    '',
    'Style: realistic cinematic storyboard, muted earth tones, soft practical interior lighting, 35mm film texture.',
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

  if (input.schemeId === 'global-continuity-prompt') return buildFamilyDinnerContinuityPrompt(input.seed)
  if (input.schemeId === 'shot-card-board') return buildShotCardBoardPrompt(input.seed)
  if (input.schemeId === 'first-panel-img2img') {
    return `${buildFirstPanelReferencePrompt(input.seed)}\n\n${buildTopDownBlock(input.seed)}`
  }
  return `${base}\n\n${buildScreenLockBlock(input.seed)}`
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
