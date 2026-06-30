import type { EditScriptStyleBible } from '@/lib/edit-script/types'
import {
  findAppearanceForStoryboardReference,
  findCharacterForStoryboardReference,
  type StoryboardPanelCharacterReference,
} from '@/lib/storyboard-character-bindings'
import {
  parsePanelCharacterReferences,
  type NovelProjectData,
  type NumberedReferenceImage,
} from './image-task-handler-shared'

const GRID_TEXT_LIMIT = 420
const GRID_LONG_TEXT_LIMIT = 760
const GRID_CELL_POSITIONS = ['top_left', 'top_right', 'bottom_left', 'bottom_right'] as const

export type StoryboardGridPromptPanel = {
  readonly id: string
  readonly storyboardId: string
  readonly panelIndex: number
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
  readonly summaries: readonly string[]
  readonly anchors: readonly {
    readonly id: string
    readonly label: string
    readonly screenArea: string | null
    readonly depthLayer: string | null
    readonly relations: readonly string[]
  }[]
  readonly depth: readonly string[]
  readonly lighting: readonly string[]
}

type BlockingState = {
  readonly characterSideLocks: readonly string[]
  readonly sharedRelationships: readonly string[]
  readonly continuityRules: readonly string[]
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
  readonly ownerOrLocation: string
  readonly persistenceRule: string
  readonly duplicationRule: string
  readonly allowedStateChange: string
}

type PropGraph = readonly PropGraphItem[]

export type StoryboardGridPromptCell = {
  readonly cell_index: number
  readonly cell_position: typeof GRID_CELL_POSITIONS[number]
  readonly panel_id: string
  readonly shot_delta: {
    readonly shot_scale: string | null
    readonly camera_framing: string | null
    readonly visible_subjects: readonly string[]
    readonly action: string | null
    readonly emotion: string | null
    readonly temporary_visual_effect: string | null
    readonly visible_persistent_props: readonly string[]
    readonly safe_crop_emphasis: string
  }
}

export type StoryboardGridPromptFacts = {
  readonly grid: {
    readonly mode: '2x2'
    readonly source_video_block_id: string
    readonly safe_crop_rules: readonly string[]
    readonly cells: readonly StoryboardGridPromptCell[]
  }
  readonly context: {
    readonly reference_images: readonly NumberedReferenceImage[]
    readonly SCENE_GRAPH: SceneGraph | null
    readonly BLOCKING_STATE: BlockingState
    readonly CHARACTER_GRAPH: CharacterGraph
    readonly PROP_GRAPH: PropGraph
    readonly STYLE: readonly string[]
    readonly NEGATIVE: readonly string[]
  }
}

type CharacterAppearance = {
  readonly name: string
  readonly characterId: string | null
  readonly appearance: string | null
  readonly description: string | null
}

type SanitizedPanel = {
  readonly panelId: string
  readonly panelIndex: number
  readonly shotScale: string | null
  readonly cameraFraming: string | null
  readonly action: string | null
  readonly sourceAction: string | null
  readonly emotion: string | null
  readonly temporaryVisualEffect: string | null
  readonly characters: readonly StoryboardPanelCharacterReference[]
  readonly propText: string | null
  readonly allActionText: string
}

function normalizeString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

