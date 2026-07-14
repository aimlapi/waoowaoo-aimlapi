import { z } from 'zod'
import { frameRangeSchema, nativeActionEventSchema } from './types'

const alignedDialogueSchema = z.object({
  dialogueIndex: z.number().int().min(0),
  range: frameRangeSchema,
  confidence: z.number().min(0).max(1),
}).strict()

const alignedKernelSchema = z.object({
  kernelId: z.string().trim().min(1),
  range: frameRangeSchema,
  confidence: z.number().min(0).max(1),
  dialogueRanges: z.array(alignedDialogueSchema),
  nativeActionEvents: z.array(nativeActionEventSchema),
}).strict()

export const kernelTimelineAlignmentSchema = z.object({
  schemaVersion: z.literal(1),
  alignedKernels: z.array(alignedKernelSchema).min(1),
  unresolvedKernelIds: z.array(z.string().trim().min(1)),
}).strict()

export type KernelTimelineAlignment = z.infer<typeof kernelTimelineAlignmentSchema>
