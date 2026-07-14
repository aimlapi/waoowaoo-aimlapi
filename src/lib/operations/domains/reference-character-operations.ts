import { createHash } from 'node:crypto'
import { z } from 'zod'
import { ApiError } from '@/lib/api-errors'
import {
  buildImageBillingPayload,
  getProjectModelConfig,
} from '@/lib/config-service'
import { CHARACTER_IMAGE_BANANA_RATIO } from '@/lib/constants'
import { sanitizeImageInputsForTaskPayload } from '@/lib/media/outbound-image'
import type { ProjectAgentOperationContext } from '@/lib/operations/types'
import {
  createPlannedTask,
  requirePlannedTaskBillingInfo,
  submitPlannedOperationTask,
  type OperationPlan,
} from '@/lib/operations/planning'
import { prisma } from '@/lib/prisma'
import { TASK_TYPE } from '@/lib/task/types'
import { normalizeImageGenerationCount } from '@/lib/image-generation/count'
import { resolveModelSelection } from '@/lib/user-api/runtime-config'
import { submitOperationTask } from '@/lib/operations/submit-operation-task'
import { resolveOperationLocale } from '@/lib/operations/environment-input'

const referenceImagesSchema = z.array(z.string().min(1)).min(1).max(5)

export const referenceCharacterGenerationInputSchema = z.object({
  referenceImageUrls: referenceImagesSchema,
  characterName: z.string().min(1).optional(),
  characterId: z.string().min(1).optional(),
  appearanceId: z.string().min(1).optional(),
  count: z.number().int().positive().max(6).optional(),
  customDescription: z.string().min(1).optional(),
  isBackgroundJob: z.boolean().optional(),
}).strict()

export const referenceCharacterExtractionInputSchema = z.object({
  referenceImageUrls: referenceImagesSchema,
}).strict()

export type ReferenceCharacterGenerationInput = z.infer<typeof referenceCharacterGenerationInputSchema>
export type ReferenceCharacterExtractionInput = z.infer<typeof referenceCharacterExtractionInputSchema>

function normalizeReferenceImages(referenceImageUrls: readonly string[]): string[] {
  const audit = sanitizeImageInputsForTaskPayload([...referenceImageUrls])
  if (audit.normalized.length !== referenceImageUrls.length || audit.normalized.length === 0) {
    throw new ApiError('INVALID_PARAMS', {
      code: 'REFERENCE_IMAGES_INVALID',
      issues: audit.issues,
    })
  }
  return audit.normalized
}

function buildReferenceDedupeDigest(input: {
  targetId: string
  count: number
  referenceImageUrls: readonly string[]
  customDescription?: string
}): string {
  return createHash('sha256')
    .update(JSON.stringify(input))
    .digest('hex')
    .slice(0, 24)
}

async function assertProjectTargetOwnership(params: {
  projectId: string
  characterId: string
  appearanceId: string
  isBackgroundJob: boolean
}): Promise<void> {
  if (params.isBackgroundJob && (!params.characterId || !params.appearanceId)) {
    throw new ApiError('INVALID_PARAMS', { code: 'REFERENCE_CHARACTER_TARGET_REQUIRED' })
  }
  if (!params.characterId && !params.appearanceId) return
  const appearance = params.appearanceId
    ? await prisma.characterAppearance.findFirst({
      where: {
        id: params.appearanceId,
        ...(params.characterId ? { characterId: params.characterId } : {}),
        character: { projectId: params.projectId },
      },
      select: { id: true, characterId: true },
    })
    : null
  const character = !params.appearanceId && params.characterId
    ? await prisma.projectCharacter.findFirst({
      where: { id: params.characterId, projectId: params.projectId },
      select: { id: true },
    })
    : null
  if ((params.appearanceId && !appearance) || (!params.appearanceId && params.characterId && !character)) {
    throw new ApiError('NOT_FOUND', { code: 'REFERENCE_CHARACTER_TARGET_NOT_FOUND' })
  }
}

