import type { Job } from 'bullmq'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { TASK_TYPE, type TaskJobData } from '@/lib/task/types'

const prismaMock = vi.hoisted(() => ({
  projectVisualReferenceCase: {
    findFirst: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
  },
}))

const mediaServiceMock = vi.hoisted(() => ({
  ensureMediaObjectFromStorageKey: vi.fn(),
}))

const aiExecMock = vi.hoisted(() => ({
  executeAiTextStep: vi.fn(),
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
vi.mock('@/lib/ai-exec/engine', () => aiExecMock)
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
    prismaMock.projectVisualReferenceCase.findFirst.mockResolvedValue(null)
    prismaMock.projectVisualReferenceCase.create
      .mockResolvedValueOnce({ id: 'visual-case-1', status: 'processing', imageUrl: null })
      .mockResolvedValueOnce({ id: 'visual-case-2', status: 'processing', imageUrl: null })
    prismaMock.projectVisualReferenceCase.update.mockResolvedValue({})
    aiExecMock.executeAiTextStep.mockResolvedValue({
      text: JSON.stringify([
        {
          key: 'sunny-paris-walk',
          title: '晴日巴黎散步',
          description: '清亮自然光和开阔公园空间，让爱情像天气一样轻盈。',
          visualDirection: '共享场景：同一对恋人在巴黎公园长椅旁并肩站立，人物站位、长椅、树道、远处行人和中远景构图完全一致。画风处理：美式动漫风，清亮自然光，粗线条角色设计，宽阔环境，轻盈色块。',
        },
        {
          key: 'river-bookstall-evening',
          title: '河岸旧书黄昏',
          description: '塞纳河旧书摊、晚霞和行人层次，突出偶遇的温柔距离。',
          visualDirection: '共享场景：同一对恋人在巴黎公园长椅旁并肩站立，人物站位、长椅、树道、远处行人和中远景构图完全一致。画风处理：黑白文艺片风，高反差银盐颗粒，克制光影，环境层次清楚。',
        },
      ]),
      reasoning: '',
      usage: null,
      completion: null,
    })
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
      analysisModel: 'analysis-model-1',
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
    expect(prismaMock.projectVisualReferenceCase.create).toHaveBeenNthCalledWith(1, {
      data: expect.objectContaining({
        projectId: 'project-1',
        episodeId: 'episode-1',
        screenplayId: 'screenplay-1',
        title: '晴日巴黎散步',
        description: expect.stringContaining('清亮自然光'),
        prompt: expect.stringContaining('共享场景：同一对恋人在巴黎公园长椅旁并肩站立'),
        status: 'processing',
        taskId: 'task-visual-reference-1',
        sortIndex: 0,
      }),
      select: {
        id: true,
        status: true,
        imageUrl: true,
      },
    })
    expect(prismaMock.projectVisualReferenceCase.create).toHaveBeenNthCalledWith(2, {
      data: expect.objectContaining({
        title: '河岸旧书黄昏',
        description: expect.stringContaining('塞纳河旧书摊'),
        prompt: expect.stringContaining('画风处理：黑白文艺片风'),
        sortIndex: 1,
      }),
      select: {
        id: true,
        status: true,
        imageUrl: true,
      },
    })
    expect(aiExecMock.executeAiTextStep).toHaveBeenCalledWith(expect.objectContaining({
      userId: 'user-1',
      model: 'analysis-model-1',
      projectId: 'project-1',
      action: 'visual_reference_style_plan',
    }))
    expect(aiExecMock.executeAiTextStep.mock.calls[0]?.[0].messages[0]?.content).toContain('不要复用固定预设组合')
    expect(aiExecMock.executeAiTextStep.mock.calls[0]?.[0].messages[0]?.content).toContain('所有方案必须表现完全同一个场景')
    expect(aiExecMock.executeAiTextStep.mock.calls[0]?.[0].messages[0]?.content).toContain('美式动漫/漫画、日式动漫、性冷淡极简')
    expect(aiExecMock.executeAiTextStep.mock.calls[0]?.[0].messages[0]?.content).toContain('这一组必须跨越不同媒介家族')
    expect(aiExecMock.executeAiTextStep.mock.calls[0]?.[0].messages[0]?.content).toContain('最多只能有 1 个普通摄影写实')
    expect(aiExecMock.executeAiTextStep.mock.calls[0]?.[0].messages[0]?.content).toContain('主动跳出到动画、粘土、图形、霓虹、黑白、微缩')
    expect(aiExecMock.executeAiTextStep.mock.calls[0]?.[0].messages[0]?.content).toContain('每个 visualDirection 必须明确包含')
    expect(utilsMock.resolveImageSourceFromGeneration.mock.calls[0]?.[1].prompt).toContain('共享场景：同一对恋人在巴黎公园长椅旁并肩站立')
    expect(utilsMock.resolveImageSourceFromGeneration.mock.calls[1]?.[1].prompt).toContain('共享场景：同一对恋人在巴黎公园长椅旁并肩站立')
    expect(utilsMock.resolveImageSourceFromGeneration.mock.calls[0]?.[1].prompt).toContain('不要重新从剧本里选择其他瞬间')
    expect(utilsMock.resolveImageSourceFromGeneration.mock.calls[0]?.[1].prompt).toContain('只改变画风处理')
    expect(utilsMock.resolveImageSourceFromGeneration.mock.calls[0]?.[1].prompt).toContain('画风家族优先级高于当前项目风格')
    expect(utilsMock.resolveImageSourceFromGeneration.mock.calls[0]?.[1].prompt).toContain('成图必须明显变成这个媒介家族')
    expect(utilsMock.resolveImageSourceFromGeneration.mock.calls[0]?.[1].prompt).toContain('色彩体系、构图规则、材质颗粒')
    expect(utilsMock.resolveImageSourceFromGeneration.mock.calls[0]?.[1].prompt).toContain('中远景、远景或全景式建立镜头')
    expect(utilsMock.resolveImageSourceFromGeneration.mock.calls[0]?.[1].prompt).toContain('避免脸部特写、半身特写')
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
      analysisModel: 'analysis-model-1',
    }))).rejects.toThrow('imageModel is required')

    expect(prismaMock.projectVisualReferenceCase.create).not.toHaveBeenCalled()
    expect(utilsMock.resolveImageSourceFromGeneration).not.toHaveBeenCalled()
  })

  it('fails explicitly when the analysis model is missing', async () => {
    await expect(handleVisualReferenceCasesTask(buildJob({
      episodeId: 'episode-1',
      screenplayId: 'screenplay-1',
      screenplayText: '确认后的剧本',
      imageModel: 'image-model-1',
      analysisModel: '',
    }))).rejects.toThrow('analysisModel is required')

    expect(aiExecMock.executeAiTextStep).not.toHaveBeenCalled()
    expect(prismaMock.projectVisualReferenceCase.create).not.toHaveBeenCalled()
    expect(utilsMock.resolveImageSourceFromGeneration).not.toHaveBeenCalled()
  })

  it('reuses completed cases on retry so one failed image does not duplicate the whole style set', async () => {
    prismaMock.projectVisualReferenceCase.findFirst
      .mockResolvedValueOnce({
        id: 'visual-case-1',
        status: 'completed',
        imageUrl: '/m/existing-media-1',
      })
      .mockResolvedValueOnce({
        id: 'visual-case-2',
        status: 'failed',
        imageUrl: null,
      })
    prismaMock.projectVisualReferenceCase.update
      .mockResolvedValueOnce({ id: 'visual-case-2', status: 'processing', imageUrl: null })
      .mockResolvedValueOnce({})
    utilsMock.resolveImageSourceFromGeneration.mockReset()
    utilsMock.resolveImageSourceFromGeneration.mockResolvedValueOnce('generated-image-source-2')
    utilsMock.uploadImageSourceToCos.mockReset()
    utilsMock.uploadImageSourceToCos.mockResolvedValueOnce('visual-reference/visual-case-2.png')
    mediaServiceMock.ensureMediaObjectFromStorageKey.mockReset()
    mediaServiceMock.ensureMediaObjectFromStorageKey.mockResolvedValueOnce({ id: 'media-2', url: '/m/media-2' })

    const result = await handleVisualReferenceCasesTask(buildJob({
      episodeId: 'episode-1',
      screenplayId: 'screenplay-1',
      screenplayText: '第一场，雨夜。主角站在街边，看见远处的灯光。',
      imageModel: 'image-model-1',
      analysisModel: 'analysis-model-1',
      count: 2,
      aspectRatio: '16:9',
    }))

    expect(result).toEqual({
      episodeId: 'episode-1',
      screenplayId: 'screenplay-1',
      count: 2,
      cases: [
        { caseId: 'visual-case-1', imageUrl: '/m/existing-media-1' },
        { caseId: 'visual-case-2', imageUrl: '/m/media-2' },
      ],
    })
    expect(prismaMock.projectVisualReferenceCase.create).not.toHaveBeenCalled()
    expect(utilsMock.resolveImageSourceFromGeneration).toHaveBeenCalledTimes(1)
    expect(prismaMock.projectVisualReferenceCase.update).toHaveBeenCalledWith({
      where: { id: 'visual-case-2' },
      data: expect.objectContaining({
        status: 'processing',
        errorMessage: null,
        imageUrl: null,
        imageMediaId: null,
      }),
      select: {
        id: true,
        status: true,
        imageUrl: true,
      },
    })
  })
})
