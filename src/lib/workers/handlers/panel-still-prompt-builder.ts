import type { NovelProjectData, NumberedReferenceImage } from './image-task-handler-shared'
import {
  findAppearanceForStoryboardReference,
  findCharacterForStoryboardReference,
  type StoryboardPanelCharacterReference,
} from '@/lib/storyboard-character-bindings'
import { parsePanelCharacterReferences } from './image-task-handler-shared'

const STILL_TEXT_LIMIT = 420

export type StoryboardStillPromptPanel = {
  readonly id: string
  readonly shotType: string | null
  readonly cameraMove: string | null
  readonly description: string | null
  readonly imagePrompt: string | null
  readonly videoPrompt: string | null
  readonly location: string | null
  readonly characters: string | null
  readonly props?: string | null
  readonly srtSegment: string | null
  readonly photographyRules: string | null
  readonly actingNotes: string | null
}

type GlobalSceneLock = {
  readonly source: 'location_reference.spatial_profile'
  readonly summary: string | null
  readonly lighting: string | null
  readonly stable_background: readonly string[]
}

type SceneAssetOmission = {
  readonly name: string
  readonly kind: 'character' | 'prop'
  readonly reason: string
}

type LocationZone = {
  readonly source: 'panel.photography_rules.scene_zone'
  readonly location_name: string | null
  readonly zone_id: string | null
  readonly zone_name: string | null
  readonly overall_position: string | null
  readonly must_include: readonly string[]
  readonly subject_position: string | null
  readonly camera_position: string | null
  readonly screen_composition: string | null
  readonly character_placements: readonly {
    readonly character_name: string
    readonly subject_position: string | null
    readonly facing: string | null
    readonly eyeline: string | null
  }[]
  readonly omitted_scene_assets: readonly SceneAssetOmission[]
}

type CharacterGraph = {
  readonly references: readonly NumberedReferenceImage[]
  readonly characters: readonly {
    readonly id: string
    readonly name: string
    readonly appearance: string | null
    readonly description: string | null
    readonly referenceImage: string | null
    readonly identity_lock: readonly string[]
    readonly wardrobe_lock: string | null
  }[]
}

type PropGraphItem = {
  readonly id: string
  readonly name: string
  readonly visualDescription: string
  readonly referenceImage: string | null
  readonly source: 'panel.props'
}

type StillFrame = {
  readonly shot_scale: string | null
  readonly static_framing: string | null
  readonly shot_priority: readonly string[]
  readonly explicit_image_prompt: string | null
  readonly visible_subjects: readonly string[]
  readonly action: string | null
  readonly emotion: string | null
  readonly visible_props: readonly string[]
  readonly crop_priority: string
}

export type StoryboardStillPromptFacts = {
  readonly panel: {
    readonly panel_id: string
    readonly shot_type: string | null
    readonly still_frame: StillFrame
  }
  readonly context: {
    readonly reference_images: readonly NumberedReferenceImage[]
    readonly LOCATION_ZONE: LocationZone | null
    readonly GLOBAL_SCENE_LOCK: GlobalSceneLock | null
    readonly CHARACTER_GRAPH: CharacterGraph
    readonly PROP_GRAPH: readonly PropGraphItem[]
    readonly NEGATIVE: readonly string[]
  }
}

type SanitizedStillPanel = {
  readonly panelId: string
  readonly shotScale: string | null
  readonly staticFraming: string | null
  readonly action: string | null
  readonly emotion: string | null
  readonly characters: readonly StoryboardPanelCharacterReference[]
  readonly propNames: readonly string[]
  readonly shotPriority: readonly string[]
}

function normalizeString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

function compactText(value: unknown, maxLength = STILL_TEXT_LIMIT): string | null {
  const normalized = normalizeString(value).replace(/\s+/g, ' ')
  if (!normalized) return null
  if (normalized.length <= maxLength) return normalized
  return `${normalized.slice(0, maxLength).trim()}...`
}

