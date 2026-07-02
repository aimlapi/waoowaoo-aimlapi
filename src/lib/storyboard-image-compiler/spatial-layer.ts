import type {
  GlobalSceneLock,
  LocationZone,
  ShotScaleClass,
  StoryboardImageCompilerDiagnostic,
} from './types'
import { isDetailShot } from './shot-scale'
import { normalizeName } from './text'

export type AdaptiveSpatialLayerResult = {
  readonly locationZone: LocationZone | null
  readonly globalSceneLock: GlobalSceneLock | null
}

export function runAdaptiveSpatialLayer(input: {
  readonly locationZone: LocationZone | null
  readonly globalSceneLock: GlobalSceneLock | null
  readonly shotScale: ShotScaleClass
  readonly diagnostics: StoryboardImageCompilerDiagnostic[]
}): AdaptiveSpatialLayerResult {
  const locationZone = filterLocationZone(input)
  const globalSceneLock = filterGlobalSceneLock({
    lock: input.globalSceneLock,
    locationZone,
    shotScale: input.shotScale,
    diagnostics: input.diagnostics,
  })
  return { locationZone, globalSceneLock }
}

function filterLocationZone(input: {
  readonly locationZone: LocationZone | null
  readonly shotScale: ShotScaleClass
  readonly diagnostics: StoryboardImageCompilerDiagnostic[]
}): LocationZone | null {
  if (!input.locationZone || !isDetailShot(input.shotScale)) return input.locationZone
  const limit = input.shotScale === 'extreme_detail' ? 2 : 3
  const croppedAnchors = input.locationZone.must_include.slice(0, limit)
  if (croppedAnchors.length !== input.locationZone.must_include.length) {
    input.diagnostics.push({
      code: 'LOCATION_ANCHORS_CROPPED_FOR_DETAIL_SHOT',
      message: `Cropped location anchors from ${String(input.locationZone.must_include.length)} to ${String(croppedAnchors.length)} for a detail shot.`,
      target: input.locationZone.zone_id ?? input.locationZone.zone_name ?? undefined,
    })
  }
  return {
    ...input.locationZone,
    overall_position: input.shotScale === 'extreme_detail' ? null : input.locationZone.overall_position,
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
