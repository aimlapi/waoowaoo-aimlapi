import type { NextRequest } from 'next/server'
import type { Locale } from '@/i18n/routing'
import { ApiError } from '@/lib/api-errors'
import { getProjectModelConfig } from '@/lib/config-service'
import { generateProjectEditScreenplay } from '@/lib/edit-script/service'
import { submitOperationTask } from '@/lib/operations/submit-operation-task'
import { prisma } from '@/lib/prisma'
import { TASK_STATUS, TASK_TYPE } from '@/lib/task/types'
import {
  deleteCreatedLongFormAssets,
  ensureLongFormGlobalAssets,
  type CreatedLongFormAsset,
} from './assets'
import { runLongFormPlanPrompt } from './model-generation'
import {
  deleteCreatedLongFormEpisodes,
  deleteLongFormPlan,
  insertLongFormPlan,
  insertLongFormSegment,
  markLongFormPlanFailed,
  markLongFormPlanReady,
  readProjectLongFormPlan,
  readSegmentRows,
  type LongFormSegmentRow,
} from './persistence'
import {
  LONG_FORM_SEGMENT_DURATION_SEC,
  durationTierForSegment,
  segmentCountForDuration,
  type LongFormAssetSummary,
  type LongFormPlanModelOutput,
  type LongFormPlanSummary,
  type SubmitLongFormPlanTaskResult,
} from './types'

export { listProjectLongFormPlans, readProjectLongFormPlan } from './persistence'

async function requireProjectAccess(input: {
  readonly projectId: string
  readonly userId: string
  readonly sourceEpisodeId?: string | null
}): Promise<void> {
  const project = await prisma.project.findFirst({
    where: {
      id: input.projectId,
      userId: input.userId,
    },
    select: { id: true },
  })
  if (!project) throw new ApiError('NOT_FOUND')
  if (!input.sourceEpisodeId) return

  const episode = await prisma.projectEpisode.findFirst({
    where: {
      id: input.sourceEpisodeId,
      projectId: input.projectId,
    },
    select: { id: true },
  })
  if (!episode) throw new ApiError('NOT_FOUND')
}

function resolveTextModel(config: Awaited<ReturnType<typeof getProjectModelConfig>>): string {
  if (!config.analysisModel) {
    throw new ApiError('INVALID_PARAMS', {
      code: 'MISSING_ANALYSIS_MODEL',
      message: 'Analysis model is required for long-form plan generation',
    })
  }
  return config.analysisModel
}

async function findActiveLongFormTaskTarget(params: {
  readonly projectId: string
  readonly dedupeKey: string
}): Promise<string | null> {
  const task = await prisma.task.findFirst({
    where: {
      projectId: params.projectId,
      type: TASK_TYPE.LONG_FORM_PLAN_GENERATE,
      dedupeKey: params.dedupeKey,
      status: { in: [TASK_STATUS.QUEUED, TASK_STATUS.PROCESSING] },
    },
    select: { targetId: true },
  })
  return task?.targetId ?? null
}

async function nextEpisodeNumber(projectId: string): Promise<number> {
  const latest = await prisma.projectEpisode.findFirst({
    where: { projectId },
    orderBy: { episodeNumber: 'desc' },
    select: { episodeNumber: true },
  })
  return (latest?.episodeNumber ?? 0) + 1
}

async function createLongFormSegments(input: {
  readonly request: NextRequest
  readonly planId: string
  readonly projectId: string
  readonly userId: string
  readonly locale: Locale
  readonly aspectRatio: '9:16' | '16:9' | '21:9'
  readonly modelOutput: LongFormPlanModelOutput
  readonly assetRefs: readonly LongFormAssetSummary[]
}): Promise<{
  readonly segmentIds: readonly string[]
  readonly episodeIds: readonly string[]
}> {
  let episodeNumber = await nextEpisodeNumber(input.projectId)
  const segmentIds: string[] = []
  const createdEpisodeIds: string[] = []
  try {
    for (const segment of input.modelOutput.segments) {
      const episode = await prisma.projectEpisode.create({
        data: {
          projectId: input.projectId,
          episodeNumber,
          name: segment.title,
          description: segment.synopsis,
          novelText: segment.prompt,
        },
        select: { id: true },
      })
      createdEpisodeIds.push(episode.id)
      episodeNumber += 1

      const screenplay = await generateProjectEditScreenplay({
        request: input.request,
        projectId: input.projectId,
        episodeId: episode.id,
        userId: input.userId,
        locale: input.locale,
        prompt: segment.prompt,
        durationTier: durationTierForSegment(segment.targetDurationSec),
        aspectRatio: input.aspectRatio,
      })

      segmentIds.push(await insertLongFormSegment({
        planId: input.planId,
        projectId: input.projectId,
        episodeId: episode.id,
        segmentIndex: segment.index,
        title: segment.title,
        synopsis: segment.synopsis,
        screenplayText: screenplay.screenplayText,
        targetDurationSec: segment.targetDurationSec,
        assetRefs: input.assetRefs,
      }))
    }
  } catch (error) {
    await deleteCreatedLongFormEpisodes(createdEpisodeIds)
    throw error
  }
  return {
    segmentIds,
    episodeIds: createdEpisodeIds,
  }
}

function buildPlanScreenplayText(output: LongFormPlanModelOutput, segmentScreenplays: readonly LongFormSegmentRow[]): string {
  const segmentLines = segmentScreenplays.map((segment) => [
    `# ${String(segment.segmentIndex)}. ${segment.title}`,
    segment.synopsis,
    '',
    segment.screenplayText,
  ].join('\n'))
  return [
    output.title,
    output.logline,
    output.globalSynopsis,
    ...segmentLines,
  ].join('\n\n')
}

