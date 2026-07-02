import type { NumberedReferenceImage } from '@/lib/workers/handlers/image-task-handler-shared'
import type { StoryboardStillPromptFacts } from '@/lib/workers/handlers/panel-still-prompt-builder'

export type StoryboardImageCompilerDiagnosticCode =
  | 'GLOBAL_SCENE_LOCK_CROPPED_FOR_DETAIL_SHOT'
  | 'LOCATION_ANCHORS_CROPPED_FOR_DETAIL_SHOT'
  | 'OMITTED_CHARACTER_REMOVED'
  | 'OMITTED_PROP_REMOVED'
  | 'REFERENCE_IMAGE_FILTERED'
  | 'MICRO_DETAIL_REMOVED_FOR_WIDE_SHOT'

export type StoryboardImageCompilerDiagnostic = {
  readonly code: StoryboardImageCompilerDiagnosticCode
  readonly message: string
  readonly target?: string
}

type ShotScaleClass = 'extreme_detail' | 'detail' | 'medium' | 'wide'

type StillContext = StoryboardStillPromptFacts['context']
type LocationZone = NonNullable<StillContext['LOCATION_ZONE']>
type GlobalSceneLock = NonNullable<StillContext['GLOBAL_SCENE_LOCK']>
type CharacterGraph = StillContext['CHARACTER_GRAPH']
type PropGraph = StillContext['PROP_GRAPH']

