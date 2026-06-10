import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { NextRequest } from 'next/server'
import { TASK_TYPE } from '@/lib/task/types'

const castingPlanDocument = {
  characterDNA: {
    ageRange: '53-60',
    gender: 'male',
    ethnicityRegion: 'Chinese old alley',
    socialClass: 'poor working class',
    occupation: 'odd jobs',
    temperament: 'timid but performative',
    coreWound: 'lifelong invisibility',
    desireNeed: 'wants legitimacy',
    narrativeFunction: 'tragicomic protagonist',
    bodyEnergy: 'stooped and tense',
    styleCompatibility: 'stop-motion clay',
  },
  castingDirections: [
    {
      id: 'A',
      candidateIndex: 0,
      directionName: 'realist',
      interpretationLogic: 'quiet',
      faceFamily: 'long narrow',
      bodyType: 'thin',
      emotionalTemperature: 'muted',
      screenPresence: 'overlooked',
      appearanceDescriptor: {
        faceShape: 'long',
        boneStructure: 'soft narrow',
        eyes: 'drooping',
        nose: 'flat',
        lips: 'thin',
        skinTexture: 'sallow',
        hairstyle: 'sparse',
        bodyType: 'thin',
        posture: 'stooped',
        wardrobe: 'old jacket',
        visualKeywords: ['realist'],
      },
      imagePrompt: 'This is casting alternative A for the same character. same character DNA, different actor-like interpretation.',
    },
    {
      id: 'B',
      candidateIndex: 1,
      directionName: 'comic',
      interpretationLogic: 'loud',
      faceFamily: 'broad short',
      bodyType: 'stocky',
      emotionalTemperature: 'restless',
      screenPresence: 'noticeable',
      appearanceDescriptor: {
        faceShape: 'broad',
        boneStructure: 'wide',
        eyes: 'bean-like',
        nose: 'short',
        lips: 'wide',
        skinTexture: 'waxy',
        hairstyle: 'central bald patch',
        bodyType: 'stocky',
        posture: 'fake boss stance',
        wardrobe: 'red shirt',
        visualKeywords: ['comic'],
      },
      imagePrompt: 'This is casting alternative B for the same character. same character DNA, different actor-like interpretation.',
    },
    {
      id: 'C',
      candidateIndex: 2,
      directionName: 'tragic',
      interpretationLogic: 'sharp',
      faceFamily: 'angular gaunt',
      bodyType: 'extremely lean',
      emotionalTemperature: 'brittle',
      screenPresence: 'piercing',
      appearanceDescriptor: {
        faceShape: 'diamond',
        boneStructure: 'high cheekbones',
        eyes: 'deep-set',
        nose: 'hooked',
        lips: 'compressed',
        skinTexture: 'gray-yellow',
        hairstyle: 'receded',
        bodyType: 'lean',
        posture: 'folded',
        wardrobe: 'thin coat',
        visualKeywords: ['tragic'],
      },
      imagePrompt: 'This is casting alternative C for the same character. same character DNA, different actor-like interpretation.',
    },
  ],
  diversityCheck: {
    AB: 'different',
    AC: 'different',
    BC: 'different',
    passed: true,
  },
}

const prismaMock = vi.hoisted(() => ({
  characterAppearance: {
    findFirst: vi.fn(),
  },
  projectEditScreenplay: {
    findFirst: vi.fn(),
  },
}))

const submitTaskState = vi.hoisted(() => ({
  nextIndex: 0,
  submitTask: vi.fn(async () => {
    const taskId = `task-${submitTaskState.nextIndex}`
    submitTaskState.nextIndex += 1
    return {
      success: true,
      async: true,
      taskId,
      status: 'queued',
      runId: null,
      deduped: false,
    }
  }),
}))

const configMock = vi.hoisted(() => ({
  getProjectModelConfig: vi.fn(async () => ({
    analysisModel: 'analysis-model-1',
    characterModel: 'character-model-1',
    locationModel: 'location-model-1',
  })),
  getUserModelConfig: vi.fn(),
  buildImageBillingPayload: vi.fn(async ({ basePayload }: { readonly basePayload: Record<string, unknown> }) => ({
    ...basePayload,
    imageModel: 'character-model-1',
  })),
  buildImageBillingPayloadFromUserConfig: vi.fn(),
}))

