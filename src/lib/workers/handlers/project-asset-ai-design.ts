import type { Job } from 'bullmq'
import { getUserModelConfig } from '@/lib/config-service'
import { aiDesign } from '@/lib/asset-utils'
import { reportTaskProgress } from '@/lib/workers/shared'
import { assertTaskActive } from '@/lib/workers/utils'
import { TASK_TYPE, type TaskJobData } from '@/lib/task/types'

function resolveUserInstruction(payload: Record<string, unknown>): string {
  const value = payload.userInstruction
  return typeof value === 'string' ? value.trim() : ''
}

export async function handleProjectAssetAIDesignTask(job: Job<TaskJobData>) {
  const payload = (job.data.payload || {}) as Record<string, unknown>
  const userInstruction = resolveUserInstruction(payload)
  if (!userInstruction) throw new Error('userInstruction is required')
  if (!job.data.projectId) throw new Error('PROJECT_ID_REQUIRED')

  const assetType = job.data.type === TASK_TYPE.AI_CREATE_CHARACTER
    ? 'character'
    : job.data.type === TASK_TYPE.AI_CREATE_LOCATION
      ? 'location'
      : null
  if (!assetType) throw new Error(`Unsupported project asset ai design task type: ${job.data.type}`)

  const userConfig = await getUserModelConfig(job.data.userId)
  const analysisModelFromPayload = typeof payload.analysisModel === 'string' && payload.analysisModel.trim()
    ? payload.analysisModel.trim()
    : null
  const analysisModel = analysisModelFromPayload || userConfig.analysisModel || ''
  if (!analysisModel) {
    throw new Error('ANALYSIS_MODEL_NOT_CONFIGURED')
  }

  await reportTaskProgress(job, 25, {
    stage: 'project_asset_ai_design_prepare',
    stageLabel: 'progress.stage.projectAssetDesignPrepare',
    displayMode: 'detail',
  })
  await assertTaskActive(job, 'project_asset_ai_design_prepare')

  const result = await aiDesign({
    userId: job.data.userId,
    locale: job.data.locale,
    analysisModel,
    userInstruction,
    assetType,
    projectId: job.data.projectId,
    skipBilling: true,
  })
  if (!result.success || !result.prompt) {
    throw new Error(result.error || 'Generation failed')
  }

  await reportTaskProgress(job, 96, {
    stage: 'project_asset_ai_design_done',
    stageLabel: 'progress.stage.projectAssetDesignDone',
    displayMode: 'detail',
  })
  return { prompt: result.prompt }
}
