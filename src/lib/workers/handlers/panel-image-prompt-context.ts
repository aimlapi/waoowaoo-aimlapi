import {
  findAppearanceForStoryboardReference,
  findCharacterForStoryboardReference,
  type StoryboardPanelCharacterReference,
} from '@/lib/storyboard-character-bindings'
import {
  parsePanelCharacterReferences,
  type NumberedReferenceImage,
  type PanelCharacterReference,
  resolveNovelData,
} from './image-task-handler-shared'
import { buildFinalFrameExecutionPrompt } from './panel-image-final-frame-execution'
import {
  oppositeScreenPositionLabel,
  type ScreenPosition,
  screenPositionFromText,
  screenPositionLabel,
} from './panel-screen-position'

type ProjectData = Awaited<ReturnType<typeof resolveNovelData>>

export interface PanelPromptPanel {
  id: string
  storyboardId: string
  panelIndex: number
  panelNumber: number | null
  shotType: string | null
  cameraMove: string | null
  description: string | null
  imagePrompt: string | null
  videoPrompt: string | null
  location: string | null
  characters: string | null
  props?: string | null
  srtSegment: string | null
  photographyRules: string | null
  actingNotes: string | null
}

export interface StoryboardContinuityPanel {
  id: string
  panelIndex: number
  panelNumber: number | null
  shotType: string | null
  cameraMove: string | null
  description: string | null
  imagePrompt: string | null
  videoPrompt: string | null
  location: string | null
  characters: string | null
  props: string | null
  srtSegment: string | null
  photographyRules?: string | null
}

interface CharacterContinuityEntry {
  name: string
  characterId: string | null
  appearanceId: string | null
  appearance: string | null
  slot: string | null
  visibility: 'featured' | 'background_or_partial_presence_required'
  sourcePanelNumbers: number[]
}

interface CharacterScreenPositionLock {
  name: string
  characterId: string | null
  appearanceId: string | null
  appearance: string | null
  position: ScreenPosition
  positionLabel: string
  forbiddenPositionLabel: string | null
  slot: string | null
  sourcePanelNumbers: number[]
}

function parseJsonUnknown(raw: string | null | undefined): unknown | null {
  if (!raw) return null
  try {
    return JSON.parse(raw)
  } catch {
    return null
  }
}

function toRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null
}

function parseDescriptionList(raw: string | null | undefined): string[] {
  if (!raw) return []
  try {
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed.filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
  } catch {
    return []
  }
}

function pickAppearanceDescription(appearance: {
  descriptions?: string | null
  description?: string | null
  selectedIndex?: number | null
}): string {
  const descriptions = parseDescriptionList(appearance.descriptions || null)
  if (descriptions.length > 0) {
    const selectedIndex = typeof appearance.selectedIndex === 'number' ? appearance.selectedIndex : 0
    const selected = descriptions[selectedIndex] || descriptions[0]
    if (selected && selected.trim()) return selected.trim()
  }
  if (typeof appearance.description === 'string' && appearance.description.trim()) {
    return appearance.description.trim()
  }
  return '无描述'
}

function normalizeName(value: string | null | undefined) {
  return (value || '').trim().toLowerCase()
}

function normalizeLocation(value: string | null | undefined) {
  return (value || '').trim().toLowerCase()
}

function characterKey(reference: PanelCharacterReference) {
  const id = reference.characterId?.trim()
  if (id) return `id:${id}`
  return `name:${normalizeName(reference.name)}`
}

function sourcePanelNumber(panel: Pick<StoryboardContinuityPanel, 'panelNumber' | 'panelIndex'>) {
  return typeof panel.panelNumber === 'number' ? panel.panelNumber : panel.panelIndex + 1
}

function extractShotBlockingFromRules(raw: string | null | undefined): unknown | null {
  const rules = toRecord(parseJsonUnknown(raw))
  if (!rules) return null
  const metadata = toRecord(rules.consistencyMetadata)
  const cameraPlan = toRecord(rules.cameraPlan) ?? toRecord(metadata?.cameraPlan)
  return cameraPlan?.shotBlocking ?? rules.shotBlocking ?? null
}

