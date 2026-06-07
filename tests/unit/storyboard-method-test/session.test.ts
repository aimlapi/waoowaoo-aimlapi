import { NextRequest } from 'next/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'

type CreateInput = {
  readonly data: Record<string, unknown>
}

const prismaMock = vi.hoisted(() => ({
  userPreference: {
    findUnique: vi.fn(async () => ({
      analysisModel: 'analysis-model',
      characterModel: 'character-model',
      locationModel: 'location-model',
      storyboardModel: 'storyboard-model',
      editModel: 'edit-model',
      videoModel: 'video-model',
      audioModel: 'audio-model',
      musicModel: 'music-model',
      videoResolution: '1080p',
      imageResolution: 'standard',
    })),
  },
  project: {
    create: vi.fn(async (input: CreateInput) => ({
      id: 'project-1',
      name: String(input.data.name),
    })),
    update: vi.fn(async () => ({ id: 'project-1' })),
    delete: vi.fn(async () => ({ id: 'project-1' })),
  },
  projectEpisode: {
    create: vi.fn(async () => ({ id: 'episode-1' })),
  },
  projectCharacter: {
    create: vi.fn(async (input: CreateInput) => {
      const name = String(input.data.name)
      return {
        id: `character-${name}`,
        name,
        appearances: [{ id: `appearance-${name}` }],
      }
    }),
  },
  projectLocation: {
    create: vi.fn(async () => ({
      id: 'location-1',
      name: '老家小公寓客餐厅 360 参考',
    })),
  },
  task: {
    updateMany: vi.fn(async () => ({ count: 0 })),
  },
}))

const generateProjectEditScreenplayMock = vi.hoisted(() => vi.fn(async () => ({
  id: 'screenplay-1',
  screenplayText: [
    '标题：《回去》',
    '角色表：',
    '林静：35岁，短发有些凌乱，米白衬衫、深色长裤，突然失业后独自返乡的单身女性。',
    '母亲：60岁上下，灰白短发，旧开衫、围裙，住在老家的母亲。',
    '人事（仅声音）：公司人事。',
    '场景 3｜外景/内景. 老家院子和厨房门口 - 傍晚',
    '动作：母亲坐在小凳上择菜，林静拖着行李箱进院，把小绿植放到窗台上。',
  ].join('\n'),
})))

const submitProjectVisualReferenceCasesMock = vi.hoisted(() => vi.fn(async () => ({
  taskId: 'task-style-reference',
  status: 'queued',
})))

const submitAssetGenerateTaskMock = vi.hoisted(() => vi.fn(async (input: {
  readonly kind: 'character' | 'location' | 'prop'
  readonly assetId: string
}) => ({
  taskId: `task-${input.kind}-${input.assetId}`,
  status: 'queued',
})))

const createStoryboardBatchBranchesMock = vi.hoisted(() => vi.fn(async (input: {
  readonly setup: {
    readonly projectId: string
    readonly episodeId: string
    readonly characterNames: readonly string[]
  }
}) => [{
  schemeId: 'global-continuity-prompt',
  schemeTitle: '全局连续性 Prompt',
  schemeSummary: 'summary',
  projectId: input.setup.projectId,
  episodeId: input.setup.episodeId,
  storyboardId: 'storyboard-1',
  projectName: '返乡和解分镜方法测试',
  tasks: [{ panelNumber: 1, panelId: 'panel-1', taskId: 'task-panel-1', status: 'queued' }],
  characterNames: input.setup.characterNames,
}]))

vi.mock('@/lib/prisma', () => ({ prisma: prismaMock }))
vi.mock('@/lib/edit-script/service', () => ({
  generateProjectEditScreenplay: generateProjectEditScreenplayMock,
}))
vi.mock('@/lib/visual-reference-cases/service', () => ({
  submitProjectVisualReferenceCases: submitProjectVisualReferenceCasesMock,
}))
vi.mock('@/lib/assets/services/asset-actions', () => ({
  submitAssetGenerateTask: submitAssetGenerateTaskMock,
}))
vi.mock('@/lib/dev-ab-test/storyboard-project-batch', () => ({
  createStoryboardBatchBranches: createStoryboardBatchBranchesMock,
}))

describe('storyboard method test session service', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('creates normal upstream artifacts before branching storyboard methods', async () => {
    const { createStoryboardMethodTestSession } = await import('@/lib/storyboard-method-test/session')
    const request = new NextRequest(new URL('/api/storyboard-method-test/session', 'http://localhost'))

    const result = await createStoryboardMethodTestSession({
      request,
      userId: 'user-1',
      locale: 'zh',
      requestId: 'request-1',
      creativeBrief: '一个 35 岁突然失业的单身女性回老家并逐渐和解。',
      styleReferenceNote: '风格示意只用于气质参考。',
      projectName: '返乡和解分镜方法测试',
      videoRatio: '16:9',
      artStyle: '肯洛奇式社会写实',
      panelCount: 6,
    })

    const screenplayCall = generateProjectEditScreenplayMock.mock.calls.at(0) as unknown as readonly [{
      readonly prompt: string
    }]
    const screenplayPrompt = screenplayCall[0].prompt
    expect(screenplayPrompt).toContain('项目视觉方向：肯洛奇式社会写实。')
    expect(screenplayPrompt).not.toContain('侯孝贤')
    const screenplayCallOrder = generateProjectEditScreenplayMock.mock.invocationCallOrder[0] ?? 0
    const styleReferenceCallOrder = submitProjectVisualReferenceCasesMock.mock.invocationCallOrder[0] ?? 0
    const assetCallOrder = submitAssetGenerateTaskMock.mock.invocationCallOrder[0] ?? 0
    const storyboardCallOrder = createStoryboardBatchBranchesMock.mock.invocationCallOrder[0] ?? 0
    expect(screenplayCallOrder).toBeGreaterThan(0)
    expect(screenplayCallOrder).toBeLessThan(styleReferenceCallOrder)
    expect(styleReferenceCallOrder).toBeLessThan(assetCallOrder)
    expect(assetCallOrder).toBeLessThan(storyboardCallOrder)
    expect(prismaMock.projectCharacter.create).toHaveBeenCalledTimes(2)
    expect(prismaMock.projectLocation.create).toHaveBeenCalledTimes(1)
    expect(prismaMock.projectLocation.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        name: expect.stringContaining('老家院子和厨房门口'),
      }),
    }))
    expect(result.upstreamTasks.map((task) => task.stage)).toEqual([
      'style-reference',
      'character-asset',
      'character-asset',
      'scene-asset',
    ])
    expect(createStoryboardBatchBranchesMock).toHaveBeenCalledWith(expect.objectContaining({
      storyText: expect.stringContaining('林静'),
      setup: expect.objectContaining({
        characterNames: ['林静', '母亲'],
      }),
    }))
    expect(result.projectId).toBe('project-1')
    expect(result.episodeId).toBe('episode-1')
    expect(result.screenplayId).toBe('screenplay-1')
    expect(result.storyboardBranches).toHaveLength(1)
  })
})
