import type { Job } from 'bullmq'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { TASK_TYPE, type TaskJobData } from '@/lib/task/types'

const prismaMock = vi.hoisted(() => ({
  projectVisualReferenceCase: {
    create: vi.fn(),
    update: vi.fn(),
  },
}))

const mediaServiceMock = vi.hoisted(() => ({
  ensureMediaObjectFromStorageKey: vi.fn(),
}))

const utilsMock = vi.hoisted(() => ({
  assertTaskActive: vi.fn(async () => undefined),
  resolveImageSourceFromGeneration: vi.fn(),
  uploadImageSourceToCos: vi.fn(),
}))

const sharedMock = vi.hoisted(() => ({
  reportTaskProgress: vi.fn(async () => undefined),
}))

vi.mock('@/lib/prisma', () => ({ prisma: prismaMock }))
vi.mock('@/lib/media/service', () => mediaServiceMock)
vi.mock('@/lib/workers/utils', () => utilsMock)
vi.mock('@/lib/workers/shared', () => sharedMock)

import { handleVisualReferenceCasesTask } from '@/lib/workers/handlers/visual-reference-cases-task-handler'

function buildJob(payload: Record<string, unknown>): Job<TaskJobData> {
  return {
    data: {
      taskId: 'task-visual-reference-1',
      type: TASK_TYPE.VISUAL_REFERENCE_CASES,
      locale: 'zh',
      projectId: 'project-1',
      episodeId: 'episode-1',
      targetType: 'ProjectEpisode',
      targetId: 'episode-1',
      payload,
      userId: 'user-1',
    },
  } as unknown as Job<TaskJobData>
}

describe('visual reference cases task handler', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    prismaMock.projectVisualReferenceCase.create
      .mockResolvedValueOnce({ id: 'visual-case-1' })
      .mockResolvedValueOnce({ id: 'visual-case-2' })
    prismaMock.projectVisualReferenceCase.update.mockResolvedValue({})
    utilsMock.resolveImageSourceFromGeneration
      .mockResolvedValueOnce('generated-image-source-1')
      .mockResolvedValueOnce('generated-image-source-2')
    utilsMock.uploadImageSourceToCos
      .mockResolvedValueOnce('visual-reference/visual-case-1.png')
      .mockResolvedValueOnce('visual-reference/visual-case-2.png')
    mediaServiceMock.ensureMediaObjectFromStorageKey
      .mockResolvedValueOnce({ id: 'media-1', url: '/m/media-1' })
      .mockResolvedValueOnce({ id: 'media-2', url: '/m/media-2' })
  })

  it('generates independent style reference images without writing downstream workflow data', async () => {
    const result = await handleVisualReferenceCasesTask(buildJob({
      episodeId: 'episode-1',
      screenplayId: 'screenplay-1',
      screenplayText: '第一场，雨夜。主角站在街边，看见远处的灯光。',
      userPrompt: '克制、现实、都市情绪',
      imageModel: 'image-model-1',
      count: 2,
      aspectRatio: '16:9',
      artStyle: 'cinematic',
      generationOptions: { quality: 'high' },
    }))

    expect(result).toEqual({
      episodeId: 'episode-1',
      screenplayId: 'screenplay-1',
      count: 2,
      cases: [
        { caseId: 'visual-case-1', imageUrl: '/m/media-1' },
        { caseId: 'visual-case-2', imageUrl: '/m/media-2' },
      ],
    })
    expect(prismaMock.projectVisualReferenceCase.create).toHaveBeenCalledTimes(2)
    expect(prismaMock.projectVisualReferenceCase.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        projectId: 'project-1',
        episodeId: 'episode-1',
        screenplayId: 'screenplay-1',
        status: 'processing',
        taskId: 'task-visual-reference-1',
        sortIndex: 0,
      }),
      select: { id: true },
    })
    expect(utilsMock.resolveImageSourceFromGeneration).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        modelId: 'image-model-1',
        allowTaskExternalIdResume: false,
        options: expect.objectContaining({
          aspectRatio: '16:9',
          quality: 'high',
        }),
      }),
    )
    expect(utilsMock.resolveImageSourceFromGeneration.mock.calls[0]?.[1].prompt).toContain('这只是交给用户看的画面气质参考')
    expect(prismaMock.projectVisualReferenceCase.update).toHaveBeenCalledWith({
      where: { id: 'visual-case-1' },
      data: {
        status: 'completed',
        imageUrl: '/m/media-1',
        imageMediaId: 'media-1',
        errorMessage: null,
      },
    })
  })

  it('fails explicitly when the image model is missing', async () => {
    await expect(handleVisualReferenceCasesTask(buildJob({
      episodeId: 'episode-1',
      screenplayId: 'screenplay-1',
      screenplayText: '确认后的剧本',
      imageModel: '',
    }))).rejects.toThrow('imageModel is required')

    expect(prismaMock.projectVisualReferenceCase.create).not.toHaveBeenCalled()
    expect(utilsMock.resolveImageSourceFromGeneration).not.toHaveBeenCalled()
  })
})