function collectShotBlockingCharacterPlacements(shotBlocking: unknown): Array<{
  characterName: string
  screenPosition: string
}> {
  const record = toRecord(shotBlocking)
  const placements = record?.characterPlacements
  if (!Array.isArray(placements)) return []
  return placements.flatMap((placement) => {
    const placementRecord = toRecord(placement)
    const characterName = typeof placementRecord?.characterName === 'string' ? placementRecord.characterName.trim() : ''
    const screenPosition = typeof placementRecord?.screenPosition === 'string' ? placementRecord.screenPosition.trim() : ''
    if (!characterName || !screenPosition) return []
    return [{ characterName, screenPosition }]
  })
}

function previousAndNextSameLocationPanels(params: {
  currentPanel: PanelPromptPanel
  sameLocationPanels: StoryboardContinuityPanel[]
}) {
  const previous = [...params.sameLocationPanels]
    .filter((panel) => panel.panelIndex < params.currentPanel.panelIndex)
    .sort((a, b) => b.panelIndex - a.panelIndex)[0] || null
  const next = [...params.sameLocationPanels]
    .filter((panel) => panel.panelIndex > params.currentPanel.panelIndex)
    .sort((a, b) => a.panelIndex - b.panelIndex)[0] || null

  const serialize = (panel: StoryboardContinuityPanel | null) => panel
    ? {
      panel_number: sourcePanelNumber(panel),
      shot_type: panel.shotType || '',
      description: panel.description || '',
      characters: parsePanelCharacterReferences(panel.characters).map((item) => item.name),
      props: panel.props || '',
    }
    : null

  return {
    previous_same_scene_panel: serialize(previous),
    next_same_scene_panel: serialize(next),
  }
}

function buildCharacterContinuity(params: {
  currentPanel: PanelPromptPanel
  sameLocationPanels: StoryboardContinuityPanel[]
}) {
  const featuredCharacters = parsePanelCharacterReferences(params.currentPanel.characters)
  const featuredKeys = new Set(featuredCharacters.map(characterKey))
  const byKey = new Map<string, CharacterContinuityEntry>()

  const addReference = (reference: PanelCharacterReference, panelNumber: number) => {
    const key = characterKey(reference)
    if (!normalizeName(reference.name) && !reference.characterId) return
    const existing = byKey.get(key)
    const visibility = featuredKeys.has(key)
      ? 'featured'
      : 'background_or_partial_presence_required'
    if (!existing) {
      byKey.set(key, {
        name: reference.name,
        characterId: reference.characterId || null,
        appearanceId: reference.appearanceId || null,
        appearance: reference.appearance || null,
        slot: reference.slot || null,
        visibility,
        sourcePanelNumbers: [panelNumber],
      })
      return
    }

    if (!existing.characterId && reference.characterId) existing.characterId = reference.characterId
    if (!existing.appearanceId && reference.appearanceId) existing.appearanceId = reference.appearanceId
    if (!existing.appearance && reference.appearance) existing.appearance = reference.appearance
    if (!existing.slot && reference.slot) existing.slot = reference.slot
    if (visibility === 'featured') existing.visibility = visibility
    if (!existing.sourcePanelNumbers.includes(panelNumber)) {
      existing.sourcePanelNumbers.push(panelNumber)
    }
  }

  for (const reference of featuredCharacters) {
    addReference(reference, params.currentPanel.panelNumber ?? params.currentPanel.panelIndex + 1)
  }
  for (const panel of params.sameLocationPanels) {
    for (const reference of parsePanelCharacterReferences(panel.characters)) {
      addReference(reference, sourcePanelNumber(panel))
    }
  }

  return {
    featuredCharacters,
    presentCharacters: Array.from(byKey.values()).map((item) => ({
      ...item,
      sourcePanelNumbers: [...item.sourcePanelNumbers].sort((a, b) => a - b),
    })),
  }
}

