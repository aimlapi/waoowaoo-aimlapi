import { z } from 'zod'
import type { OmittedSceneAsset } from './scene-assets'

const continuityItemSchema = z.object({
  name: z.string().trim().min(1),
  kind: z.enum(['character', 'prop', 'set_dressing', 'crowd', 'spatial_anchor']),
  continuityRule: z.string().trim().min(8),
}).strict()

const characterContinuitySchema = z.object({
  characterName: z.string().trim().min(1),
  initialPosition: z.string().trim().min(4),
  blockingArc: z.string().trim().min(8),
  eyelineRules: z.array(z.string().trim().min(4)).min(1).max(8),
}).strict()

export const productionLocationGroupSchema = z.object({
  productionLocationId: z.string().trim().min(1),
  locationId: z.string().trim().min(1),
  stableSpatialFacts: z.array(z.string().trim().min(4)).min(1).max(12),
  reusableAnchors: z.array(z.string().trim().min(1)).min(1).max(12),
  stableSetDressing: z.array(z.string().trim().min(1)).default([]),
  nonPersistentStateBans: z.array(z.string().trim().min(4)).min(1).max(12),
}).strict()

export const productionSegmentSchema = z.object({
  productionSegmentId: z.string().trim().min(1),
  order: z.number().int().positive(),
  originalOrderKey: z.string().trim().regex(/^\d{3}\.\d{3}$/u),
  screenplaySceneNumber: z.number().int().positive(),
  productionLocationId: z.string().trim().min(1),
  locationId: z.string().trim().min(1),
  environment: z.string().trim().min(8),
  sourceText: z.string().trim().min(12),
  characterNames: z.array(z.string().trim().min(1)).default([]),
  propNames: z.array(z.string().trim().min(1)).default([]),
}).strict()

export const segmentContinuityBibleSchema = z.object({
  productionSegmentId: z.string().trim().min(1),
  originalOrderKey: z.string().trim().regex(/^\d{3}\.\d{3}$/u),
  screenplaySceneNumber: z.number().int().positive(),
  dramaticContext: z.string().trim().min(8),
  temporalState: z.string().trim().min(4),
  atmosphereState: z.string().trim().min(6),
  crowdState: z.string().trim().min(4),
  spatialContinuity: z.array(z.string().trim().min(4)).min(1).max(12),
  persistentSetState: z.array(continuityItemSchema).min(1).max(24),
  characterContinuity: z.array(characterContinuitySchema).default([]),
  screenDirectionRules: z.array(z.string().trim().min(4)).min(1).max(10),
  forbiddenChanges: z.array(z.string().trim().min(4)).min(1).max(12),
}).strict()

export const panelContinuityStateSchema = z.object({
  inheritedContinuity: z.array(z.string().trim().min(4)).min(1).max(12),
  changedContinuity: z.array(z.string().trim().min(4)).default([]),
  visibleContinuityElements: z.array(z.string().trim().min(1)).min(1).max(16),
  forbiddenDiscontinuity: z.array(z.string().trim().min(4)).min(1).max(12),
}).strict()

export const sceneContinuityLoopSchema = z.object({
  productionSegmentId: z.string().trim().min(1),
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
  detectedIssues: z.array(z.string().trim().min(4)).default([]),
  repairActions: z.array(z.string().trim().min(4)).default([]),
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

