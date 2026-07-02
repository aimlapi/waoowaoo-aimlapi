import type { Job } from 'bullmq'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { TASK_TYPE, type TaskJobData } from '@/lib/task/types'

const serviceMock = vi.hoisted(() => ({
  createLongFormWorkerRequest: vi.fn(() => new Request('http://localhost/internal/tasks/long-form-plan', { method: 'POST' })),
  generateProjectLongFormPlan: vi.fn(async () => ({
    id: 'plan-1',
    projectId: 'project-1',
    status: 'ready',
    segmentCount: 2,
    segments: [
      {
        id: 'segment-1',
        episodeId: 'episode-2',
        segmentIndex: 1,
        title: '第一段',
        synopsis: '开端',
        targetDurationSec: 120,
        status: 'screenplay_ready',
      },
      {
        id: 'segment-2',
        episodeId: 'episode-3',
        segmentIndex: 2,
        title: '第二段',
        synopsis: '结局',
        targetDurationSec: 120,
        status: 'screenplay_ready',
      },
    ],
  })),
}))

const workerMock = vi.hoisted(() => ({
  reportTaskProgress: vi.fn(async () => undefined),
  assertTaskActive: vi.fn(async () => undefined),
}))

vi.mock('@/lib/long-form/service', () => serviceMock)
vi.mock('@/lib/workers/shared', () => ({ reportTaskProgress: workerMock.reportTaskProgress }))
vi.mock('@/lib/workers/utils', () => ({ assertTaskActive: workerMock.assertTaskActive }))

import { handleLongFormPlanGenerateTask } from '@/lib/workers/handlers/long-form-plan-generate'

function buildJob(payload: Record<string, unknown>): Job<TaskJobData> {
  return {
    data: {
      taskId: 'task-long-form-1',
      type: TASK_TYPE.LONG_FORM_PLAN_GENERATE,
      locale: 'zh',
      projectId: 'project-1',
      targetType: 'ProjectLongFormPlan',
      targetId: 'plan-1',
      payload,
      userId: 'user-1',
      trace: { requestId: 'request-1' },
    },
  } as unknown as Job<TaskJobData>
}

describe('worker long-form plan generation behavior', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('generates a long-form plan through the stable ProjectLongFormPlan task target', async () => {
    const result = await handleLongFormPlanGenerateTask(buildJob({
      planId: 'plan-1',
      prompt: '生成一个 4 分钟悬疑短剧',
      totalDurationSec: 240,
      aspectRatio: '16:9',
    }))

    expect(serviceMock.generateProjectLongFormPlan).toHaveBeenCalledWith(expect.objectContaining({
      projectId: 'project-1',
      userId: 'user-1',
      locale: 'zh',
      planId: 'plan-1',
      prompt: '生成一个 4 分钟悬疑短剧',
      totalDurationSec: 240,
      aspectRatio: '16:9',
    }))
    expect(workerMock.reportTaskProgress).toHaveBeenCalledWith(expect.anything(), 10, expect.objectContaining({
      stage: 'long_form_plan_prepare',
    }))
    expect(workerMock.reportTaskProgress).toHaveBeenCalledWith(expect.anything(), 96, expect.objectContaining({
      stage: 'long_form_plan_persist',
    }))
    expect(result).toEqual({
      planId: 'plan-1',
      projectId: 'project-1',
      status: 'ready',
      segmentCount: 2,
      createdSegmentCount: 2,
    })
  })

  it('fails explicitly when required payload fields are missing', async () => {
    await expect(handleLongFormPlanGenerateTask(buildJob({
      prompt: '生成一个 4 分钟悬疑短剧',
      totalDurationSec: 240,
      aspectRatio: '16:9',
    }))).resolves.toEqual(expect.objectContaining({ planId: 'plan-1' }))

    await expect(handleLongFormPlanGenerateTask(buildJob({
      planId: 'plan-1',
      totalDurationSec: 240,
      aspectRatio: '16:9',
    }))).rejects.toThrow('prompt is required')

    await expect(handleLongFormPlanGenerateTask(buildJob({
      planId: 'plan-1',
      prompt: '生成一个 4 分钟悬疑短剧',
      totalDurationSec: 120,
      aspectRatio: '16:9',
    }))).rejects.toThrow('totalDurationSec is required')
  })
})