function normalizeText(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

function normalizeName(value: string): string {
  return value.trim().toLocaleLowerCase()
}

function classifyShotScale(value: string | null): ShotScaleClass {
  const text = normalizeText(value).toLocaleLowerCase()
  if (!text) return 'medium'
  if (
    text.includes('extreme close')
    || text.includes('extreme detail')
    || text.includes('insert')
    || text.includes('macro')
    || text.includes('局部特写')
    || text.includes('极近')
    || text.includes('极特写')
  ) return 'extreme_detail'
  if (
    text.includes('close')
    || text.includes('detail')
    || text.includes('特写')
    || text.includes('近景')
  ) return 'detail'
  if (
    text.includes('wide')
    || text.includes('long shot')
    || text.includes('full shot')
    || text.includes('establishing')
    || text.includes('远景')
    || text.includes('全景')
    || text.includes('大全景')
  ) return 'wide'
  return 'medium'
}

function isDetailShot(shotScale: ShotScaleClass): boolean {
  return shotScale === 'detail' || shotScale === 'extreme_detail'
}

function hasName(names: ReadonlySet<string>, value: string): boolean {
  return names.has(normalizeName(value))
}

function filterLocationZone(input: {
  readonly zone: LocationZone | null
  readonly shotScale: ShotScaleClass
  readonly diagnostics: StoryboardImageCompilerDiagnostic[]
}): LocationZone | null {
  if (!input.zone || !isDetailShot(input.shotScale)) return input.zone
  const limit = input.shotScale === 'extreme_detail' ? 2 : 3
  const croppedAnchors = input.zone.must_include.slice(0, limit)
  if (croppedAnchors.length !== input.zone.must_include.length) {
    input.diagnostics.push({
      code: 'LOCATION_ANCHORS_CROPPED_FOR_DETAIL_SHOT',
      message: `Cropped location anchors from ${String(input.zone.must_include.length)} to ${String(croppedAnchors.length)} for a detail shot.`,
      target: input.zone.zone_id ?? input.zone.zone_name ?? undefined,
    })
  }
  return {
    ...input.zone,
    overall_position: input.shotScale === 'extreme_detail' ? null : input.zone.overall_position,
    must_include: croppedAnchors,
  }
}

function filterGlobalSceneLock(input: {
  readonly lock: GlobalSceneLock | null
  readonly locationZone: LocationZone | null
  readonly shotScale: ShotScaleClass
  readonly diagnostics: StoryboardImageCompilerDiagnostic[]
}): GlobalSceneLock | null {
  if (!input.lock) return null
  if (!isDetailShot(input.shotScale)) return input.lock

  const activeLocalAnchors = new Set((input.locationZone?.must_include ?? []).map(normalizeName))
  const limit = input.shotScale === 'extreme_detail' ? 1 : 2
  const stableBackground = input.lock.stable_background
    .filter((anchor) => activeLocalAnchors.size === 0 || activeLocalAnchors.has(normalizeName(anchor)))
    .slice(0, limit)

  if (stableBackground.length !== input.lock.stable_background.length || input.lock.summary !== null) {
    input.diagnostics.push({
      code: 'GLOBAL_SCENE_LOCK_CROPPED_FOR_DETAIL_SHOT',
      message: 'Reduced global scene lock to local lighting and active anchors for a detail shot.',
    })
  }

  return {
    ...input.lock,
    summary: null,
    stable_background: stableBackground,
  }
}

function readOmittedNames(locationZone: LocationZone | null, kind: 'character' | 'prop'): ReadonlySet<string> {
  return new Set((locationZone?.omitted_scene_assets ?? [])
    .filter((asset) => asset.kind === kind)
    .map((asset) => normalizeName(asset.name)))
}

function filterCharacters(input: {
  readonly graph: CharacterGraph
  readonly omittedNames: ReadonlySet<string>
  readonly diagnostics: StoryboardImageCompilerDiagnostic[]
}): CharacterGraph {
  const characters = input.graph.characters.filter((character) => {
    const omitted = hasName(input.omittedNames, character.name)
    if (omitted) {
      input.diagnostics.push({
        code: 'OMITTED_CHARACTER_REMOVED',
        message: `Removed omitted character "${character.name}" from the visible character graph.`,
        target: character.name,
      })
    }
    return !omitted
  })
  const visibleNames = new Set(characters.map((character) => normalizeName(character.name)))
  return {
    ...input.graph,
    references: input.graph.references.filter((reference) => visibleNames.has(normalizeName(reference.name))),
    characters,
  }
}

function filterProps(input: {
  readonly graph: PropGraph
  readonly omittedNames: ReadonlySet<string>
  readonly diagnostics: StoryboardImageCompilerDiagnostic[]
}): PropGraph {
  return input.graph.filter((prop) => {
    const omitted = hasName(input.omittedNames, prop.name)
    if (omitted) {
      input.diagnostics.push({
        code: 'OMITTED_PROP_REMOVED',
        message: `Removed omitted prop "${prop.name}" from the visible prop graph.`,
        target: prop.name,
      })
    }
    return !omitted
  })
}

function isReferenceAllowed(input: {
  readonly reference: NumberedReferenceImage
  readonly visibleCharacterNames: ReadonlySet<string>
  readonly visiblePropNames: ReadonlySet<string>
  readonly shotScale: ShotScaleClass
}): boolean {
  const referenceName = normalizeName(input.reference.name)
  if (input.reference.role === 'character') return input.visibleCharacterNames.has(referenceName)
  if (input.reference.role === 'prop') return input.visiblePropNames.has(referenceName)
  if (input.reference.role === 'location') return input.shotScale !== 'extreme_detail'
  return true
}

function filterReferenceImages(input: {
  readonly references: readonly NumberedReferenceImage[]
  readonly visibleCharacterNames: ReadonlySet<string>
  readonly visiblePropNames: ReadonlySet<string>
  readonly shotScale: ShotScaleClass
  readonly diagnostics: StoryboardImageCompilerDiagnostic[]
}): readonly NumberedReferenceImage[] {
  return input.references.filter((reference) => {
    const allowed = isReferenceAllowed({
      reference,
      visibleCharacterNames: input.visibleCharacterNames,
      visiblePropNames: input.visiblePropNames,
      shotScale: input.shotScale,
    })
    if (!allowed) {
      input.diagnostics.push({
        code: 'REFERENCE_IMAGE_FILTERED',
        message: `Filtered ${reference.role} reference image "${reference.name}" for the current shot visibility.`,
        target: reference.name,
      })
    }
    return allowed
  })
}

const WIDE_SHOT_MICRO_DETAIL_PATTERN = /(?:tear|tears|pupil|eyelash|wrist|bracelet|sweat|vein|spit|唾沫|眼泪|泪水|眼眶|瞳孔|睫毛|手腕|手镯|汗珠|青筋)/iu

function removeWideShotMicroEmotion(input: {
  readonly emotion: string | null
  readonly shotScale: ShotScaleClass
  readonly diagnostics: StoryboardImageCompilerDiagnostic[]
}): string | null {
  if (input.shotScale !== 'wide') return input.emotion
  if (!input.emotion || !WIDE_SHOT_MICRO_DETAIL_PATTERN.test(input.emotion)) return input.emotion
  input.diagnostics.push({
    code: 'MICRO_DETAIL_REMOVED_FOR_WIDE_SHOT',
    message: 'Removed micro-expression or tiny prop detail from a wide shot emotion field.',
  })
  return null
}

export function compileStoryboardStillPromptFactsV2(
  facts: StoryboardStillPromptFacts,
): {
  readonly facts: StoryboardStillPromptFacts
  readonly diagnostics: readonly StoryboardImageCompilerDiagnostic[]
} {
  const diagnostics: StoryboardImageCompilerDiagnostic[] = []
  const shotScale = classifyShotScale(facts.panel.still_frame.shot_scale ?? facts.panel.shot_type)
  const locationZone = filterLocationZone({
    zone: facts.context.LOCATION_ZONE,
    shotScale,
    diagnostics,
  })
  const globalSceneLock = filterGlobalSceneLock({
    lock: facts.context.GLOBAL_SCENE_LOCK,
    locationZone,
    shotScale,
    diagnostics,
  })
  const characterGraph = filterCharacters({
    graph: facts.context.CHARACTER_GRAPH,
    omittedNames: readOmittedNames(locationZone, 'character'),
    diagnostics,
  })
  const propGraph = filterProps({
    graph: facts.context.PROP_GRAPH,
    omittedNames: readOmittedNames(locationZone, 'prop'),
    diagnostics,
  })
  const visibleCharacterNames = new Set(characterGraph.characters.map((character) => normalizeName(character.name)))
  const visiblePropNames = new Set(propGraph.map((prop) => normalizeName(prop.name)))
  const referenceImages = filterReferenceImages({
    references: facts.context.reference_images,
    visibleCharacterNames,
    visiblePropNames,
    shotScale,
    diagnostics,
  })

  const stillFrame = {
    ...facts.panel.still_frame,
    visible_subjects: facts.panel.still_frame.visible_subjects.filter((name) => hasName(visibleCharacterNames, name)),
    visible_props: facts.panel.still_frame.visible_props.filter((name) => hasName(visiblePropNames, name)),
    emotion: removeWideShotMicroEmotion({
      emotion: facts.panel.still_frame.emotion,
      shotScale,
      diagnostics,
    }),
  }

  return {
    facts: {
      ...facts,
      panel: {
        ...facts.panel,
        still_frame: stillFrame,
      },
      context: {
        ...facts.context,
        reference_images: referenceImages,
        LOCATION_ZONE: locationZone,
        GLOBAL_SCENE_LOCK: globalSceneLock,
        CHARACTER_GRAPH: characterGraph,
        PROP_GRAPH: propGraph,
      },
    },
    diagnostics,
  }
}

export function filterReferenceImageUrlsByPromptMap(input: {
  readonly urls: readonly string[]
  readonly originalMap: readonly NumberedReferenceImage[]
  readonly filteredMap: readonly NumberedReferenceImage[]
}): string[] {
  const selectedImageNumbers = new Set(input.filteredMap.map((item) => item.image_no))
  return input.urls.filter((_url, index) => {
    const mapped = input.originalMap[index]
    return mapped ? selectedImageNumbers.has(mapped.image_no) : false
  })
}
