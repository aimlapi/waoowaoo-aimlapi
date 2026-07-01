import { z } from 'zod'

export const sceneAssetSegmentSchema = z.object({
  sceneSegmentId: z.string().trim().min(1),
  order: z.number().int().positive(),
  locationId: z.string().trim().min(1),
  environment: z.string().trim().min(8),
  characterNames: z.array(z.string().trim().min(1)).default([]),
  propNames: z.array(z.string().trim().min(1)).default([]),
}).strict()

export type SceneAssetSegment = z.infer<typeof sceneAssetSegmentSchema>

export interface SceneAssetCharacter {
  readonly name: string
}

export interface SceneAssetLocation {
  readonly locationId: string
}

export interface SceneAssetProp {
  readonly name: string
}

export interface PanelSceneAssetBinding {
  readonly panelNumber: number
  readonly sceneSegmentId: string
  readonly locationId: string
  readonly shotType: string
  readonly characterNames: readonly string[]
  readonly propNames: readonly string[]
}

function assertUniqueStrings(values: readonly string[], context: string): void {
  const seen = new Set<string>()
  for (const value of values) {
    if (seen.has(value)) throw new Error(`SCREENPLAY_STORYBOARD_SCENE_ASSET_DUPLICATE:${context}:${value}`)
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

function isTightDetailShot(shotType: string): boolean {
  const normalized = shotType.trim().toLowerCase()
  return [
    'extreme close-up',
    'extreme close up',
    'insert',
    'detail',
    'macro',
    '特写',
    '极近景',
    '大特写',
    '细节',
    '插入镜头',
  ].some((token) => normalized.includes(token))
}

export function validateSceneAssetSegments(input: {
  readonly segments: readonly SceneAssetSegment[]
  readonly panels: readonly PanelSceneAssetBinding[]
  readonly characters: readonly SceneAssetCharacter[]
  readonly props: readonly SceneAssetProp[]
  readonly locations: readonly SceneAssetLocation[]
}): readonly SceneAssetSegment[] {
  if (input.segments.length === 0) {
    throw new Error('SCREENPLAY_STORYBOARD_SCENE_ASSET_SEGMENTS_REQUIRED')
  }

  const projectCharacterNames = new Set(input.characters.map((character) => character.name))
  const projectPropNames = new Set(input.props.map((prop) => prop.name))
  const projectLocationIds = new Set(input.locations.map((location) => location.locationId))
  const segmentById = new Map<string, SceneAssetSegment>()

  for (const [index, segment] of input.segments.entries()) {
    const expectedOrder = index + 1
    if (segment.order !== expectedOrder) {
      throw new Error(`SCREENPLAY_STORYBOARD_SCENE_ASSET_ORDER_MISMATCH:expected_${expectedOrder}:got_${segment.order}`)
    }
    if (segmentById.has(segment.sceneSegmentId)) {
      throw new Error(`SCREENPLAY_STORYBOARD_SCENE_ASSET_SEGMENT_DUPLICATE:${segment.sceneSegmentId}`)
    }
    if (!projectLocationIds.has(segment.locationId)) {
      throw new Error(`SCREENPLAY_STORYBOARD_SCENE_ASSET_LOCATION_NOT_FOUND:${segment.sceneSegmentId}:${segment.locationId}`)
    }
    assertUniqueStrings(segment.characterNames, `segment_${segment.order}:characters`)
    assertUniqueStrings(segment.propNames, `segment_${segment.order}:props`)
    assertSubset({
      values: segment.characterNames,
      allowed: projectCharacterNames,
      code: 'SCREENPLAY_STORYBOARD_SCENE_ASSET_CHARACTER_NOT_FOUND',
      context: segment.sceneSegmentId,
    })
    assertSubset({
      values: segment.propNames,
      allowed: projectPropNames,
      code: 'SCREENPLAY_STORYBOARD_SCENE_ASSET_PROP_NOT_FOUND',
      context: segment.sceneSegmentId,
    })
    segmentById.set(segment.sceneSegmentId, segment)
  }

  for (const panel of input.panels) {
    const segment = segmentById.get(panel.sceneSegmentId)
    if (!segment) {
      throw new Error(`SCREENPLAY_STORYBOARD_PANEL_SCENE_ASSET_SEGMENT_NOT_FOUND:panel_${panel.panelNumber}:${panel.sceneSegmentId}`)
    }
    if (panel.locationId !== segment.locationId) {
      throw new Error(`SCREENPLAY_STORYBOARD_PANEL_SCENE_ASSET_LOCATION_MISMATCH:panel_${panel.panelNumber}:${panel.locationId}:${segment.locationId}`)
    }

    const segmentCharacters = new Set(segment.characterNames)
    const segmentProps = new Set(segment.propNames)
    assertSubset({
      values: panel.characterNames,
      allowed: segmentCharacters,
      code: 'SCREENPLAY_STORYBOARD_PANEL_CHARACTER_OUTSIDE_SCENE_ASSET_SEGMENT',
      context: `panel_${panel.panelNumber}`,
    })
    assertSubset({
      values: panel.propNames,
      allowed: segmentProps,
      code: 'SCREENPLAY_STORYBOARD_PANEL_PROP_OUTSIDE_SCENE_ASSET_SEGMENT',
      context: `panel_${panel.panelNumber}`,
    })

    if (isTightDetailShot(panel.shotType)) continue

    assertSubset({
      values: segment.characterNames,
      allowed: new Set(panel.characterNames),
      code: 'SCREENPLAY_STORYBOARD_PANEL_MISSING_REQUIRED_SCENE_CHARACTER',
      context: `panel_${panel.panelNumber}`,
    })
    assertSubset({
      values: segment.propNames,
      allowed: new Set(panel.propNames),
      code: 'SCREENPLAY_STORYBOARD_PANEL_MISSING_REQUIRED_SCENE_PROP',
      context: `panel_${panel.panelNumber}`,
    })
  }

  return input.segments
}
