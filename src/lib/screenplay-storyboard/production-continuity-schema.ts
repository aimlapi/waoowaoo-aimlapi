import { z } from 'zod'
import type { OmittedSceneAsset } from './scene-assets'

const invalidPlaceholderValues = new Set(['无', '暂无', '无变化', 'n/a', 'none', 'null', 'undefined'])

function meaningfulString(minLength: number): z.ZodString {
  return z.string().trim().min(minLength).refine(
    (value) => !invalidPlaceholderValues.has(value.toLowerCase()),
    { message: 'Meaningful value is required' },
  )
}

const continuityItemSchema = z.object({
  name: meaningfulString(1),
  kind: z.enum(['character', 'prop', 'set_dressing', 'crowd', 'spatial_anchor']),
  continuityRule: meaningfulString(8),
}).strict()

const characterContinuitySchema = z.object({
  characterName: meaningfulString(1),
  initialPosition: meaningfulString(2),
  blockingArc: meaningfulString(8),
  eyelineRules: z.array(meaningfulString(4)).min(1).max(8),
}).strict()

export const productionLocationGroupSchema = z.object({
  productionLocationId: meaningfulString(1),
  locationId: meaningfulString(1),
  stableSpatialFacts: z.array(meaningfulString(4)).min(1).max(12),
  reusableAnchors: z.array(meaningfulString(1)).min(1).max(12),
  stableSetDressing: z.array(meaningfulString(1)).default([]),
  nonPersistentStateBans: z.array(meaningfulString(4)).min(1).max(12),
}).strict()

export const productionSegmentSchema = z.object({
  productionSegmentId: meaningfulString(1),
  order: z.number().int().positive(),
  originalOrderKey: z.string().trim().regex(/^\d{3}\.\d{3}$/u),
  screenplaySceneNumber: z.number().int().positive(),
  productionLocationId: meaningfulString(1),
  locationId: meaningfulString(1),
  environment: meaningfulString(2),
  sourceText: meaningfulString(12),
  characterNames: z.array(meaningfulString(1)).default([]),
  propNames: z.array(meaningfulString(1)).default([]),
}).strict()

export const segmentContinuityBibleSchema = z.object({
  productionSegmentId: meaningfulString(1),
  originalOrderKey: z.string().trim().regex(/^\d{3}\.\d{3}$/u),
  screenplaySceneNumber: z.number().int().positive(),
  dramaticContext: meaningfulString(8),
  temporalState: meaningfulString(2),
  atmosphereState: meaningfulString(2),
  crowdState: meaningfulString(2),
  spatialContinuity: z.array(meaningfulString(4)).min(1).max(12),
  persistentSetState: z.array(continuityItemSchema).min(1).max(24),
  characterContinuity: z.array(characterContinuitySchema).default([]),
  screenDirectionRules: z.array(meaningfulString(4)).min(1).max(10),
  forbiddenChanges: z.array(meaningfulString(4)).min(1).max(12),
}).strict()

export const panelContinuityStateSchema = z.object({
  inheritedContinuity: z.array(meaningfulString(2)).min(1).max(12),
  changedContinuity: z.array(meaningfulString(2)).default([]),
  visibleContinuityElements: z.array(meaningfulString(1)).min(1).max(16),
  forbiddenDiscontinuity: z.array(meaningfulString(2)).min(1).max(12),
}).strict()

export const sceneContinuityLoopSchema = z.object({
  productionSegmentId: meaningfulString(1),
  auditRound: z.number().int().positive().max(3),
  checkedPanelNumbers: z.array(z.number().int().positive()).min(1),
  checkedContinuityAxes: z.array(z.enum([
    'space',
    'character_blocking',
    'eyeline',
    'persistent_props',
    'crowd_state',
    'screen_direction',
    'composition_priority',
  ])).min(3),
  detectedIssues: z.array(meaningfulString(2)).default([]),
  repairActions: z.array(meaningfulString(2)).default([]),
  locked: z.literal(true),
}).strict()

export type ProductionLocationGroup = z.infer<typeof productionLocationGroupSchema>
export type ProductionSegment = z.infer<typeof productionSegmentSchema>
export type SegmentContinuityBible = z.infer<typeof segmentContinuityBibleSchema>
export type PanelContinuityState = z.infer<typeof panelContinuityStateSchema>
export type SceneContinuityLoop = z.infer<typeof sceneContinuityLoopSchema>

export interface ProductionContinuityCharacter {
  readonly name: string
}

export interface ProductionContinuityLocation {
  readonly locationId: string
}

export interface ProductionContinuityProp {
  readonly name: string
}

export interface PanelProductionSegmentBinding {
  readonly panelNumber: number
  readonly productionSegmentId: string
  readonly locationId: string
  readonly shotType: string
  readonly characterNames: readonly string[]
  readonly propNames: readonly string[]
  readonly omittedSceneAssets: readonly OmittedSceneAsset[]
  readonly panelContinuity: PanelContinuityState
}