function staticizeStillText(value: string): string {
  return value
    .replace(/\bdynamic\b/giu, 'frozen')
    .replace(/\bswinging\s+(?:wildly|violently)\b/giu, 'tilted off-center')
    .replace(/\bswinging\b/giu, 'tilted')
    .replace(/\bslams?\s+(.+?)\s+down\s+onto\b/giu, 'holds $1 pressed onto')
    .replace(/\bflinches\b/giu, 'is recoiling')
    .replace(/\bbold\s+speed\s+lines\b/giu, 'bold impact lines')
    .replace(/剧烈晃荡/gu, '略微倾斜')
    .replace(/猛烈晃荡/gu, '略微倾斜')
    .replace(/猛地冲到/gu, '站在')
    .replace(/狠狠拍在/gu, '手掌压在')
    .replace(/怒吼/gu, '张口怒视')
    .replace(/唾沫横飞/gu, '面部紧绷')
}

function toRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null
}

function parseJsonRecord(value: string | null | undefined): Record<string, unknown> | null {
  const raw = normalizeString(value)
  if (!raw) return null
  try {
    return toRecord(JSON.parse(raw))
  } catch {
    return null
  }
}

function splitSentences(value: unknown): string[] {
  const normalized = staticizeStillText(normalizeString(value))
  if (!normalized) return []
  return normalized.match(/[^。！？.!?；;\n]+[。！？.!?；;]?/gu)?.map((part) => part.trim()).filter(Boolean) || [normalized]
}

const VIDEO_TIME_PATTERN = /(?:video_prompt|视频提示|视频|运镜|镜头运动|duration|时长|fps|帧率|srtStart|srtEnd|sound|声音|音效|配乐|bgm|旁白|voiceover|continuityIn|continuityOut|转场|切入|切出|镜头从|镜头随后|随后|推轨|横向轨道|轨道|推进|后撤|摇移|跟拍|拉远|推近|crane|dolly|track|tracking|truck|pan shot|camera move|camera path|motion trail|camera\s+(?:push(?:es|ing)?|pull(?:s|ing)?|track(?:s|ing)?|move(?:s|ing)?|pan(?:s|ning)?|tilt(?:s|ing)?|doll(?:y|ies|ying)))/iu
const SPATIAL_LAYOUT_PATTERN = /(?:空间板槽位|空间布局|房间布局|室内布局|门窗|北墙|南墙|东墙|西墙|通道方向|前中后景结构|窗在|门在|墙在|窗边|门边|左侧窗|右侧窗|左侧门|右侧门|window on|window is on|door on|door is on|wall on|wall is on|left side|right side|room layout|spatial layout|north wall|south wall|east wall|west wall)/iu
const STYLE_OR_NEGATIVE_PATTERN = /(?:style bible|风格|负向约束|negative prompt|hard ban|watermark|no subtitles|no text)/iu

function sanitizeStillAction(value: unknown, maxLength = STILL_TEXT_LIMIT): string | null {
  const kept = splitSentences(value)
    .filter((part) => !VIDEO_TIME_PATTERN.test(part))
    .filter((part) => !SPATIAL_LAYOUT_PATTERN.test(part))
    .filter((part) => !STYLE_OR_NEGATIVE_PATTERN.test(part))
  return compactText(kept.join(' '), maxLength)
}

function sanitizeStaticFraming(value: unknown, maxLength = 240): string | null {
  const kept = splitSentences(value)
    .filter((part) => !VIDEO_TIME_PATTERN.test(part))
    .filter((part) => !SPATIAL_LAYOUT_PATTERN.test(part))
    .filter((part) => !STYLE_OR_NEGATIVE_PATTERN.test(part))
  return compactText(kept.join(' '), maxLength)
}

function readCameraPlan(panel: StoryboardStillPromptPanel): Record<string, unknown> {
  const rules = parseJsonRecord(panel.photographyRules)
  const consistencyMetadata = toRecord(rules?.consistencyMetadata)
  return toRecord(rules?.cameraPlan) || toRecord(consistencyMetadata?.cameraPlan) || {}
}

function readPhotographyRules(panel: StoryboardStillPromptPanel): Record<string, unknown> {
  return parseJsonRecord(panel.photographyRules) || {}
}

function readSpatialProfile(input: {
  readonly panel: StoryboardStillPromptPanel
  readonly projectData: NovelProjectData
}): unknown | null {
  if (!input.panel.location) return null
  const matchedLocation = (input.projectData.locations || []).find(
    (item) => item.name.toLowerCase() === input.panel.location!.toLowerCase(),
  )
  const selectedImage = (matchedLocation?.images || []).find((item) => item.isSelected) || matchedLocation?.images?.[0]
  return selectedImage?.spatialProfileJson ?? null
}