export async function planReferenceCharacterGeneration(params: {
  ctx: ProjectAgentOperationContext
  input: ReferenceCharacterGenerationInput
}): Promise<OperationPlan> {
  const referenceImageUrls = normalizeReferenceImages(params.input.referenceImageUrls)
  const count = normalizeImageGenerationCount('reference-to-character', params.input.count)
  const characterId = params.input.characterId?.trim() ?? ''
  const appearanceId = params.input.appearanceId?.trim() ?? ''
  const isBackgroundJob = params.input.isBackgroundJob === true

  await assertProjectTargetOwnership({
    projectId: params.ctx.projectId,
    characterId,
    appearanceId,
    isBackgroundJob,
  })

  const basePayload: Record<string, unknown> = {
    referenceImageUrls,
    count,
    extractOnly: false,
    isBackgroundJob,
    ...(characterId ? { characterId } : {}),
    ...(appearanceId ? { appearanceId } : {}),
    ...(params.input.characterName ? { characterName: params.input.characterName.trim() } : {}),
    ...(params.input.customDescription ? { customDescription: params.input.customDescription.trim() } : {}),
    displayMode: 'detail',
  }
  const config = await getProjectModelConfig(params.ctx.projectId, params.ctx.userId)
  if (!config.characterModel) throw new ApiError('MISSING_CONFIG')
  await resolveModelSelection(params.ctx.userId, config.characterModel, 'image')
  const payload = await buildImageBillingPayload({
    projectId: params.ctx.projectId,
    userId: params.ctx.userId,
    imageModel: config.characterModel,
    basePayload,
    aspectRatio: CHARACTER_IMAGE_BANANA_RATIO,
  })

  const taskType = TASK_TYPE.REFERENCE_TO_CHARACTER
  const targetType = appearanceId
    ? 'CharacterAppearance'
    : 'Project'
  const targetId = appearanceId || characterId || params.ctx.projectId
  const digest = buildReferenceDedupeDigest({
    targetId,
    count,
    referenceImageUrls,
    customDescription: params.input.customDescription,
  })
  const task = createPlannedTask({
    id: `reference_to_character:${digest}`,
    taskType,
    targetType,
    targetId,
    payload,
    locale: resolveOperationLocale(params.ctx.context),
    dedupeKey: `reference_to_character:${digest}`,
    billingInfo: requirePlannedTaskBillingInfo({
      taskType,
      payload,
      allowedApiTypes: ['image'],
    }),
  })
  return {
    kind: 'task_submission',
    operationId: 'reference_to_character',
    projectId: params.ctx.projectId,
    userId: params.ctx.userId,
    tasks: [task],
    metadata: { targetType, targetId },
  }
}

export async function commitReferenceCharacterGeneration(params: {
  ctx: ProjectAgentOperationContext
  plan: OperationPlan
}) {
  const task = params.plan.tasks[0]
  if (!task || params.plan.tasks.length !== 1) {
    throw new Error('REFERENCE_CHARACTER_PLAN_TASK_INVALID:reference_to_character')
  }
  return await submitPlannedOperationTask({
    ctx: params.ctx,
    task,
    operationId: 'reference_to_character',
  })
}

export async function submitReferenceCharacterExtraction(params: {
  ctx: ProjectAgentOperationContext
  input: ReferenceCharacterExtractionInput
}) {
  const referenceImageUrls = normalizeReferenceImages(params.input.referenceImageUrls)
  const config = await getProjectModelConfig(params.ctx.projectId, params.ctx.userId)
  if (!config.analysisModel) throw new ApiError('MISSING_CONFIG')
  const payload = {
    referenceImageUrls,
    extractOnly: true,
    analysisModel: config.analysisModel,
    displayMode: 'detail',
  }
  const taskType = TASK_TYPE.REFERENCE_CHARACTER_DESCRIPTION_EXTRACT
  const digest = createHash('sha256')
    .update(JSON.stringify(referenceImageUrls))
    .digest('hex')
    .slice(0, 24)
  return await submitOperationTask({
    request: params.ctx.request,
    locale: resolveOperationLocale(params.ctx.context),
    userId: params.ctx.userId,
    projectId: params.ctx.projectId,
    type: taskType,
    targetType: 'Project',
    targetId: params.ctx.projectId,
    operationId: 'extract_reference_character_description',
    source: params.ctx.source,
    payload,
    dedupeKey: `extract_reference_character_description:${digest}`,
  })
}