function buildScreenPositionLocks(params: {
  currentPanel: PanelPromptPanel
  sameLocationPanels: StoryboardContinuityPanel[]
}): CharacterScreenPositionLock[] {
  const currentPanelNumber = params.currentPanel.panelNumber ?? params.currentPanel.panelIndex + 1
  const currentCharacters = parsePanelCharacterReferences(params.currentPanel.characters)
  const candidatePanels = [
    {
      panel: params.currentPanel,
      panelNumber: currentPanelNumber,
      distance: 0,
      shotBlocking: extractShotBlockingFromRules(params.currentPanel.photographyRules),
    },
    ...params.sameLocationPanels
      .filter((panel) => panel.id !== params.currentPanel.id)
      .map((panel) => ({
        panel,
        panelNumber: sourcePanelNumber(panel),
        distance: Math.abs(panel.panelIndex - params.currentPanel.panelIndex),
        shotBlocking: extractShotBlockingFromRules(panel.photographyRules),
      })),
  ].sort((left, right) => left.distance - right.distance || left.panelNumber - right.panelNumber)

  const locks = new Map<string, CharacterScreenPositionLock>()
  const addLock = (reference: PanelCharacterReference, position: ScreenPosition, slot: string | null, panelNumber: number) => {
    const key = characterKey(reference)
    if (!normalizeName(reference.name) && !reference.characterId) return
    const existing = locks.get(key)
    if (existing) {
      if (!existing.sourcePanelNumbers.includes(panelNumber)) {
        existing.sourcePanelNumbers.push(panelNumber)
        existing.sourcePanelNumbers.sort((left, right) => left - right)
      }
      return
    }
    locks.set(key, {
      name: reference.name,
      characterId: reference.characterId || null,
      appearanceId: reference.appearanceId || null,
      appearance: reference.appearance || null,
      position,
      positionLabel: screenPositionLabel(position),
      forbiddenPositionLabel: oppositeScreenPositionLabel(position),
      slot,
      sourcePanelNumbers: [panelNumber],
    })
  }

  for (const item of candidatePanels) {
    const characters = parsePanelCharacterReferences(item.panel.characters)
    for (const reference of characters) {
      const position = screenPositionFromText(reference.slot)
      if (position) addLock(reference, position, reference.slot || null, item.panelNumber)
    }

    for (const placement of collectShotBlockingCharacterPlacements(item.shotBlocking)) {
      const reference = characters.find((character) => normalizeName(character.name) === normalizeName(placement.characterName))
      if (!reference) continue
      const position = screenPositionFromText(placement.screenPosition)
      if (position) addLock(reference, position, placement.screenPosition, item.panelNumber)
    }
  }

  return Array.from(locks.values())
    .filter((lock) => currentCharacters.some((character) => {
      if (lock.characterId && character.characterId === lock.characterId) return true
      return normalizeName(lock.name) === normalizeName(character.name)
    }))
}