const hasOutputMock = vi.hoisted(() => ({
  hasCharacterAppearanceOutput: vi.fn(async () => false),
  hasGlobalCharacterAppearanceOutput: vi.fn(async () => false),
  hasGlobalLocationImageOutput: vi.fn(async () => false),
  hasGlobalLocationOutput: vi.fn(async () => false),
  hasLocationImageOutput: vi.fn(async () => false),
}))

const selectedStyleMock = vi.hoisted(() => ({
  requireSelectedVisualReferenceStyle: vi.fn(async () => ({
    id: 'style-1',
    title: '动画向｜定格巷口',
    description: '定格动画，粘土与布艺',
    prompt: 'stop-motion clay',
    imageUrl: '/m/style-1',
  })),
}))

const castingMock = vi.hoisted(() => ({
  buildCharacterCastingPlanRequest: vi.fn(() => '角色名：老王\n剧本文本：老王求子'),
  generateCharacterCastingPlanDocument: vi.fn(async () => castingPlanDocument),
}))

vi.mock('@/lib/prisma', () => ({ prisma: prismaMock }))
vi.mock('@/lib/task/submitter', () => ({ submitTask: submitTaskState.submitTask }))
vi.mock('@/lib/config-service', () => configMock)
vi.mock('@/lib/task/has-output', () => hasOutputMock)
vi.mock('@/lib/visual-reference-cases/selected-style', () => selectedStyleMock)
vi.mock('@/lib/character-casting/casting-plan', () => castingMock)

describe('project character alternative image task submission', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    submitTaskState.nextIndex = 0
    prismaMock.characterAppearance.findFirst.mockResolvedValue({
      id: 'appearance-1',
      appearanceIndex: 0,
      descriptions: JSON.stringify(['老王：五十多岁穷困潦倒']),
      description: '老王：五十多岁穷困潦倒',
      character: { name: '老王' },
    })
    prismaMock.projectEditScreenplay.findFirst.mockResolvedValue({
      screenplayText: '老王在旧巷里求子。',
    })
  })

  it('submits primary character alternatives as three one-image tasks with one shared casting plan', async () => {
    const { submitAssetGenerateTask } = await import('@/lib/assets/services/asset-actions')

    const result = await submitAssetGenerateTask({
      request: new Request('http://localhost/api/assets/character-1/generate') as unknown as NextRequest,
      kind: 'character',
      assetId: 'character-1',
      body: {
        scope: 'project',
        kind: 'character',
        projectId: 'project-1',
        episodeId: 'episode-1',
        appearanceId: 'appearance-1',
        count: 3,
        meta: { locale: 'zh' },
      },
      episodeId: 'episode-1',
      access: {
        scope: 'project',
        userId: 'user-1',
        projectId: 'project-1',
      },
    })

    expect(castingMock.generateCharacterCastingPlanDocument).toHaveBeenCalledTimes(1)
    expect(submitTaskState.submitTask).toHaveBeenCalledTimes(3)
    expect(result).toEqual(expect.objectContaining({
      success: true,
      async: true,
      taskId: 'task-0',
      taskIds: ['task-0', 'task-1', 'task-2'],
      total: 3,
    }))
    for (let imageIndex = 0; imageIndex < 3; imageIndex += 1) {
      expect(submitTaskState.submitTask).toHaveBeenNthCalledWith(imageIndex + 1, expect.objectContaining({
        type: TASK_TYPE.IMAGE_CHARACTER,
        targetType: 'CharacterAppearance',
        targetId: 'appearance-1',
        dedupeKey: `${TASK_TYPE.IMAGE_CHARACTER}:appearance-1:single:${imageIndex}`,
        payload: expect.objectContaining({
          id: 'character-1',
          appearanceId: 'appearance-1',
          count: 1,
          imageIndex,
          characterCastingPlan: castingPlanDocument,
        }),
      }))
    }
  })
})
