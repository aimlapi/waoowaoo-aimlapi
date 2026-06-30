import type { NovelProjectData, NumberedReferenceImage } from './image-task-handler-shared'
import {
  findAppearanceForStoryboardReference,
  findCharacterForStoryboardReference,
  type StoryboardPanelCharacterReference,
} from '@/lib/storyboard-character-bindings'
import { parsePanelCharacterReferences } from './image-task-handler-shared'
import {
  pickStoryboardPrimarySceneImage,
  type StoryboardSceneReferencePolicy,
} from '@/lib/storyboard/scene-reference-policy'

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

type SceneGraph = {
  readonly source: 'location_reference.spatial_profile'
  readonly summary: string | null
  readonly anchors: readonly {
    readonly id: string
    readonly label: string
    readonly screenArea: string | null
    readonly depthLayer: string | null
    readonly relations: readonly string[]
  }[]
  readonly depth: readonly string[]
  readonly lighting: string | null
}

type CharacterGraph = {
  readonly references: readonly NumberedReferenceImage[]
  readonly characters: readonly {
    readonly id: string
    readonly name: string
    readonly appearance: string | null
    readonly description: string | null
    readonly referenceImage: string | null
  }[]
}

type PropGraphItem = {
  readonly id: string
  readonly visualDescription: string
  readonly source: 'panel.props' | 'panel.description'
}

type StillFrame = {
  readonly shot_scale: string | null
  readonly static_framing: string | null
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
    readonly SCENE_GRAPH: SceneGraph | null
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
  readonly propIds: readonly string[]
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
  const normalized = normalizeString(value)
  if (!normalized) return []
  return normalized.match(/[^。！？.!?；;\n]+[。！？.!?；;]?/gu)?.map((part) => part.trim()).filter(Boolean) || [normalized]
}

const VIDEO_TIME_PATTERN = /(?:video_prompt|视频提示|视频|运镜|镜头运动|duration|时长|fps|帧率|srtStart|srtEnd|sound|声音|音效|配乐|bgm|旁白|voiceover|continuityIn|continuityOut|转场|切入|切出|镜头从|镜头随后|随后|推轨|横向轨道|轨道|推进|后撤|摇移|跟拍|拉远|推近|crane|dolly|track|tracking|truck|pan shot|camera move|camera path|motion trail)/iu
const SPATIAL_LAYOUT_PATTERN = /(?:空间板槽位|空间布局|房间布局|室内布局|门窗|北墙|南墙|东墙|西墙|通道方向|前中后景结构|窗在|门在|window on|door on|room layout|spatial layout|north wall|south wall|east wall|west wall)/iu
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

function readSpatialProfile(input: {
  readonly panel: StoryboardStillPromptPanel
  readonly projectData: NovelProjectData
  readonly sceneReferencePolicy?: StoryboardSceneReferencePolicy | null
}): unknown | null {
  if (!input.panel.location) return null
  const matchedLocation = (input.projectData.locations || []).find(
    (item) => item.name.toLowerCase() === input.panel.location!.toLowerCase(),
  )
  const selectedImage = pickStoryboardPrimarySceneImage(matchedLocation, input.sceneReferencePolicy)
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

function buildSceneGraph(spatialProfile: unknown): SceneGraph | null {
  const profile = toRecord(spatialProfile)
  if (!profile) return null
  const anchorsRaw = Array.isArray(profile.anchors) ? profile.anchors : []
  const anchors = anchorsRaw.map((anchor) => {
    const record = toRecord(anchor) || {}
    return {
      id: normalizeString(record.id) || normalizeString(record.label) || 'anchor',
      label: normalizeString(record.label) || normalizeString(record.id) || 'scene anchor',
      screenArea: compactText(record.screenArea, 80),
      depthLayer: compactText(record.depthLayer, 80),
      relations: readStringArray(record.spatialRelations).slice(0, 3),
    }
  }).slice(0, 6)
  return {
    source: 'location_reference.spatial_profile',
    summary: compactText(profile.sceneSummary, 220),
    anchors,
    depth: readStringArray(profile.depthLayout).slice(0, 4),
    lighting: compactText(profile.lightingDirection, 160),
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
      return {
        id: character?.id || reference.characterId || reference.name,
        name: character?.name || reference.name,
        appearance: matchedAppearance?.changeReason || reference.appearance || null,
        description: matchedAppearance ? pickAppearanceDescription(matchedAppearance) : compactText(reference.appearance, 120),
        referenceImage: referenceImage?.image_no || null,
      }
    }),
  }
}

