import type { Job } from 'bullmq'
import {
  createLongFormWorkerRequest,
  generateProjectLongFormPlan,
} from '@/lib/long-form/service'
import { LONG_FORM_MAX_TOTAL_DURATION_SEC, LONG_FORM_SEGMENT_DURATION_SEC } from '@/lib/long-form/types'
import type { TaskJobData } from '@/lib/task/types'
import { reportTaskProgress } from '@/lib/workers/shared'
import { assertTaskActive } from '@/lib/workers/utils'

function readText(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

function readTotalDurationSec(value: unknown): number | null {
  if (typeof value !== 'number' || !Number.isInteger(value)) return null
  if (value <= LONG_FORM_SEGMENT_DURATION_SEC || value > LONG_FORM_MAX_TOTAL_DURATION_SEC) return null
  return value
}

function readAspectRatio(value: unknown): '9:16' | '16:9' | '21:9' | null {
  return value === '9:16' || value === '16:9' || value === '21:9' ? value : null
}

export async function handleLongFormPlanGenerateTask(job: Job<TaskJobData>) {
  const payload = job.data.payload || {}
  const planId = readText(payload.planId) || readText(job.data.targetId)
  const prompt = readText(payload.prompt)
  const totalDurationSec = readTotalDurationSec(payload.totalDurationSec)
  const aspectRatio = readAspectRatio(payload.aspectRatio)

  if (!planId) throw new Error('planId is required')
  if (!prompt) throw new Error('prompt is required')
  if (!totalDurationSec) throw new Error('totalDurationSec is required')
  if (!aspectRatio) throw new Error('aspectRatio is required')

  await reportTaskProgress(job, 10, {
    stage: 'long_form_plan_prepare',
    stageLabel: 'progress.stage.longFormPlanPrepare',
    displayMode: 'detail',
  })
  await assertTaskActive(job, 'long_form_plan_prepare')

  const plan = await generateProjectLongFormPlan({
    request: createLongFormWorkerRequest(job.data),
    projectId: job.data.projectId,
    userId: job.data.userId,
    locale: job.data.locale,
    planId,
    prompt,
    totalDurationSec,
    aspectRatio,
  })

  await reportTaskProgress(job, 96, {
    stage: 'long_form_plan_persist',
    stageLabel: 'progress.stage.longFormPlanPersist',
    displayMode: 'detail',
  })
  await assertTaskActive(job, 'long_form_plan_persist')

  return {
    planId: plan.id,
    projectId: plan.projectId,
    status: plan.status,
    segmentCount: plan.segmentCount,
    createdSegmentCount: plan.segments.length,
  }
}
