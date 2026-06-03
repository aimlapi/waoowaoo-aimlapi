import { z } from 'zod'
import type { MediaRef } from '@/lib/media/types'

export const VISUAL_REFERENCE_CASE_STATUSES = ['processing', 'completed', 'failed'] as const
export type VisualReferenceCaseStatus = (typeof VISUAL_REFERENCE_CASE_STATUSES)[number]

export interface ProjectVisualReferenceCasePayload {
  readonly id: string
  readonly projectId: string
  readonly episodeId: string
  readonly screenplayId: string
  readonly title: string
  readonly description: string
  readonly prompt: string
  readonly status: VisualReferenceCaseStatus
  readonly taskId: string | null
  readonly errorMessage: string | null
  readonly imageUrl: string | null
  readonly imageMedia: MediaRef | null
  readonly isSelected: boolean
  readonly sortIndex: number
  readonly createdAt: string
  readonly updatedAt: string
}

export const getVisualReferenceCasesRequestSchema = z.object({
  episodeId: z.string().trim().min(1),
})

export const createVisualReferenceCasesRequestSchema = z.object({
  episodeId: z.string().trim().min(1),
  count: z.number().int().min(1).max(5).optional(),
})

export const selectVisualReferenceCaseRequestSchema = z.object({
  episodeId: z.string().trim().min(1),
  caseId: z.string().trim().min(1),
})