function compactText(value: unknown, maxLength = GRID_TEXT_LIMIT): string | null {
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

function compactJsonValue(value: unknown, maxLength = GRID_TEXT_LIMIT): string | null {
  if (value === undefined || value === null || value === '') return null
  if (typeof value === 'string') return compactText(value, maxLength)
  try {
    return compactText(JSON.stringify(value), maxLength)
  } catch {
    return null
  }
}

const SPATIAL_SENTENCE_PATTERN = /(?:空间板槽位|空间|布局|房间|室内|场景板|门窗|窗|门|墙|北墙|南墙|东墙|西墙|通道|走廊|入口|出口|家具|卡座位置|卡座|前景|中景|背景|近处|远处|尽头|左侧|右侧|左边|右边|深处|窗外|window|door|wall|north wall|south wall|east wall|west wall|room|layout|spatial|corridor|hallway|entrance|exit|furniture|booth|foreground|midground|background|left side|right side|far end|back of the room)/iu
const VIDEO_OR_SOUND_PATTERN = /(?:video_prompt|视频提示|视频|duration|fps|sound|声音|音效|配乐|bgm|旁白|voiceover|continuityIn|continuityOut|转场|切入|切出|镜头从|镜头随着|镜头随后|随后|过程|运镜|推轨|轨道|横向轨道|轨道滑移|升降|摇移|推进|后撤|跟拍|推拉|拉远|推近|crane|dolly|track|tracking|horizontal track|pan shot|vertical pan|camera move|camera path|motion path|sliding movement)/iu
const STYLE_PATTERN = /(?:style bible|风格|画面滤镜|负向约束|negative prompt|hard ban|watermark|photorealistic|live action)/iu

function splitSentences(value: unknown): string[] {
  const normalized = normalizeString(value)
  if (!normalized) return []
  return normalized.match(/[^。！？.!?；;\n]+[。！？.!?；;]?/gu)?.map((part) => part.trim()).filter(Boolean) || [normalized]
}

function sanitizeActionText(value: unknown, maxLength = GRID_TEXT_LIMIT): string | null {
  const kept = splitSentences(value)
    .filter((part) => !SPATIAL_SENTENCE_PATTERN.test(part))
    .filter((part) => !VIDEO_OR_SOUND_PATTERN.test(part))
    .filter((part) => !STYLE_PATTERN.test(part))
  return compactText(kept.join(' '), maxLength)
}

function sanitizeCameraText(value: unknown, maxLength = 220): string | null {
  const kept = splitSentences(value)
    .filter((part) => !SPATIAL_SENTENCE_PATTERN.test(part))
    .filter((part) => !VIDEO_OR_SOUND_PATTERN.test(part))
    .filter((part) => !STYLE_PATTERN.test(part))
  return compactText(kept.join(' '), maxLength)
}

function sanitizeStaticStyleText(value: unknown, maxLength = 180): string | null {
  const kept = splitSentences(value)
    .filter((part) => !VIDEO_OR_SOUND_PATTERN.test(part))
    .filter((part) => !STYLE_PATTERN.test(part))
  return compactText(kept.join(' '), maxLength)
}

function sanitizeNegativeText(value: unknown, maxLength = 220): string | null {
  const kept = splitSentences(value)
    .filter((part) => !VIDEO_OR_SOUND_PATTERN.test(part))
  return compactText(kept.join(' '), maxLength)
}

function readCameraPlan(panel: StoryboardGridPromptPanel): Record<string, unknown> {
  const rules = parseJsonRecord(panel.photographyRules)
  const consistencyMetadata = toRecord(rules?.consistencyMetadata)
  return toRecord(rules?.cameraPlan) || toRecord(consistencyMetadata?.cameraPlan) || {}
}

function collectPanelText(panel: StoryboardGridPromptPanel): string {
  return [
    panel.description,
    panel.srtSegment,
    panel.imagePrompt,
    panel.props,
    compactJsonValue(panel.photographyRules, GRID_LONG_TEXT_LIMIT),
  ].map((item) => normalizeString(item)).filter(Boolean).join(' ')
}

function pickAppearanceDescription(appearance: {
  readonly descriptions?: string | null
  readonly description?: string | null
  readonly selectedIndex?: number | null
}): string | null {
  const descriptions = (() => {
    const raw = normalizeString(appearance.descriptions)
    if (!raw) return []
    try {
      const parsed = JSON.parse(raw)
      return Array.isArray(parsed)
        ? parsed.filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
        : []
    } catch {
      return []
    }
  })()
  if (descriptions.length > 0) {
    const selectedIndex = typeof appearance.selectedIndex === 'number' ? appearance.selectedIndex : 0
    return compactText(descriptions[selectedIndex] || descriptions[0], 260)
  }
  return compactText(appearance.description, 260)
}

function buildCharacterAppearances(input: {
  readonly panels: readonly StoryboardGridPromptPanel[]
  readonly projectData: NovelProjectData
}): CharacterAppearance[] {
  const output = new Map<string, CharacterAppearance>()
  for (const panel of input.panels) {
    for (const reference of parsePanelCharacterReferences(panel.characters)) {
      const character = findCharacterForStoryboardReference(
        input.projectData.characters || [],
        reference,
      )
      const matchedAppearance = character
        ? findAppearanceForStoryboardReference(character.appearances || [], reference)
        : null
      const name = character?.name || reference.name
      const key = `${character?.id || reference.characterId || name}:${matchedAppearance?.id || reference.appearanceId || reference.appearance || ''}`
      if (output.has(key)) continue
      output.set(key, {
        name,
        characterId: character?.id || reference.characterId || null,
        appearance: matchedAppearance?.changeReason || reference.appearance || null,
        description: matchedAppearance ? pickAppearanceDescription(matchedAppearance) : null,
      })
    }
  }
  return Array.from(output.values())
}

export function buildSceneGraph(spatialProfile: unknown): SceneGraph | null {
  const record = toRecord(spatialProfile)
  if (!record) {
    const text = compactJsonValue(spatialProfile)
    return text
      ? {
          source: 'location_reference.spatial_profile',
          summaries: [text],
          anchors: [],
          depth: [],
          lighting: [],
        }
      : null
  }

  const rawAnchors: Array<SceneGraph['anchors'][number] | null> = Array.isArray(record.anchors)
    ? record.anchors
      .map((anchor, index) => {
        const item = toRecord(anchor)
        if (!item) return null
        const label = compactText(item.label, 80)
        if (!label) return null
        return {
          id: normalizeString(item.id) || `anchor_${index + 1}`,
          label,
          screenArea: compactText(item.screenArea, 80),
          depthLayer: compactText(item.depthLayer, 80),
          relations: Array.isArray(item.spatialRelations)
            ? item.spatialRelations
              .map((relation) => compactText(relation, 90))
              .filter((relation): relation is string => Boolean(relation))
              .slice(0, 2)
            : [],
        }
      })
    : []
  const anchors = rawAnchors
    .filter((anchor) => anchor !== null)
    .slice(0, 5) as SceneGraph['anchors']

  const depthRecord = toRecord(record.depthLayout)
  const depth = depthRecord
    ? ['foreground', 'midground', 'background']
      .map((key) => compactText(depthRecord[key], 120))
      .filter((item): item is string => Boolean(item))
    : compactJsonValue(record.depthLayout, 260)
      ? [compactJsonValue(record.depthLayout, 260) as string]
      : []

  return {
    source: 'location_reference.spatial_profile',
    summaries: [compactText(record.sceneSummary, 260)].filter((item): item is string => Boolean(item)),
    anchors,
    depth,
    lighting: [compactText(record.lightingDirection, 180)].filter((item): item is string => Boolean(item)),
  }
}

function mergeSceneGraphs(graphs: readonly SceneGraph[]): SceneGraph | null {
  if (graphs.length === 0) return null
  return {
    source: 'location_reference.spatial_profile',
    summaries: graphs.flatMap((graph) => graph.summaries).slice(0, 2),
    anchors: graphs.flatMap((graph) => graph.anchors).slice(0, 6),
    depth: graphs.flatMap((graph) => graph.depth).slice(0, 3),
    lighting: graphs.flatMap((graph) => graph.lighting).slice(0, 2),
  }
}

function resolveSceneGraph(input: {
  readonly panels: readonly StoryboardGridPromptPanel[]
  readonly projectData: NovelProjectData
}): SceneGraph | null {
  const locations = Array.from(new Set(input.panels.map((panel) => normalizeString(panel.location)).filter(Boolean)))
  const graphs = locations
    .map((location) => {
      const matchedLocation = (input.projectData.locations || []).find(
        (item) => item.name.toLowerCase() === location.toLowerCase(),
      )
      const selectedImage = (matchedLocation?.images || []).find((item) => item.isSelected) || matchedLocation?.images?.[0]
      return buildSceneGraph(selectedImage && 'spatialProfileJson' in selectedImage ? selectedImage.spatialProfileJson : null)
    })
    .filter((graph): graph is SceneGraph => Boolean(graph))
  return mergeSceneGraphs(graphs)
}

export function sanitizeGridPanel(panel: StoryboardGridPromptPanel): SanitizedPanel {
  const cameraPlan = readCameraPlan(panel)
  const action = sanitizeActionText(panel.description || panel.srtSegment || panel.imagePrompt)
  const sourceAction = sanitizeActionText(panel.srtSegment, 240)
  const imageAction = sanitizeActionText(panel.imagePrompt, 240)
  const cameraFraming = sanitizeCameraText([
    cameraPlan.shotScale,
    cameraPlan.composition,
    panel.cameraMove,
  ].map((item) => normalizeString(item)).filter(Boolean).join(' '))
  const emotion = sanitizeActionText(cameraPlan.emotionalEffect || cameraPlan.axisAndEyeline || panel.actingNotes, 180)
  const temporaryVisualEffect = sanitizeActionText(cameraPlan.lighting, 160)
  const propText = sanitizeActionText(panel.props || imageAction || action, 220)
  const allActionText = [
    action,
    sourceAction,
    imageAction,
    propText,
  ].map((item) => normalizeString(item)).filter(Boolean).join(' ')
  return {
    panelId: panel.id,
    panelIndex: panel.panelIndex,
    shotScale: compactText(cameraPlan.shotScale || panel.shotType, 120),
    cameraFraming,
    action: action || imageAction || sourceAction,
    sourceAction,
    emotion,
    temporaryVisualEffect,
    characters: parsePanelCharacterReferences(panel.characters),
    propText,
    allActionText,
  }
}

export function buildBlockingState(
  panels: readonly StoryboardGridPromptPanel[],
  sceneGraph: SceneGraph | null,
): BlockingState {
  void sceneGraph
  const characterNames = new Set<string>()
  const pairPanels = new Set<string>()
  for (const panel of panels) {
    const names = parsePanelCharacterReferences(panel.characters).map((item) => item.name).filter(Boolean)
    names.forEach((name) => characterNames.add(name))
    if (names.length >= 2) names.forEach((name) => pairPanels.add(name))
  }
  const sideLocks: string[] = []
  if (pairPanels.has('顾严') && pairPanels.has('施雨')) {
    sideLocks.push('Gu Yan / 顾严 remains screen left; Shi Yu / 施雨 remains screen right whenever both are visible.')
  } else {
    const names = Array.from(pairPanels)
    if (names.length >= 2) {
      sideLocks.push(`${names[0]} remains screen left; ${names[1]} remains screen right whenever both are visible.`)
    }
  }

  const allText = panels.map(collectPanelText).join(' ')
  const hasTable = /桌|餐桌|table/iu.test(allText)
  const relationships = [
    ...(hasTable ? ['Characters and persistent tabletop props stay tied to the same shared table; local movement may approach or recoil but must not reseat, mirror, or swap sides.'] : []),
    ...(sideLocks.length > 0 ? ['Two-person shots inherit the same left/right relationship; do not mirror, reverse, or reassign screen sides.'] : []),
  ]
  return {
    characterSideLocks: sideLocks,
    sharedRelationships: relationships,
    continuityRules: [
      'Close-ups may crop invisible areas but cannot change underlying character or prop positions.',
      'If a panel does not explicitly add a new prop, do not add new tabletop objects.',
      'If a panel does not explicitly remove a persistent prop, keep it present when that part of the table is visible.',
    ],
  }
}

export function buildCharacterGraph(
  referenceImages: readonly NumberedReferenceImage[],
  characterAppearances: readonly CharacterAppearance[],
): CharacterGraph {
  const characterReferences = referenceImages.filter((item) => item.role === 'character')
  return {
    references: characterReferences,
    characters: characterAppearances.map((appearance) => {
      const reference = characterReferences.find((item) => item.name === appearance.name)
      return {
        id: appearance.characterId || appearance.name,
        name: appearance.name,
        appearance: appearance.appearance,
        description: appearance.description,
        referenceImage: reference?.image_no || null,
      }
    }),
  }
}

function hasPattern(text: string, pattern: RegExp): boolean {
  return pattern.test(text)
}

export function buildPropGraph(
  panels: readonly StoryboardGridPromptPanel[],
  blockingState: BlockingState,
): PropGraph {
  const allText = panels.map(collectPanelText).join(' ')
  const props: PropGraphItem[] = []
  const addProp = (item: PropGraphItem) => {
    if (!props.some((prop) => prop.id === item.id)) props.push(item)
  }

  if (hasPattern(allText, /粉红|荧色药液|高脚杯|酒杯|pink liquid|wine glass/iu)) {
    addProp({
      id: 'pink_wine_glass',
      visualDescription: 'single stemmed glass containing neon pink liquid',
      ownerOrLocation: 'on the shared tabletop, left-front tabletop zone when that zone is visible',
      persistenceRule: 'the same glass persists across shots that show the same table area',
      duplicationRule: 'do not create a second pink liquid wine glass unless a panel explicitly asks for two',
      allowedStateChange: 'may be cropped out by close-up framing or shift only by local camera framing',
    })
  }
  if (hasPattern(allText, /黑金|餐桌|桌面|桌子|table/iu) || blockingState.sharedRelationships.length > 0) {
    addProp({
      id: 'black_gold_table',
      visualDescription: 'black-gold restaurant table used by the whole video block',
      ownerOrLocation: 'between seated characters, same tabletop across cells',
      persistenceRule: 'treat all tabletop shots as the same table',
      duplicationRule: 'do not introduce a second table in the same blocking setup',
      allowedStateChange: 'may be partially cropped or obscured by characters',
    })
  }
  if (hasPattern(allText, /菜单|焦痕|scorched|menu/iu)) {
    addProp({
      id: 'scorched_paper_menus',
      visualDescription: 'scorched paper menus',
      ownerOrLocation: 'central-front tabletop zone',
      persistenceRule: 'menus remain on the same table when visible',
      duplicationRule: 'do not multiply menus beyond the established small cluster',
      allowedStateChange: 'may be cropped out by character or collar close-ups',
    })
  }
  if (hasPattern(allText, /飞鹰徽章|eagle badge/iu)) {
    addProp({
      id: 'gu_yan_eagle_badge',
      visualDescription: 'small golden eagle badge on Gu Yan clothing',
      ownerOrLocation: 'attached to Gu Yan',
      persistenceRule: 'badge follows Gu Yan and remains his identifying wearable prop',
      duplicationRule: 'do not give the badge to another character',
      allowedStateChange: 'may be touched, rubbed, or cropped out',
    })
  }
  if (hasPattern(allText, /脖环|心动检测|collar|heart.?detection/iu)) {
    addProp({
      id: 'heart_detection_collar',
      visualDescription: 'steel heart-detection collar with red digital countdown',
      ownerOrLocation: 'around Gu Yan neck',
      persistenceRule: 'collar stays on Gu Yan in all shots where his neck is visible',
      duplicationRule: 'do not create extra collars',
      allowedStateChange: 'may tighten, show blood, glow, or display countdown',
    })
  }
  if (hasPattern(allText, /红外|雷达|格栅|scan line|infrared|radar/iu)) {
    addProp({
      id: 'red_infrared_scan_lines',
      visualDescription: 'thin red infrared scan lines crossing faces',
      ownerOrLocation: 'temporary overlay across visible subjects',
      persistenceRule: 'same surveillance effect when referenced',
      duplicationRule: 'do not turn scan lines into text or labels',
      allowedStateChange: 'may sweep, pulse, or disappear when not requested',
    })
  }
  return props
}

export function buildCellShotDelta(
  panel: StoryboardGridPromptPanel,
  facts: { readonly propGraph: PropGraph },
): StoryboardGridPromptCell {
  const sanitized = sanitizeGridPanel(panel)
  const text = sanitized.allActionText
  const visibleProps = facts.propGraph
    .filter((prop) => {
      if (prop.id === 'black_gold_table') return /桌|餐桌|桌面|table/iu.test(text)
      if (prop.id === 'pink_wine_glass') return /粉红|荧色药液|高脚杯|酒杯|pink liquid|wine glass/iu.test(text)
      if (prop.id === 'scorched_paper_menus') return /菜单|焦痕|menu/iu.test(text)
      if (prop.id === 'gu_yan_eagle_badge') return /飞鹰徽章|eagle badge/iu.test(text)
      if (prop.id === 'heart_detection_collar') return /脖环|心动检测|collar|heart.?detection/iu.test(text)
      if (prop.id === 'red_infrared_scan_lines') return /红外|雷达|格栅|scan line|infrared|radar/iu.test(text)
      return false
    })
    .map((prop) => prop.id)

  return {
    cell_index: sanitized.panelIndex,
    cell_position: GRID_CELL_POSITIONS[sanitized.panelIndex] || 'bottom_right',
    panel_id: sanitized.panelId,
    shot_delta: {
      shot_scale: sanitized.shotScale,
      camera_framing: sanitized.cameraFraming,
      visible_subjects: sanitized.characters.map((character) => character.name),
      action: sanitized.action,
      emotion: sanitized.emotion,
      temporary_visual_effect: sanitized.temporaryVisualEffect,
      visible_persistent_props: visibleProps,
      safe_crop_emphasis: 'Keep the active subject inside the central 70% of this cell with inner padding.',
    },
  }
}

export function buildGridSafeCropRules(): string[] {
  return [
    'Four equal cells with a clear empty gutter.',
    'Important subjects stay inside the central 70% safe area of each cell.',
    'Use inner padding; do not place faces, hands, or key props on quadrant edges.',
    'No subject, limb, prop, light beam, or divider crosses cell boundaries.',
  ]
}

export function buildCompactStyleBlock(styleBible: EditScriptStyleBible | null): string[] {
  if (!styleBible) return []
  const visual = styleBible.stylePolicy.visual
  const camera = styleBible.stylePolicy.camera
  return [
    ['filter', visual.imageFilterPrompt],
    ['lighting', visual.lightingPrompt],
    ['color', visual.colorPrompt],
    ['composition', visual.compositionPrompt],
    ['camera', camera.lensAndDepthPrompt],
  ].map(([label, value]) => {
    const sanitized = sanitizeStaticStyleText(value, 180)
    return sanitized ? `${label}: ${sanitized}` : null
  }).filter((item): item is string => Boolean(item))
}

function buildNegativeBlock(styleBible: EditScriptStyleBible | null): string[] {
  const defaults = ['no text', 'no labels', 'no numbers', 'no subtitles', 'no watermark', 'no extra props', 'no mirrored sides']
  if (!styleBible) return defaults
  const negative = sanitizeNegativeText(styleBible.stylePolicy.visual.negativePrompt, 220)
  return [
    ...defaults,
    ...(negative ? [negative] : []),
    ...styleBible.stylePolicy.hardBans.map((ban) => sanitizeNegativeText(ban, 120)).filter((ban): ban is string => Boolean(ban)).slice(0, 6),
  ].filter((item) => !VIDEO_OR_SOUND_PATTERN.test(item))
}

export function buildStoryboardGridPromptFacts(input: {
  readonly panels: readonly StoryboardGridPromptPanel[]
  readonly projectData: NovelProjectData
  readonly referenceImagesMap: readonly NumberedReferenceImage[]
  readonly sourceVideoBlockId: string
  readonly styleBible: EditScriptStyleBible | null
}): StoryboardGridPromptFacts {
  const sceneGraph = resolveSceneGraph({
    panels: input.panels,
    projectData: input.projectData,
  })
  const blockingState = buildBlockingState(input.panels, sceneGraph)
  const characterGraph = buildCharacterGraph(input.referenceImagesMap, buildCharacterAppearances({
    panels: input.panels,
    projectData: input.projectData,
  }))
  const propGraph = buildPropGraph(input.panels, blockingState)
  const cells = input.panels.map((panel, index) => buildCellShotDelta({
    ...panel,
    panelIndex: index,
  }, { propGraph }))
  return {
    grid: {
      mode: '2x2',
      source_video_block_id: input.sourceVideoBlockId,
      safe_crop_rules: buildGridSafeCropRules(),
      cells,
    },
    context: {
      reference_images: input.referenceImagesMap,
      SCENE_GRAPH: sceneGraph,
      BLOCKING_STATE: blockingState,
      CHARACTER_GRAPH: characterGraph,
      PROP_GRAPH: propGraph,
      STYLE: buildCompactStyleBlock(input.styleBible),
      NEGATIVE: buildNegativeBlock(input.styleBible),
    },
  }
}

function stringifyList(items: readonly string[]): string {
  return items.length > 0 ? items.map((item) => `- ${item}`).join('\n') : '- none'
}

function stringifySceneGraph(sceneGraph: SceneGraph | null): string {
  if (!sceneGraph) return '- no spatial profile available'
  const lines: string[] = []
  sceneGraph.summaries.forEach((summary) => lines.push(`summary: ${summary}`))
  sceneGraph.anchors.forEach((anchor) => {
    lines.push(`anchor ${anchor.id}: ${anchor.label}${anchor.screenArea ? `, ${anchor.screenArea}` : ''}${anchor.depthLayer ? `, ${anchor.depthLayer}` : ''}`)
    anchor.relations.forEach((relation) => lines.push(`  relation: ${relation}`))
  })
  sceneGraph.depth.forEach((item) => lines.push(`depth: ${item}`))
  sceneGraph.lighting.forEach((item) => lines.push(`lighting: ${item}`))
  return lines.join('\n')
}

function stringifyBlockingState(blockingState: BlockingState): string {
  return stringifyList([
    ...blockingState.characterSideLocks,
    ...blockingState.sharedRelationships,
    ...blockingState.continuityRules,
  ])
}

function stringifyCharacterGraph(characterGraph: CharacterGraph): string {
  const referenceLines = characterGraph.references.map((item) => `${item.image_no}: ${item.name}${item.appearance ? ` (${item.appearance})` : ''}`)
  const characterLines = characterGraph.characters.map((item) => `${item.id}: ${item.name}${item.referenceImage ? `, ref ${item.referenceImage}` : ''}${item.description ? `, ${item.description}` : ''}`)
  return stringifyList([...referenceLines, ...characterLines])
}

function stringifyPropGraph(propGraph: PropGraph): string {
  return propGraph.length > 0
    ? propGraph.map((prop) => [
        `- ${prop.id}: ${prop.visualDescription}`,
        `  owner/location: ${prop.ownerOrLocation}`,
        `  persistence: ${prop.persistenceRule}`,
        `  duplication: ${prop.duplicationRule}`,
        `  allowed change: ${prop.allowedStateChange}`,
      ].join('\n')).join('\n')
    : '- none'
}

function stringifyCell(cell: StoryboardGridPromptCell | undefined, label: string, index: number): string {
  if (!cell) {
    return [
      `CELL ${index + 1} ${label} — SHOT_DELTA`,
      'unused cell: keep visually simple and non-narrative; no new story, no new props, no labels.',
    ].join('\n')
  }
  const delta = cell.shot_delta
  return [
    `CELL ${cell.cell_index + 1} ${label} — SHOT_DELTA`,
    `panel_id: ${cell.panel_id}`,
    `shot scale: ${delta.shot_scale || 'unspecified'}`,
    `camera/framing: ${delta.camera_framing || 'use existing graph/state; no layout rewrite'}`,
    `visible subjects: ${delta.visible_subjects.length > 0 ? delta.visible_subjects.join(', ') : 'none specified'}`,
    `action: ${delta.action || 'none specified'}`,
    `emotion: ${delta.emotion || 'none specified'}`,
    `temporary visual effect: ${delta.temporary_visual_effect || 'none specified'}`,
    `use props: ${delta.visible_persistent_props.length > 0 ? delta.visible_persistent_props.join(', ') : 'none explicitly visible'}`,
    `safe crop: ${delta.safe_crop_emphasis}`,
  ].join('\n')
}

export function buildStoryboardGridPrompt(input: {
  readonly aspectRatio: string
  readonly facts: StoryboardGridPromptFacts
}): string {
  const facts = input.facts
  return [
    'GLOBAL TASK',
    `Generate one 2x2 storyboard contact sheet for sourceVideoBlockId ${facts.grid.source_video_block_id}. It will be mechanically cropped into four equal quadrants. Aspect ratio: ${input.aspectRatio}.`,
    '',
    'GRID RULES',
    stringifyList([
      'Four equal cells, clear empty gutter, no overlap, no labels, no numbers, no text.',
      ...facts.grid.safe_crop_rules,
      'Do not reorder panelIds: top_left, top_right, bottom_left, bottom_right.',
    ]),
    '',
    'SCENE_GRAPH',
    stringifySceneGraph(facts.context.SCENE_GRAPH),
    '',
    'BLOCKING_STATE',
    stringifyBlockingState(facts.context.BLOCKING_STATE),
    '',
    'CHARACTER_GRAPH',
    stringifyCharacterGraph(facts.context.CHARACTER_GRAPH),
    '',
    'PROP_GRAPH',
    stringifyPropGraph(facts.context.PROP_GRAPH),
    '',
    'STYLE',
    stringifyList(facts.context.STYLE),
    '',
    stringifyCell(facts.grid.cells[0], 'TOP_LEFT', 0),
    '',
    stringifyCell(facts.grid.cells[1], 'TOP_RIGHT', 1),
    '',
    stringifyCell(facts.grid.cells[2], 'BOTTOM_LEFT', 2),
    '',
    stringifyCell(facts.grid.cells[3], 'BOTTOM_RIGHT', 3),
    '',
    'NEGATIVE',
    stringifyList(facts.context.NEGATIVE),
  ].filter((part) => part !== undefined).join('\n')
}
