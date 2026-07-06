export {
  panelContinuityStateSchema,
  productionLocationGroupSchema,
  productionSegmentSchema,
  sceneContinuityLoopSchema,
  segmentContinuityBibleSchema,
} from './production-continuity-schema'
export type {
  PanelContinuityState,
  PanelProductionSegmentBinding,
  ProductionContinuityCharacter,
  ProductionContinuityLocation,
  ProductionContinuityProp,
  ProductionLocationGroup,
  ProductionSegment,
  SceneContinuityLoop,
  SegmentContinuityBible,
} from './production-continuity-schema'
import type {
  PanelProductionSegmentBinding,
  ProductionContinuityCharacter,
  ProductionContinuityLocation,
  ProductionContinuityProp,
  ProductionLocationGroup,
  ProductionSegment,
  SceneContinuityLoop,
  SegmentContinuityBible,
} from './production-continuity-schema'

function assertUniqueStrings(values: readonly string[], context: string): void {
  const seen = new Set<string>()
  for (const value of values) {
    if (seen.has(value)) throw new Error(`SCREENPLAY_STORYBOARD_PRODUCTION_DUPLICATE:${context}:${value}`)
    seen.add(value)
  }
}

function assertSubset(input: {
  readonly values: readonly string[]
  readonly allowed: ReadonlySet<string>
  readonly code: string
  readonly context: string
}): void {
  for (const value of input.values) {
    if (!input.allowed.has(value)) {
      throw new Error(`${input.code}:${input.context}:${value}`)
    }
  }
}

function normalizeEnvironment(value: string): string {
  return value.trim().replace(/\s+/g, '').toLowerCase()
}

const TIGHT_DETAIL_SHOT_PATTERN = /(?:极近景|大特写|特写|细节|插入|close[-\s]?up|extreme\s+close|insert|detail|macro)/iu

function isTightDetailShot(shotType: string): boolean {
  return TIGHT_DETAIL_SHOT_PATTERN.test(shotType)
}

export function validateProductionLocationGroups(input: {
  readonly productionLocations: readonly ProductionLocationGroup[]
  readonly locations: readonly ProductionContinuityLocation[]
}): readonly ProductionLocationGroup[] {
  if (input.productionLocations.length === 0) {
    throw new Error('SCREENPLAY_STORYBOARD_PRODUCTION_LOCATIONS_REQUIRED')
  }

  const projectLocationIds = new Set(input.locations.map((location) => location.locationId))
  const productionLocationIds = new Set<string>()
  const mappedLocationIds = new Set<string>()
  for (const location of input.productionLocations) {
    if (productionLocationIds.has(location.productionLocationId)) {
      throw new Error(`SCREENPLAY_STORYBOARD_PRODUCTION_LOCATION_DUPLICATE:${location.productionLocationId}`)
    }
    if (!projectLocationIds.has(location.locationId)) {
      throw new Error(`SCREENPLAY_STORYBOARD_PRODUCTION_LOCATION_NOT_FOUND:${location.productionLocationId}:${location.locationId}`)
    }
    if (mappedLocationIds.has(location.locationId)) {
      throw new Error(`SCREENPLAY_STORYBOARD_PRODUCTION_LOCATION_LOCATION_DUPLICATE:${location.locationId}`)
    }
    productionLocationIds.add(location.productionLocationId)
    mappedLocationIds.add(location.locationId)
  }
  return input.productionLocations
}

