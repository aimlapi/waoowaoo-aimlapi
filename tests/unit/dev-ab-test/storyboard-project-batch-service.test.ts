import { beforeEach, describe, expect, it, vi } from 'vitest'

type TxCreateInput = {
  readonly data: Record<string, unknown>
}

const prismaState = vi.hoisted(() => ({
  clipIndex: 0,
  storyboardIndex: 0,
  panelIndex: 0,
}))

const txMock = vi.hoisted(() => ({
  projectClip: {
    create: vi.fn(async () => {
      prismaState.clipIndex += 1
      return { id: `clip-${prismaState.clipIndex}` }
    }),
  },
  projectStoryboard: {
    create: vi.fn(async (input: TxCreateInput) => {
      prismaState.storyboardIndex += 1
      return {
        id: `storyboard-${prismaState.storyboardIndex}`,
        clipId: String(input.data.clipId),
        episodeId: String(input.data.episodeId),
      }
    }),
  },
  projectPanel: {
    create: vi.fn(async (input: TxCreateInput) => {
      prismaState.panelIndex += 1
      return {
        id: `panel-${prismaState.panelIndex}`,
        panelIndex: Number(input.data.panelIndex),
        panelNumber: Number(input.data.panelNumber),
      }
    }),
  },
}))

const prismaMock = vi.hoisted(() => ({
  userPreference: {
    findUnique: vi.fn(async () => null),
  },
  project: {
    create: vi.fn(async (input: TxCreateInput) => ({
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
    create: vi.fn(async () => {
      const index = prismaMock.projectCharacter.create.mock.calls.length
      return {
        id: `character-${index}`,
        appearances: [{ id: `appearance-${index}` }],
      }
    }),
  },
  projectLocation: {
    create: vi.fn(async () => ({ id: 'location-1' })),
  },
  $transaction: vi.fn(async (callback: (tx: typeof txMock) => Promise<unknown>) => callback(txMock)),
}))

const submitStoryboardPanelTaskMock = vi.hoisted(() => vi.fn(async (input: {
  readonly panel: { readonly id: string; readonly panelIndex: number; readonly panelNumber?: number | null }
}) => ({
  panelNumber: input.panel.panelNumber ?? input.panel.panelIndex + 1,
  panelId: input.panel.id,
  taskId: `task-${input.panel.id}`,
  status: 'queued',
})))

vi.mock('@/lib/prisma', () => ({ prisma: prismaMock }))
vi.mock('@/lib/config-service', () => ({
  getProjectModelConfig: vi.fn(async () => ({ storyboardModel: 'storyboard-model' })),
  resolveProjectModelCapabilityGenerationOptions: vi.fn(async () => ({})),
}))
vi.mock('@/lib/image-generation/style', () => ({
  resolveProjectImageStyleSignatureForTask: vi.fn(async () => 'style-signature'),
}))
vi.mock('@/lib/dev-ab-test/storyboard-batch-submit', () => ({
  submitStoryboardPanelTask: submitStoryboardPanelTaskMock,
}))

describe('storyboard batch project service', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    prismaState.clipIndex = 0
    prismaState.storyboardIndex = 0
    prismaState.panelIndex = 0
  })

  it('creates one shared upstream project and branches only at storyboard generation', async () => {
    const { createStoryboardBatchProjects } = await import('@/lib/dev-ab-test/storyboard-project-batch')

    const result = await createStoryboardBatchProjects({
      userId: 'user-1',
      locale: 'zh',
      requestId: 'request-1',
      storyText: '一个家庭餐桌场景，A 女左，B 男右，C 从后右门进入。',
      projectNamePrefix: '单项目分镜测试',
      videoRatio: '9:16',
      artStyle: 'realistic',
      panelCount: 3,
    })

    expect(prismaMock.project.create).toHaveBeenCalledTimes(1)
    expect(prismaMock.projectEpisode.create).toHaveBeenCalledTimes(1)
    expect(txMock.projectClip.create).toHaveBeenCalledTimes(3)
    expect(txMock.projectStoryboard.create).toHaveBeenCalledTimes(3)
    expect(new Set(result.projects.map((project) => project.projectId))).toEqual(new Set(['project-1']))
    expect(new Set(result.projects.map((project) => project.episodeId))).toEqual(new Set(['episode-1']))
    expect(new Set(result.projects.map((project) => project.storyboardId)).size).toBe(3)
    expect(result.projects.find((project) => project.schemeId === 'first-panel-img2img')?.tasks).toHaveLength(1)
    expect(result.projects.find((project) => project.schemeId === 'global-continuity-prompt')?.tasks).toHaveLength(3)
    expect(result.projects.find((project) => project.schemeId === 'top-down-spatial-lock')?.tasks).toHaveLength(3)

    const topDownPanelCreates = txMock.projectPanel.create.mock.calls
      .map((call) => call[0].data)
      .filter((data) => String(data.imagePrompt).includes('SPATIAL TRUTH / TOP-DOWN LOCK:'))
    expect(topDownPanelCreates).toHaveLength(3)
    const firstTopDownRules = JSON.parse(String(topDownPanelCreates[0]?.photographyRules)) as {
      readonly schemeId: string
      readonly singleBoardOutput: boolean
      readonly spatialBlocking: string | null
    }
    expect(firstTopDownRules).toEqual(expect.objectContaining({
      schemeId: 'top-down-spatial-lock',
      singleBoardOutput: false,
    }))
    expect(firstTopDownRules.spatialBlocking).toContain('俯视平面图')
  })

  it('does not duplicate the protagonist when only two screenplay characters exist', async () => {
    const { createStoryboardBatchBranches } = await import('@/lib/dev-ab-test/storyboard-project-batch')

    await createStoryboardBatchBranches({
      userId: 'user-1',
      locale: 'zh',
      requestId: 'request-1',
      storyText: '两人戏：林静和母亲在老家院子择菜。',
      projectNamePrefix: '两人分镜测试',
      videoRatio: '16:9',
      artStyle: 'realistic',
      panelCount: 4,
      setup: {
        projectId: 'project-1',
        projectName: '两人分镜测试',
        episodeId: 'episode-1',
        characterIds: ['character-lin', 'character-mother'],
        appearanceIds: ['appearance-lin', 'appearance-mother'],
        characterNames: ['林静', '母亲'],
      },
    })

    const panelCreates = txMock.projectPanel.create.mock.calls.map((call) => call[0].data)
    const twoCharacterPanel = panelCreates.find((data) => data.panelNumber === 4)
    expect(twoCharacterPanel).toBeTruthy()
    const characters = JSON.parse(String(twoCharacterPanel?.characters)) as Array<{
      readonly characterId: string
      readonly name: string
      readonly slot: string
    }>
    expect(characters).toEqual([
      expect.objectContaining({ characterId: 'character-lin', name: '林静', slot: 'screen-left' }),
      expect.objectContaining({ characterId: 'character-mother', name: '母亲', slot: 'screen-right' }),
    ])
    expect(String(twoCharacterPanel?.description)).not.toContain('character C')
  })
})