function readStringArray(value: unknown): readonly string[] {
  if (!value) return []
  if (Array.isArray(value)) return value.map((item) => normalizeString(item)).filter(Boolean)
  if (typeof value === 'object') {
    return Object.values(value).map((item) => normalizeString(item)).filter(Boolean)
  }
  const text = normalizeString(value)
  return text ? [text] : []
}

function buildGlobalSceneLock(spatialProfile: unknown): GlobalSceneLock | null {
  const profile = toRecord(spatialProfile)
  if (!profile) return null
  const anchorsRaw = Array.isArray(profile.anchors) ? profile.anchors : []
  const stableBackground = anchorsRaw.map((anchor) => {
    const record = toRecord(anchor) || {}
    return normalizeString(record.label) || normalizeString(record.id)
  }).slice(0, 6)
    .filter(Boolean)
  return {
    source: 'location_reference.spatial_profile',
    summary: compactText(profile.sceneSummary, 220),
    lighting: compactText(profile.lightingDirection, 160),
    stable_background: stableBackground,
  }
}

function readSceneAssetOmissions(value: unknown): readonly SceneAssetOmission[] {
  if (!Array.isArray(value)) return []
  return value.map((item) => {
    const record = toRecord(item) || {}
    const kind = normalizeString(record.kind)
    if (kind !== 'character' && kind !== 'prop') return null
    const name = normalizeString(record.name)
    const reason = compactText(record.reason, 160)
    if (!name || !reason) return null
    return { name, kind, reason }
  }).filter((item): item is SceneAssetOmission => item !== null)
}

function buildLocationZone(panel: StoryboardStillPromptPanel): LocationZone | null {
  const rules = readPhotographyRules(panel)
  const sceneZone = toRecord(rules.sceneZone)
  const shotBlocking = toRecord(rules.shotBlocking)
  if (!sceneZone && !shotBlocking) return null
  const characterPlacementsRaw = Array.isArray(shotBlocking?.characterPlacements)
    ? shotBlocking.characterPlacements
    : []
  const characterPlacements = characterPlacementsRaw.map((item) => {
    const record = toRecord(item) || {}
    const characterName = normalizeString(record.characterName)
    if (!characterName) return null
    return {
      character_name: characterName,
      subject_position: compactText(record.subjectPosition, 120),
      facing: compactText(record.facing, 120),
      eyeline: compactText(record.eyeline, 120),
    }
  }).filter((item): item is LocationZone['character_placements'][number] => item !== null)

  return {
    source: 'panel.photography_rules.scene_zone',
    location_name: panel.location,
    zone_id: compactText(sceneZone?.sceneZoneId, 120),
    zone_name: compactText(sceneZone?.name, 120),
    overall_position: compactText(sceneZone?.overallPosition, 220),
    must_include: readStringArray(sceneZone?.fixedAnchors).slice(0, 6),
    subject_position: compactText(shotBlocking?.subjectPosition, 180),
    camera_position: compactText(shotBlocking?.cameraPosition, 160),
    screen_composition: sanitizeStaticFraming(shotBlocking?.screenComposition, 220),
    character_placements: characterPlacements,
    omitted_scene_assets: readSceneAssetOmissions(rules.omittedSceneAssets),
  }
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
  readonly descriptions?: string | null
  readonly description?: string | null
  readonly selectedIndex?: number | null
}): string | null {
  const descriptions = parseDescriptionList(appearance.descriptions || null)
  if (descriptions.length > 0) {
    const selectedIndex = typeof appearance.selectedIndex === 'number' ? appearance.selectedIndex : 0
    return descriptions[selectedIndex] || descriptions[0] || null
  }
  return compactText(appearance.description, 260)
}