export async function generateProjectLongFormPlan(input: {
  readonly request: NextRequest
  readonly projectId: string
  readonly userId: string
  readonly locale: Locale
  readonly planId: string
  readonly prompt: string
  readonly totalDurationSec: number
  readonly aspectRatio: '9:16' | '16:9' | '21:9'
}): Promise<LongFormPlanSummary> {
  try {
    await requireProjectAccess({
      projectId: input.projectId,
      userId: input.userId,
    })
    const config = await getProjectModelConfig(input.projectId, input.userId)
    const model = resolveTextModel(config)
    const segmentCount = segmentCountForDuration(input.totalDurationSec)
    const output = await runLongFormPlanPrompt({
      userId: input.userId,
      projectId: input.projectId,
      model,
      locale: input.locale,
      prompt: input.prompt,
      totalDurationSec: input.totalDurationSec,
      segmentCount,
      aspectRatio: input.aspectRatio,
    })
    let createdAssets: readonly CreatedLongFormAsset[] = []
    let createdEpisodeIds: readonly string[] = []
    try {
      const assetResult = await ensureLongFormGlobalAssets({
        projectId: input.projectId,
        assets: output.globalAssets,
      })
      createdAssets = assetResult.createdAssets
      const segmentResult = await createLongFormSegments({
        request: input.request,
        planId: input.planId,
        projectId: input.projectId,
        userId: input.userId,
        locale: input.locale,
        aspectRatio: input.aspectRatio,
        modelOutput: output,
        assetRefs: assetResult.assets,
      })
      createdEpisodeIds = segmentResult.episodeIds
      const segments = await readSegmentRows(input.planId)
      await markLongFormPlanReady({
        planId: input.planId,
        screenplayText: buildPlanScreenplayText(output, segments),
        globalAssets: output.globalAssets,
      })
    } catch (error) {
      await deleteCreatedLongFormEpisodes(createdEpisodeIds)
      await deleteCreatedLongFormAssets(createdAssets)
      throw error
    }
    const plan = await readProjectLongFormPlan({
      projectId: input.projectId,
      planId: input.planId,
    })
    if (!plan) throw new ApiError('NOT_FOUND')
    return plan
  } catch (caught) {
    const message = caught instanceof Error ? caught.message : String(caught)
    await markLongFormPlanFailed({
      planId: input.planId,
      message,
    })
    throw caught
  }
}

export async function submitProjectLongFormPlanGenerationTask(input: {
  readonly request: NextRequest
  readonly projectId: string
  readonly userId: string
  readonly locale: Locale
  readonly sourceEpisodeId?: string | null
  readonly prompt: string
  readonly totalDurationSec: number
  readonly aspectRatio: '9:16' | '16:9' | '21:9'
  readonly source: string
  readonly confirmed: boolean
}): Promise<SubmitLongFormPlanTaskResult> {
  await requireProjectAccess({
    projectId: input.projectId,
    userId: input.userId,
    sourceEpisodeId: input.sourceEpisodeId ?? null,
  })
  const segmentCount = segmentCountForDuration(input.totalDurationSec)
  const dedupeKey = `long_form_plan_generate:${input.projectId}`
  const activeTargetId = await findActiveLongFormTaskTarget({
    projectId: input.projectId,
    dedupeKey,
  })
  const planId = activeTargetId ?? await insertLongFormPlan({
    projectId: input.projectId,
    sourceEpisodeId: input.sourceEpisodeId ?? null,
    userPrompt: input.prompt,
    totalDurationSec: input.totalDurationSec,
    segmentCount,
  })
  const config = await getProjectModelConfig(input.projectId, input.userId)
  const model = resolveTextModel(config)

  try {
    const result = await submitOperationTask({
      request: input.request,
      projectId: input.projectId,
      userId: input.userId,
      type: TASK_TYPE.LONG_FORM_PLAN_GENERATE,
      targetType: 'ProjectLongFormPlan',
      targetId: planId,
      operationId: 'generate_long_form_plan',
      source: input.source,
      confirmed: input.confirmed,
      payload: {
        planId,
        prompt: input.prompt,
        totalDurationSec: input.totalDurationSec,
        segmentDurationSec: LONG_FORM_SEGMENT_DURATION_SEC,
        segmentCount,
        aspectRatio: input.aspectRatio,
        analysisModel: model,
        maxInputTokens: Math.max(3000, Math.ceil(input.prompt.length * 1.2)),
        displayMode: 'detail',
      },
      dedupeKey,
      locale: input.locale,
    })

    return {
      success: result.success,
      async: result.async,
      taskId: result.taskId,
      runId: result.runId,
      status: result.status,
      deduped: result.deduped,
      projectId: input.projectId,
      planId,
      taskType: TASK_TYPE.LONG_FORM_PLAN_GENERATE,
      targetType: 'ProjectLongFormPlan',
      targetId: planId,
    }
  } catch (error) {
    if (!activeTargetId) await deleteLongFormPlan(planId)
    throw error
  }
}

export function createLongFormWorkerRequest(jobData: {
  readonly trace?: { readonly requestId?: string | null } | null
  readonly locale: Locale
}): NextRequest {
  const headers = new Headers()
  headers.set('accept-language', jobData.locale)
  const requestId = jobData.trace?.requestId ?? null
  if (requestId) headers.set('x-request-id', requestId)
  return new Request('http://localhost/internal/tasks/long-form-plan', {
    method: 'POST',
    headers,
  }) as NextRequest
}