function buildSceneContinuityState(params: {
  panel: PanelPromptPanel
  storyboardPanels: StoryboardContinuityPanel[]
}) {
  const panelLocation = normalizeLocation(params.panel.location)
  const sameLocationPanels = panelLocation
    ? params.storyboardPanels.filter((panel) => normalizeLocation(panel.location) === panelLocation)
    : []
  const { featuredCharacters, presentCharacters } = buildCharacterContinuity({
    currentPanel: params.panel,
    sameLocationPanels,
  })
  const featuredKeys = new Set(featuredCharacters.map(characterKey))
  const nonFeaturedPresentCharacters = presentCharacters.filter((item) => {
    const key = item.characterId ? `id:${item.characterId}` : `name:${normalizeName(item.name)}`
    return !featuredKeys.has(key)
  })
  const hasNonFeaturedPresentCharacters = nonFeaturedPresentCharacters.length > 0
  const hasNoFeaturedCharacters = featuredCharacters.length === 0
  const screenPositionLocks = buildScreenPositionLocks({
    currentPanel: params.panel,
    sameLocationPanels,
  })

  return {
    scene_anchor_name: params.panel.location || null,
    inference_source: 'same_storyboard_same_location',
    featured_characters: featuredCharacters.map((item) => ({
      name: item.name,
      characterId: item.characterId || null,
      appearanceId: item.appearanceId || null,
      appearance: item.appearance || null,
      slot: item.slot || null,
    })),
    present_characters: presentCharacters,
    screen_position_locks: screenPositionLocks,
    non_featured_presence_policy: {
      required: hasNonFeaturedPresentCharacters || (hasNoFeaturedCharacters && presentCharacters.length > 0),
      allowed_visibility: ['edge', 'partial_body', 'hands', 'shoulder', 'back', 'reflection', 'silhouette', 'distant_blur'],
      offscreen_allowed: false,
    },
    environment_or_insert_policy: {
      maintain_present_characters: presentCharacters.length > 0,
      allow_subject_focus_without_character_removal: true,
    },
    scene_props: params.panel.props || '',
    ...previousAndNextSameLocationPanels({
      currentPanel: params.panel,
      sameLocationPanels,
    }),
  }
}

export function buildPanelPromptContext(params: {
  panel: PanelPromptPanel
  projectData: ProjectData
  referenceImageNotes?: string[]
  referenceImagesMap: NumberedReferenceImage[]
  storyboardPanels?: StoryboardContinuityPanel[]
}) {
  const panelCharacters = parsePanelCharacterReferences(params.panel.characters)
  const characterContexts = panelCharacters.map((reference) => {
    const character = findCharacterForStoryboardReference(
      params.projectData.characters || [],
      reference as StoryboardPanelCharacterReference,
    )
    if (!character) {
      return {
        name: reference.name,
        appearance: reference.appearance || null,
        description: '无角色外貌数据',
      }
    }

    const appearances = character.appearances || []
    const matchedAppearance = findAppearanceForStoryboardReference(
      appearances,
      reference as StoryboardPanelCharacterReference,
    ) || null

    return {
      name: character.name,
      characterId: character.id || reference.characterId || null,
      appearanceId: matchedAppearance?.id || reference.appearanceId || null,
      appearance: matchedAppearance?.changeReason || null,
      description: matchedAppearance ? pickAppearanceDescription(matchedAppearance) : '无角色外貌数据',
      slot: reference.slot || null,
    }
  })

  const photographyRules = parseJsonUnknown(params.panel.photographyRules)
  const photographyRuleRecord = photographyRules && typeof photographyRules === 'object' && !Array.isArray(photographyRules)
    ? photographyRules as Record<string, unknown>
    : {}
  const consistencyMetadataRecord = photographyRuleRecord.consistencyMetadata
    && typeof photographyRuleRecord.consistencyMetadata === 'object'
    && !Array.isArray(photographyRuleRecord.consistencyMetadata)
    ? photographyRuleRecord.consistencyMetadata as Record<string, unknown>
    : {}
  const cameraPlanSource = photographyRuleRecord.cameraPlan ?? consistencyMetadataRecord.cameraPlan
  const cameraPlanRecord = cameraPlanSource && typeof cameraPlanSource === 'object' && !Array.isArray(cameraPlanSource)
    ? cameraPlanSource as Record<string, unknown>
    : {}
  const shotBlocking = cameraPlanRecord.shotBlocking ?? photographyRuleRecord.shotBlocking ?? null

  const locationContext = (() => {
    if (!params.panel.location) return null
    const matchedLocation = (params.projectData.locations || []).find(
      (item) => item.name.toLowerCase() === params.panel.location!.toLowerCase(),
    )
    if (!matchedLocation) return null
    const selectedImage = (matchedLocation.images || []).find((item) => item.isSelected) || matchedLocation.images?.[0]
    return {
      name: matchedLocation.name,
      description: selectedImage?.description || null,
      spatial_profile: selectedImage && 'spatialProfileJson' in selectedImage ? selectedImage.spatialProfileJson ?? null : null,
    }
  })()

  return {
    panel: {
      panel_id: params.panel.id,
      shot_type: params.panel.shotType || '',
      camera_move: params.panel.cameraMove || '',
      description: params.panel.description || '',
      image_prompt: params.panel.imagePrompt || '',
      video_prompt: params.panel.videoPrompt || '',
      location: params.panel.location || '',
      characters: panelCharacters,
      source_text: params.panel.srtSegment || '',
      photography_rules: photographyRules,
      shot_blocking: shotBlocking,
      acting_notes: parseJsonUnknown(params.panel.actingNotes),
    },
    context: {
      character_appearances: characterContexts,
      location_reference: locationContext,
      scene_continuity_state: buildSceneContinuityState({
        panel: params.panel,
        storyboardPanels: params.storyboardPanels || [],
      }),
      reference_images: params.referenceImagesMap,
      additional_reference_images: (params.referenceImageNotes || []).map((note, index) => ({
        reference_image_order: index + 1,
        note,
      })),
    },
  }
}

