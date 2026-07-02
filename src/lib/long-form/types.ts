import { z } from 'zod'
import { EDIT_SCRIPT_VIDEO_RATIOS } from '@/lib/edit-script/types'

export const LONG_FORM_SEGMENT_DURATION_SEC = 120
export const LONG_FORM_MAX_TOTAL_DURATION_SEC = 7200

export const longFormPlanStatuses = ['generating', 'ready', 'failed'] as const
export type LongFormPlanStatus = (typeof longFormPlanStatuses)[number]

export const longFormSegmentStatuses = ['screenplay_ready', 'failed'] as const
export type LongFormSegmentStatus = (typeof longFormSegmentStatuses)[number]

export const createLongFormPlanRequestSchema = z.object({
  sourceEpisodeId: z.string().trim().min(1).optional(),
  prompt: z.string().trim().min(1),
  totalDurationSec: z.number().int().min(LONG_FORM_SEGMENT_DURATION_SEC + 1).max(LONG_FORM_MAX_TOTAL_DURATION_SEC),
  aspectRatio: z.enum(EDIT_SCRIPT_VIDEO_RATIOS),
})

export const getLongFormPlanRequestSchema = z.object({
  planId: z.string().trim().min(1).optional(),
})

const longFormGlobalCharacterSchema = z.object({
  name: z.string().trim().min(1),
  description: z.string().trim().min(1),
  aliases: z.array(z.string().trim().min(1)).default([]),
})

const longFormGlobalLocationSchema = z.object({
  name: z.string().trim().min(1),
  description: z.string().trim().min(1),
})

const longFormGlobalPropSchema = z.object({
  name: z.string().trim().min(1),
  description: z.string().trim().min(1),
})

export const longFormPlanModelOutputSchema = z.object({
  title: z.string().trim().min(1),
  logline: z.string().trim().min(1),
  globalSynopsis: z.string().trim().min(1),
  globalAssets: z.object({
    characters: z.array(longFormGlobalCharacterSchema).max(80).default([]),
    locations: z.array(longFormGlobalLocationSchema).max(120).default([]),
    props: z.array(longFormGlobalPropSchema).max(120).default([]),
  }),
  segments: z.array(z.object({
    index: z.number().int().positive(),
    title: z.string().trim().min(1),
    targetDurationSec: z.number().int().min(1).max(LONG_FORM_SEGMENT_DURATION_SEC),
    synopsis: z.string().trim().min(1),
    prompt: z.string().trim().min(1),
  })).min(1),
})

export type LongFormPlanModelOutput = z.infer<typeof longFormPlanModelOutputSchema>
export type CreateLongFormPlanRequest = z.infer<typeof createLongFormPlanRequestSchema>

export type LongFormAssetSummary = {
  readonly id: string
  readonly kind: 'character' | 'location' | 'prop'
  readonly name: string
}

export type LongFormSegmentSummary = {
  readonly id: string
  readonly episodeId: string
  readonly segmentIndex: number
  readonly title: string
  readonly synopsis: string
  readonly targetDurationSec: number
  readonly status: LongFormSegmentStatus
}

export type LongFormPlanSummary = {
  readonly id: string
  readonly projectId: string
  readonly sourceEpisodeId: string | null
  readonly userPrompt: string
  readonly totalDurationSec: number
  readonly segmentDurationSec: number
  readonly segmentCount: number
  readonly status: LongFormPlanStatus
  readonly screenplayText: string | null
  readonly globalAssets: LongFormPlanModelOutput['globalAssets'] | null
  readonly styleBible: unknown | null
  readonly errorMessage: string | null
  readonly segments: readonly LongFormSegmentSummary[]
}

export type SubmitLongFormPlanTaskResult = {
  readonly success: boolean
  readonly async: boolean
  readonly taskId: string
  readonly runId: string | null
  readonly status: string
  readonly deduped: boolean
  readonly projectId: string
  readonly planId: string
  readonly taskType: 'long_form_plan_generate'
  readonly targetType: 'ProjectLongFormPlan'
  readonly targetId: string
}

export function segmentCountForDuration(totalDurationSec: number): number {
  if (!Number.isInteger(totalDurationSec) || totalDurationSec <= 0) {
    throw new Error('LONG_FORM_TOTAL_DURATION_INVALID')
  }
  return Math.ceil(totalDurationSec / LONG_FORM_SEGMENT_DURATION_SEC)
}

export function durationTierForSegment(targetDurationSec: number): 'short' | 'medium' | 'long' {
  if (!Number.isInteger(targetDurationSec) || targetDurationSec <= 0) {
    throw new Error('LONG_FORM_SEGMENT_DURATION_INVALID')
  }
  if (targetDurationSec <= 45) return 'short'
  if (targetDurationSec < 90) return 'medium'
  return 'long'
}
