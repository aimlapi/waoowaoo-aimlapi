import type { CharacterGraph, PropGraphItem, ShotScaleClass, StillFrame } from './types'
import { hasName, normalizeName } from './text'

export type CinematographyFramingLayerResult = {
  readonly stillFrame: StillFrame
  readonly depthStrategy: string
  readonly focusSubjects: readonly string[]
}

export function runCinematographyFramingLayer(input: {
  readonly stillFrame: StillFrame
  readonly characterGraph: CharacterGraph
  readonly propGraph: readonly PropGraphItem[]
  readonly shotScale: ShotScaleClass
}): CinematographyFramingLayerResult {
  const visibleCharacterNames = new Set(input.characterGraph.characters.map((character) => normalizeName(character.name)))
  const visiblePropNames = new Set(input.propGraph.map((prop) => normalizeName(prop.name)))
  const visibleSubjects = input.stillFrame.visible_subjects.filter((name) => hasName(visibleCharacterNames, name))
  const visibleProps = input.stillFrame.visible_props.filter((name) => hasName(visiblePropNames, name))
  return {
    stillFrame: {
      ...input.stillFrame,
      visible_subjects: visibleSubjects,
      visible_props: visibleProps,
      crop_priority: buildCropPriority({
        existing: input.stillFrame.crop_priority,
        shotScale: input.shotScale,
        visibleSubjects,
        visibleProps,
      }),
    },
    depthStrategy: buildDepthStrategy(input.shotScale),
    focusSubjects: visibleSubjects.length > 0 ? visibleSubjects : visibleProps,
  }
}

function buildCropPriority(input: {
  readonly existing: string
  readonly shotScale: ShotScaleClass
  readonly visibleSubjects: readonly string[]
  readonly visibleProps: readonly string[]
}): string {
  if (input.shotScale === 'extreme_detail') return 'Crop to the single readable detail; exclude unrelated scene reconstruction.'
  if (input.shotScale === 'detail') return 'Keep the focal face, hand, or prop dominant; background is supporting and shallow.'
  if (input.shotScale === 'wide') return 'Prioritize spatial relationships and silhouettes over microscopic details.'
  return input.existing
}

function buildDepthStrategy(shotScale: ShotScaleClass): string {
  if (shotScale === 'extreme_detail') return 'macro shallow depth of field'
  if (shotScale === 'detail') return 'shallow depth of field with local background'
  if (shotScale === 'wide') return 'deep enough focus for readable staging'
  return 'balanced cinematic depth'
}