export function validateProductionSegments(input: {
  readonly productionSegments: readonly ProductionSegment[]
  readonly productionLocations: readonly ProductionLocationGroup[]
  readonly panels: readonly PanelProductionSegmentBinding[]
  readonly characters: readonly ProductionContinuityCharacter[]
  readonly props: readonly ProductionContinuityProp[]
  readonly locations: readonly ProductionContinuityLocation[]
}): readonly ProductionSegment[] {
  if (input.productionSegments.length === 0) {
    throw new Error('SCREENPLAY_STORYBOARD_PRODUCTION_SEGMENTS_REQUIRED')
  }

  const projectCharacterNames = new Set(input.characters.map((character) => character.name))
  const projectPropNames = new Set(input.props.map((prop) => prop.name))
  const projectLocationIds = new Set(input.locations.map((location) => location.locationId))
  const productionLocationById = new Map(input.productionLocations.map((location) => [location.productionLocationId, location]))
  const segmentById = new Map<string, ProductionSegment>()

  let previousSegment: ProductionSegment | null = null
  for (const [index, segment] of input.productionSegments.entries()) {
    const expectedOrder = index + 1
    if (segment.order !== expectedOrder) {
      throw new Error(`SCREENPLAY_STORYBOARD_PRODUCTION_SEGMENT_ORDER_MISMATCH:expected_${expectedOrder}:got_${segment.order}`)
    }
    if (segmentById.has(segment.productionSegmentId)) {
      throw new Error(`SCREENPLAY_STORYBOARD_PRODUCTION_SEGMENT_DUPLICATE:${segment.productionSegmentId}`)
    }
    if (!projectLocationIds.has(segment.locationId)) {
      throw new Error(`SCREENPLAY_STORYBOARD_PRODUCTION_SEGMENT_LOCATION_NOT_FOUND:${segment.productionSegmentId}:${segment.locationId}`)
    }
    const productionLocation = productionLocationById.get(segment.productionLocationId)
    if (!productionLocation) {
      throw new Error(`SCREENPLAY_STORYBOARD_PRODUCTION_SEGMENT_PRODUCTION_LOCATION_NOT_FOUND:${segment.productionSegmentId}:${segment.productionLocationId}`)
    }
    if (productionLocation.locationId !== segment.locationId) {
      throw new Error(`SCREENPLAY_STORYBOARD_PRODUCTION_SEGMENT_LOCATION_MISMATCH:${segment.productionSegmentId}:${segment.locationId}:${productionLocation.locationId}`)
    }
    assertUniqueStrings(segment.characterNames, `segment_${segment.order}:characters`)
    assertUniqueStrings(segment.propNames, `segment_${segment.order}:props`)
    assertSubset({
      values: segment.characterNames,
      allowed: projectCharacterNames,
      code: 'SCREENPLAY_STORYBOARD_PRODUCTION_SEGMENT_CHARACTER_NOT_FOUND',
      context: segment.productionSegmentId,
    })
    assertSubset({
      values: segment.propNames,
      allowed: projectPropNames,
      code: 'SCREENPLAY_STORYBOARD_PRODUCTION_SEGMENT_PROP_NOT_FOUND',
      context: segment.productionSegmentId,
    })
    if (
      previousSegment
      && previousSegment.locationId === segment.locationId
      && normalizeEnvironment(previousSegment.environment) === normalizeEnvironment(segment.environment)
    ) {
      throw new Error(`SCREENPLAY_STORYBOARD_PRODUCTION_SEGMENT_DUPLICATE_CONTINUOUS_SCENE:${segment.productionSegmentId}:${segment.locationId}`)
    }
    segmentById.set(segment.productionSegmentId, segment)
    previousSegment = segment
  }

  for (const panel of input.panels) {
    const segment = segmentById.get(panel.productionSegmentId)
    if (!segment) {
      throw new Error(`SCREENPLAY_STORYBOARD_PANEL_PRODUCTION_SEGMENT_NOT_FOUND:panel_${panel.panelNumber}:${panel.productionSegmentId}`)
    }
    if (panel.locationId !== segment.locationId) {
      throw new Error(`SCREENPLAY_STORYBOARD_PANEL_PRODUCTION_SEGMENT_LOCATION_MISMATCH:panel_${panel.panelNumber}:${panel.locationId}:${segment.locationId}`)
    }
    const segmentCharacters = new Set(segment.characterNames)
    const segmentProps = new Set(segment.propNames)
    assertSubset({
      values: panel.characterNames,
      allowed: segmentCharacters,
      code: 'SCREENPLAY_STORYBOARD_PANEL_CHARACTER_OUTSIDE_PRODUCTION_SEGMENT',
      context: `panel_${panel.panelNumber}`,
    })
    assertSubset({
      values: panel.propNames,
      allowed: segmentProps,
      code: 'SCREENPLAY_STORYBOARD_PANEL_PROP_OUTSIDE_PRODUCTION_SEGMENT',
      context: `panel_${panel.panelNumber}`,
    })

    const omittedCharacters = panel.omittedSceneAssets
      .filter((asset) => asset.kind === 'character')
      .map((asset) => asset.name)
    const omittedProps = panel.omittedSceneAssets
      .filter((asset) => asset.kind === 'prop')
      .map((asset) => asset.name)
    assertSubset({
      values: omittedCharacters,
      allowed: segmentCharacters,
      code: 'SCREENPLAY_STORYBOARD_PANEL_OMITTED_CHARACTER_OUTSIDE_PRODUCTION_SEGMENT',
      context: `panel_${panel.panelNumber}`,
    })
    assertSubset({
      values: omittedProps,
      allowed: segmentProps,
      code: 'SCREENPLAY_STORYBOARD_PANEL_OMITTED_PROP_OUTSIDE_PRODUCTION_SEGMENT',
      context: `panel_${panel.panelNumber}`,
    })
    const isTightDetail = isTightDetailShot(panel.shotType)
    const omittedNames = [...omittedCharacters, ...omittedProps]
    if (!isTightDetail && omittedNames.length > 0) {
      throw new Error(`SCREENPLAY_STORYBOARD_PANEL_NON_DETAIL_OMITS_PRODUCTION_SEGMENT_ASSET:panel_${panel.panelNumber}:${omittedNames[0]}`)
    }
    if (isTightDetail && segment.characterNames.length + segment.propNames.length > 0) {
      const visibleSceneAssetCount = panel.characterNames.length + panel.propNames.length
      if (visibleSceneAssetCount === 0) {
        throw new Error(`SCREENPLAY_STORYBOARD_PANEL_DETAIL_WITHOUT_VISIBLE_PRODUCTION_SEGMENT_ASSET:panel_${panel.panelNumber}`)
      }
    }
    assertSubset({
      values: segment.characterNames,
      allowed: new Set([...panel.characterNames, ...omittedCharacters]),
      code: 'SCREENPLAY_STORYBOARD_PANEL_MISSING_REQUIRED_PRODUCTION_CHARACTER',
      context: `panel_${panel.panelNumber}`,
    })
    assertSubset({
      values: segment.propNames,
      allowed: new Set([...panel.propNames, ...omittedProps]),
      code: 'SCREENPLAY_STORYBOARD_PANEL_MISSING_REQUIRED_PRODUCTION_PROP',
      context: `panel_${panel.panelNumber}`,
    })
  }

  return input.productionSegments
}

