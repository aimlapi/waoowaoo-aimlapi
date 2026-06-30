import { z } from 'zod'

export const sceneZoneSchema = z.object({
  sceneZoneId: z.string().trim().min(1),
  locationId: z.string().trim().min(1),
  name: z.string().trim().min(1),
  overallPosition: z.string().trim().min(8),
  fixedAnchors: z.array(z.string().trim().min(1)).min(1).max(5),
}).strict()

const characterPlacementSchema = z.object({
  characterName: z.string().trim().min(1),
  subjectPosition: z.string().trim().min(2),
  facing: z.string().trim().min(1),
  eyeline: z.string().trim().min(1),
}).strict()

export const directShotBlockingSchema = z.object({
  sceneZoneId: z.string().trim().min(1),
  subjectPosition: z.string().trim().min(2),
  cameraPosition: z.string().trim().min(2),
  screenComposition: z.string().trim().min(2),
  characterPlacements: z.array(characterPlacementSchema),
}).strict()

export type SceneZone = z.infer<typeof sceneZoneSchema>
export type DirectShotBlocking = z.infer<typeof directShotBlockingSchema>

export interface PanelSceneContinuityBinding {
  readonly panelNumber: number
  readonly characterNames: readonly string[]
  readonly locationId: string
  readonly sceneZoneId: string
  readonly shotBlocking: DirectShotBlocking
}

export interface LocationContinuityAsset {
  readonly locationId: string
  readonly name: string
}

export function validateSceneContinuity(input: {
  readonly sceneZones: readonly SceneZone[]
  readonly panels: readonly PanelSceneContinuityBinding[]
  readonly locations: readonly LocationContinuityAsset[]
}) {
  if (input.sceneZones.length === 0) {
    throw new Error('SCREENPLAY_STORYBOARD_SCENE_ZONES_REQUIRED')
  }

  const locationIds = new Set(input.locations.map((location) => location.locationId))
  const zoneById = new Map<string, SceneZone>()
  for (const zone of input.sceneZones) {
    if (zoneById.has(zone.sceneZoneId)) {
      throw new Error(`SCREENPLAY_STORYBOARD_SCENE_ZONE_DUPLICATE:${zone.sceneZoneId}`)
    }
    if (!locationIds.has(zone.locationId)) {
      throw new Error(`SCREENPLAY_STORYBOARD_SCENE_ZONE_LOCATION_NOT_FOUND:${zone.sceneZoneId}:${zone.locationId}`)
    }
    zoneById.set(zone.sceneZoneId, zone)
  }

  for (const panel of input.panels) {
    if (!locationIds.has(panel.locationId)) {
      throw new Error(`SCREENPLAY_STORYBOARD_PANEL_LOCATION_NOT_FOUND:panel_${panel.panelNumber}:${panel.locationId}`)
    }
    const zone = zoneById.get(panel.sceneZoneId)
    if (!zone) {
      throw new Error(`SCREENPLAY_STORYBOARD_PANEL_SCENE_ZONE_NOT_FOUND:panel_${panel.panelNumber}:${panel.sceneZoneId}`)
    }
    if (zone.locationId !== panel.locationId) {
      throw new Error(`SCREENPLAY_STORYBOARD_PANEL_SCENE_ZONE_LOCATION_MISMATCH:panel_${panel.panelNumber}:${panel.sceneZoneId}`)
    }
    if (panel.shotBlocking.sceneZoneId !== panel.sceneZoneId) {
      throw new Error(`SCREENPLAY_STORYBOARD_PANEL_BLOCKING_SCENE_ZONE_MISMATCH:panel_${panel.panelNumber}:${panel.shotBlocking.sceneZoneId}`)
    }

    const placementNames = panel.shotBlocking.characterPlacements.map((placement) => placement.characterName)
    if (panel.characterNames.length === 0 && placementNames.length > 0) {
      throw new Error(`SCREENPLAY_STORYBOARD_EMPTY_PANEL_HAS_CHARACTER_PLACEMENTS:panel_${panel.panelNumber}`)
    }
    for (const characterName of panel.characterNames) {
      if (!placementNames.includes(characterName)) {
        throw new Error(`SCREENPLAY_STORYBOARD_PANEL_CHARACTER_PLACEMENT_MISSING:panel_${panel.panelNumber}:${characterName}`)
      }
    }
    for (const placementName of placementNames) {
      if (!panel.characterNames.includes(placementName)) {
        throw new Error(`SCREENPLAY_STORYBOARD_PANEL_CHARACTER_PLACEMENT_UNKNOWN:panel_${panel.panelNumber}:${placementName}`)
      }
    }
  }
}

export function formatSceneZonesForStorage(sceneZones: readonly SceneZone[]) {
  return sceneZones.map((zone) => ({
    sceneZoneId: zone.sceneZoneId,
    locationId: zone.locationId,
    name: zone.name,
    overallPosition: zone.overallPosition,
    fixedAnchors: [...zone.fixedAnchors],
  }))
}