function buildCharacterGraph(input: {
  readonly panel: StoryboardStillPromptPanel
  readonly projectData: NovelProjectData
  readonly referenceImagesMap: readonly NumberedReferenceImage[]
}): CharacterGraph {
  const panelCharacters = parsePanelCharacterReferences(input.panel.characters)
  const characterReferences = input.referenceImagesMap.filter((item) => item.role === 'character')
  return {
    references: characterReferences,
    characters: panelCharacters.map((reference) => {
      const character = findCharacterForStoryboardReference(
        input.projectData.characters || [],
        reference as StoryboardPanelCharacterReference,
      )
      const matchedAppearance = character
        ? findAppearanceForStoryboardReference(
          character.appearances || [],
          reference as StoryboardPanelCharacterReference,
        ) || null
        : null
      const referenceImage = characterReferences.find((item) =>
        item.name === reference.name && (!reference.appearance || item.appearance === reference.appearance),
      )
      const description = matchedAppearance ? pickAppearanceDescription(matchedAppearance) : compactText(reference.appearance, 120)
      return {
        id: character?.id || reference.characterId || reference.name,
        name: character?.name || reference.name,
        appearance: matchedAppearance?.changeReason || reference.appearance || null,
        description,
        referenceImage: referenceImage?.image_no || null,
        identity_lock: [
          'same face as reference image',
          'same hairstyle silhouette',
          'same body type and age range',
          'do not change ethnicity, hairstyle, outfit, or core facial structure',
        ],
        wardrobe_lock: description,
      }
    }),
  }
}

function parsePanelPropNames(value: string | null | undefined): readonly string[] {
  const raw = normalizeString(value)
  if (!raw) return []
  try {
    const parsed = JSON.parse(raw) as unknown
    if (Array.isArray(parsed)) {
      return parsed.map((item) => normalizeString(item)).filter(Boolean)
    }
  } catch {
    // Plain text props are still explicit panel data; props are never inferred from description text.
  }
  return raw
    .split(/[,，、/]/u)
    .map((item) => item.trim())
    .filter(Boolean)
}

function resolveProjectPropDescription(input: {
  readonly projectData: NovelProjectData
  readonly propName: string
}): string {
  const propAsset = (input.projectData.props || []).find((prop) => prop.name === input.propName)
  const selectedImage = (propAsset?.images || []).find((image) => image.isSelected) || propAsset?.images?.[0]
  const requirement = (input.projectData.editAssetRequirements || []).find((item) =>
    item.kind === 'prop' && item.name === input.propName)
  return compactText(
    selectedImage?.description || propAsset?.summary || requirement?.description || input.propName,
    260,
  ) || input.propName
}

function buildPropGraph(input: {
  readonly panel: StoryboardStillPromptPanel
  readonly projectData: NovelProjectData
  readonly referenceImagesMap: readonly NumberedReferenceImage[]
}): readonly PropGraphItem[] {
  const propNames = parsePanelPropNames(input.panel.props)
  return propNames.map((propName) => {
    const referenceImage = input.referenceImagesMap.find((item) =>
      item.role === 'prop' && item.name === propName)
    return {
      id: propName,
      name: propName,
      visualDescription: resolveProjectPropDescription({
        projectData: input.projectData,
        propName,
      }),
      referenceImage: referenceImage?.image_no || null,
      source: 'panel.props',
    }
  })
}

function buildShotPriority(input: {
  readonly panel: StoryboardStillPromptPanel
  readonly visibleSubjects: readonly string[]
  readonly visibleProps: readonly string[]
  readonly omittedSceneAssets: readonly SceneAssetOmission[]
}): readonly string[] {
  const imagePrompt = sanitizeStillAction(input.panel.imagePrompt, 360)
  const formatOmissionReason = (reason: string) => /[。.!?！？]$/u.test(reason) ? reason : `${reason}.`
  const priorities = [
    imagePrompt ? `Primary image intent: ${imagePrompt}` : null,
    input.visibleSubjects.length > 0
      ? `Visible characters must read clearly: ${input.visibleSubjects.join(', ')}.`
      : null,
    input.visibleProps.length > 0
      ? `Visible props must be present and readable: ${input.visibleProps.join(', ')}.`
      : null,
    ...input.omittedSceneAssets.map((asset) =>
      `Do not show ${asset.kind} "${asset.name}" because: ${formatOmissionReason(asset.reason)}`),
    'Freeze any action wording into a single readable still state; no motion blur, no speed lines unless explicitly requested as graphic style.',
  ].filter((item): item is string => item !== null)
  return priorities
}

