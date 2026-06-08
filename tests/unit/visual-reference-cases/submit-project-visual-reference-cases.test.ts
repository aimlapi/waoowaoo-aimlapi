import type { NextRequest } from 'next/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const prismaMock = vi.hoisted(() => ({
  project: {
    findFirst: vi.fn(),
  },
  projectEpisode: {
    findFirst: vi.fn(),
  },
  projectEditScreenplay: {
    findFirst: vi.fn(),
  },
}))

const configServiceMock = vi.hoisted(() => ({
  buildImageBillingPayload: vi.fn(async (input: unknown) => {
    const record = input as Record<string, unknown>
    return {
      ...record,
      imageModel: 'image-model-1',
      billingInfo: { units: 1 },
      generationOptions: { quality: 'high' },
    }
  }),
}))

const operationTaskMock = vi.hoisted(() => ({
  submitOperationTask: vi.fn(async () => ({
    success: true,
    async: true,
    taskId: 'task-1',
    status: 'queued',
  })),
}))

vi.mock('@/lib/prisma', () => ({ prisma: prismaMock }))
vi.mock('@/lib/config-service', () => configServiceMock)
vi.mock('@/lib/operations/submit-operation-task', () => operationTaskMock)

import { submitProjectVisualReferenceCases } from '@/lib/visual-reference-cases/service'

function createRequest(): NextRequest {
  return new Request('http://localhost/api/projects/project-1/visual-reference-cases', {
    method: 'POST',
    headers: { 'accept-language': 'zh' },
  }) as unknown as NextRequest
}

describe('submitProjectVisualReferenceCases', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    prismaMock.project.findFirst.mockResolvedValue({
      id: 'project-1',
      analysisModel: 'analysis-model-1',
      storyboardModel: 'image-model-1',
      videoRatio: '16:9',
      artStyle: 'american-comic',
    })
    prismaMock.projectEpisode.findFirst.mockResolvedValue({ id: 'episode-1' })
    prismaMock.projectEditScreenplay.findFirst.mockResolvedValue({
      id: 'screenplay-1',
      status: 'ready',
      screenplayText: '标题：《一夜暴富》',
      userPrompt: '50多岁穷困潦倒的老光棍，一夜暴富重金求子',
    })
  })

  it('does not forward project artStyle into post-screenplay visual reference tasks', async () => {
    await submitProjectVisualReferenceCases({
      request: createRequest(),
      projectId: 'project-1',
      episodeId: 'episode-1',
      userId: 'user-1',
      locale: 'zh',
      count: 2,
    })

    expect(prismaMock.project.findFirst).toHaveBeenCalledWith(expect.objectContaining({
      select: expect.not.objectContaining({
        artStyle: true,
      }),
    }))
    const firstBillingCall = configServiceMock.buildImageBillingPayload.mock.calls[0] as unknown as readonly [unknown] | undefined
    const billingInput = firstBillingCall?.[0] as {
      readonly basePayload?: Record<string, unknown>
    }
    expect(billingInput.basePayload).not.toHaveProperty('artStyle')
    const firstSubmitCall = operationTaskMock.submitOperationTask.mock.calls[0] as unknown as readonly [unknown] | undefined
    const taskInput = firstSubmitCall?.[0] as {
      readonly payload?: Record<string, unknown>
    }
    expect(taskInput.payload).not.toHaveProperty('artStyle')
  })
})