export function validateSegmentContinuityBibles(input: {
  readonly productionSegments: readonly ProductionSegment[]
  readonly segmentContinuityBibles: readonly SegmentContinuityBible[]
}): readonly SegmentContinuityBible[] {
  const segmentById = new Map(input.productionSegments.map((segment) => [segment.productionSegmentId, segment]))
  const seen = new Set<string>()
  for (const bible of input.segmentContinuityBibles) {
    const segment = segmentById.get(bible.productionSegmentId)
    if (!segment) {
      throw new Error(`SCREENPLAY_STORYBOARD_SEGMENT_CONTINUITY_UNKNOWN_SEGMENT:${bible.productionSegmentId}`)
    }
    if (seen.has(bible.productionSegmentId)) {
      throw new Error(`SCREENPLAY_STORYBOARD_SEGMENT_CONTINUITY_DUPLICATE:${bible.productionSegmentId}`)
    }
    if (bible.originalOrderKey !== segment.originalOrderKey) {
      throw new Error(`SCREENPLAY_STORYBOARD_SEGMENT_CONTINUITY_ORDER_KEY_MISMATCH:${bible.productionSegmentId}`)
    }
    if (bible.screenplaySceneNumber !== segment.screenplaySceneNumber) {
      throw new Error(`SCREENPLAY_STORYBOARD_SEGMENT_CONTINUITY_SCENE_NUMBER_MISMATCH:${bible.productionSegmentId}`)
    }
    seen.add(bible.productionSegmentId)
  }
  for (const segment of input.productionSegments) {
    if (!seen.has(segment.productionSegmentId)) {
      throw new Error(`SCREENPLAY_STORYBOARD_SEGMENT_CONTINUITY_MISSING:${segment.productionSegmentId}`)
    }
  }
  return input.segmentContinuityBibles
}

export function validateSceneContinuityLoops(input: {
  readonly productionSegments: readonly ProductionSegment[]
  readonly loops: readonly SceneContinuityLoop[]
  readonly panelNumbersBySegment: ReadonlyMap<string, readonly number[]>
}): readonly SceneContinuityLoop[] {
  const segmentIds = new Set(input.productionSegments.map((segment) => segment.productionSegmentId))
  const seen = new Set<string>()
  for (const loop of input.loops) {
    if (!segmentIds.has(loop.productionSegmentId)) {
      throw new Error(`SCREENPLAY_STORYBOARD_SCENE_CONTINUITY_LOOP_UNKNOWN_SEGMENT:${loop.productionSegmentId}`)
    }
    if (seen.has(loop.productionSegmentId)) {
      throw new Error(`SCREENPLAY_STORYBOARD_SCENE_CONTINUITY_LOOP_DUPLICATE:${loop.productionSegmentId}`)
    }
    const expectedPanelNumbers = input.panelNumbersBySegment.get(loop.productionSegmentId) ?? []
    if (expectedPanelNumbers.length === 0) {
      throw new Error(`SCREENPLAY_STORYBOARD_SCENE_CONTINUITY_LOOP_SEGMENT_WITHOUT_PANELS:${loop.productionSegmentId}`)
    }
    const checked = loop.checkedPanelNumbers.join(',')
    const expected = expectedPanelNumbers.join(',')
    if (checked !== expected) {
      throw new Error(`SCREENPLAY_STORYBOARD_SCENE_CONTINUITY_LOOP_PANEL_COVERAGE_MISMATCH:${loop.productionSegmentId}:${checked}:${expected}`)
    }
    seen.add(loop.productionSegmentId)
  }
  for (const segment of input.productionSegments) {
    if (!seen.has(segment.productionSegmentId)) {
      throw new Error(`SCREENPLAY_STORYBOARD_SCENE_CONTINUITY_LOOP_MISSING:${segment.productionSegmentId}`)
    }
  }
  return input.loops
}

export function formatProductionLocationsForStorage(productionLocations: readonly ProductionLocationGroup[]) {
  return productionLocations.map((location) => ({
    productionLocationId: location.productionLocationId,
    locationId: location.locationId,
    stableSpatialFacts: [...location.stableSpatialFacts],
    reusableAnchors: [...location.reusableAnchors],
    stableSetDressing: [...location.stableSetDressing],
    nonPersistentStateBans: [...location.nonPersistentStateBans],
  }))
}