function hasPattern(text: string, pattern: RegExp): boolean {
  return pattern.test(text)
}

function buildPropGraph(panel: StoryboardStillPromptPanel): readonly PropGraphItem[] {
  const propText = [panel.props, panel.description].map((item) => normalizeString(item)).filter(Boolean).join(' ')
  const props: PropGraphItem[] = []
  const addProp = (item: PropGraphItem) => {
    if (!props.some((prop) => prop.id === item.id)) props.push(item)
  }
  if (hasPattern(propText, /粉红|荧色药液|高脚杯|酒杯|pink liquid|wine glass/iu)) {
    addProp({ id: 'pink_wine_glass', visualDescription: 'single stemmed glass containing neon pink liquid', source: 'panel.description' })
  }
  if (hasPattern(propText, /菜单|焦痕|menu|scorched/iu)) {
    addProp({ id: 'scorched_paper_menu', visualDescription: 'scorched paper menu on the table', source: 'panel.description' })
  }
  if (hasPattern(propText, /徽章|飞鹰|eagle badge/iu)) {
    addProp({ id: 'golden_eagle_badge', visualDescription: 'small golden eagle badge', source: 'panel.description' })
  }
  if (hasPattern(propText, /项圈|脖环|collar/iu)) {
    addProp({ id: 'heart_detection_collar', visualDescription: 'heart-detection collar around the neck', source: 'panel.description' })
  }
  if (hasPattern(propText, /红外|扫描线|雷达|infrared|scan line/iu)) {
    addProp({ id: 'red_infrared_scan_lines', visualDescription: 'red infrared scan lines as a temporary visual effect', source: 'panel.description' })
  }
  if (props.length > 0) return props
  const directProps = compactText(panel.props, 260)
  return directProps ? [{ id: 'panel_props', visualDescription: directProps, source: 'panel.props' }] : []
}

export function sanitizePanelForStillImagePrompt(panel: StoryboardStillPromptPanel): SanitizedStillPanel {
  const cameraPlan = readCameraPlan(panel)
  const staticFraming = sanitizeStaticFraming([
    cameraPlan.shotScale,
    cameraPlan.composition,
    cameraPlan.cameraPosition,
    cameraPlan.axisAndEyeline,
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
    characters: parsePanelCharacterReferences(panel.characters),
    propIds: buildPropGraph(panel).map((prop) => prop.id),
  }
}

export function buildStoryboardStillPromptFacts(input: {
  readonly panel: StoryboardStillPromptPanel
  readonly projectData: NovelProjectData
  readonly referenceImagesMap: readonly NumberedReferenceImage[]
  readonly sceneReferencePolicy?: StoryboardSceneReferencePolicy | null
}): StoryboardStillPromptFacts {
  const sanitized = sanitizePanelForStillImagePrompt(input.panel)
  const propGraph = buildPropGraph(input.panel)
  return {
    panel: {
      panel_id: sanitized.panelId,
      shot_type: sanitized.shotScale,
      still_frame: {
        shot_scale: sanitized.shotScale,
        static_framing: sanitized.staticFraming,
        visible_subjects: sanitized.characters.map((character) => character.name),
        action: sanitized.action,
        emotion: sanitized.emotion,
        visible_props: sanitized.propIds,
        crop_priority: 'Keep the subject and key props readable inside a single still frame.',
      },
    },
    context: {
      reference_images: input.referenceImagesMap,
      SCENE_GRAPH: buildSceneGraph(readSpatialProfile({
        panel: input.panel,
        projectData: input.projectData,
        sceneReferencePolicy: input.sceneReferencePolicy,
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
    'The scene layout has exactly one source of truth: SCENE_GRAPH. Do not infer, rotate, mirror, or complete the room layout from shot text.',
    '',
    'SCENE_GRAPH',
    jsonBlock(input.facts.context.SCENE_GRAPH),
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