export function sanitizePanelForStillImagePrompt(panel: StoryboardStillPromptPanel): SanitizedStillPanel {
  const cameraPlan = readCameraPlan(panel)
  const locationZone = buildLocationZone(panel)
  const characters = parsePanelCharacterReferences(panel.characters)
  const propNames = parsePanelPropNames(panel.props)
  const staticFraming = sanitizeStaticFraming([
    cameraPlan.shotScale,
    cameraPlan.composition,
    cameraPlan.cameraPosition,
    cameraPlan.axisAndEyeline,
    locationZone?.screen_composition,
    locationZone?.camera_position,
  ].map((item) => normalizeString(item)).filter(Boolean).join(' '))
  const action = sanitizeStillAction(panel.description)
  const emotion = sanitizeStillAction([
    cameraPlan.emotionalEffect,
    panel.actingNotes,
  ].map((item) => normalizeString(item)).filter(Boolean).join(' '), 180)
  return {
    panelId: panel.id,
    shotScale: compactText(cameraPlan.shotScale || panel.shotType, 120),
    staticFraming,
    action,
    emotion,
    characters,
    propNames,
    shotPriority: buildShotPriority({
      panel,
      visibleSubjects: characters.map((character) => character.name),
      visibleProps: propNames,
      omittedSceneAssets: locationZone?.omitted_scene_assets || [],
    }),
  }
}

export function buildStoryboardStillPromptFacts(input: {
  readonly panel: StoryboardStillPromptPanel
  readonly projectData: NovelProjectData
  readonly referenceImagesMap: readonly NumberedReferenceImage[]
}): StoryboardStillPromptFacts {
  const sanitized = sanitizePanelForStillImagePrompt(input.panel)
  const propGraph = buildPropGraph(input)
  return {
    panel: {
      panel_id: sanitized.panelId,
      shot_type: sanitized.shotScale,
      still_frame: {
        shot_scale: sanitized.shotScale,
        static_framing: sanitized.staticFraming,
        shot_priority: sanitized.shotPriority,
        explicit_image_prompt: sanitizeStillAction(input.panel.imagePrompt, 360),
        visible_subjects: sanitized.characters.map((character) => character.name),
        action: sanitized.action,
        emotion: sanitized.emotion,
        visible_props: sanitized.propNames,
        crop_priority: 'Keep the subject and key props readable inside a single still frame.',
      },
    },
    context: {
      reference_images: input.referenceImagesMap,
      LOCATION_ZONE: buildLocationZone(input.panel),
      GLOBAL_SCENE_LOCK: buildGlobalSceneLock(readSpatialProfile({
        panel: input.panel,
        projectData: input.projectData,
      })),
      CHARACTER_GRAPH: buildCharacterGraph(input),
      PROP_GRAPH: propGraph,
      NEGATIVE: [
        'no subtitles',
        'no text',
        'no labels',
        'no watermark',
        'no motion trails',
        'no camera path visualization',
        'no duplicated props',
      ],
    },
  }
}

function jsonBlock(value: unknown): string {
  return JSON.stringify(value, null, 2)
}

export function buildStoryboardStillPrompt(input: {
  readonly aspectRatio: string
  readonly facts: StoryboardStillPromptFacts
}): string {
  return [
    'GLOBAL TASK',
    'Generate one still storyboard frame. This is not a video clip.',
    `Aspect ratio: ${input.aspectRatio}`,
    '',
    'BOUNDARY RULES',
    'Use only single-frame visual facts. Do not include camera movement, duration, fps, subtitles, SRT timing, video-generation text, continuity text, or motion-path language.',
    'SHOT_PRIORITY is the highest authority for this panel. Style and scene context must support it, never replace it.',
    'Freeze action language into the visible result state of one frame. Do not create motion blur, repeated limbs, speed trails, or animation smear.',
    'The local scene area has exactly one source of truth: LOCATION_ZONE. GLOBAL_SCENE_LOCK is only a light continuity reference.',
    '',
    'SHOT_PRIORITY',
    jsonBlock(input.facts.panel.still_frame.shot_priority),
    '',
    'LOCATION_ZONE',
    jsonBlock(input.facts.context.LOCATION_ZONE),
    '',
    'GLOBAL_SCENE_LOCK',
    jsonBlock(input.facts.context.GLOBAL_SCENE_LOCK),
    '',
    'CHARACTER_GRAPH',
    jsonBlock(input.facts.context.CHARACTER_GRAPH),
    '',
    'PROP_GRAPH',
    jsonBlock(input.facts.context.PROP_GRAPH),
    '',
    'REFERENCE_IMAGES',
    jsonBlock(input.facts.context.reference_images),
    '',
    'STILL_FRAME',
    jsonBlock(input.facts.panel.still_frame),
    '',
    'NEGATIVE',
    input.facts.context.NEGATIVE.join(', '),
  ].join('\n')
}