export type PanelPromptContext = ReturnType<typeof buildPanelPromptContext>

function stringifyForPrompt(value: unknown): string {
  return JSON.stringify(value, null, 2)
}

function hasPromptValue(value: unknown): boolean {
  return value !== null && value !== undefined && value !== ''
}

export function buildPanelVisualDirectorPrompt(params: {
  promptContext: PanelPromptContext
  aspectRatio: string
  sourceText: string
  styleText: string
}): string {
  const panel = params.promptContext.panel
  const parts = [
    `把这个镜头画成一张 ${params.aspectRatio} 单张电影分镜图。优先执行“当前镜头执行层”的最终单帧调度；导演描述、动作描述、参考与连续性信息都只能服务于这个最终画面。`,
    buildFinalFrameExecutionPrompt(params.promptContext),
    panel.image_prompt ? `导演摄影指令：${panel.image_prompt}` : '',
    panel.description ? `镜头定格：${panel.description}` : '',
    panel.video_prompt ? `动态意图转为单帧定格：${panel.video_prompt}` : '',
    panel.shot_type || panel.camera_move
      ? `镜头语言：景别/镜头类型为 ${panel.shot_type || '未指定'}，运镜语义为 ${panel.camera_move || '未指定'}；单张图只表现运镜完成后的一个决定性瞬间。`
      : '',
    params.sourceText ? `原文剧情依据：${params.sourceText}` : '',
    hasPromptValue(panel.shot_blocking) ? `画面调度依据：${stringifyForPrompt(panel.shot_blocking)}` : '',
    hasPromptValue(panel.photography_rules) ? `摄影规则依据：${stringifyForPrompt(panel.photography_rules)}` : '',
    `画面风格：${params.styleText}`,
  ].filter((part) => part.trim().length > 0)

  return parts.join('\n')
}

export function buildPanelCompactReferenceContext(promptContext: PanelPromptContext): string {
  return stringifyForPrompt({
    panel_constraints: {
      shot_type: promptContext.panel.shot_type,
      camera_move: promptContext.panel.camera_move,
      location: promptContext.panel.location,
      characters: promptContext.panel.characters,
      source_text: promptContext.panel.source_text,
      shot_blocking: promptContext.panel.shot_blocking,
      acting_notes: promptContext.panel.acting_notes,
    },
    reference_usage_policy: [
      '角色参考只用于身份、脸型、发型、服装、体型和主要外观一致。',
      'scene_anchor 只锁定空间布局、背景锚点、入口出口、家具/物体相对位置、光线方向和色调氛围。',
      '场景必须按当前镜头重新取景，不照搬参考图构图。',
      'scene_continuity_state 用于保持同场景人物关系、道具关系和前后镜头连续性。',
    ],
    reference_and_continuity: promptContext.context,
  })
}
