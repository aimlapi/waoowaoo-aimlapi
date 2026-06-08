import type { Job } from 'bullmq'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { CHARACTER_ASSET_IMAGE_RATIO, CHARACTER_PROMPT_SUFFIX } from '@/lib/constants'
import { TASK_TYPE, type TaskJobData } from '@/lib/task/types'

const utilsMock = vi.hoisted(() => ({
  assertTaskActive: vi.fn(async () => undefined),
  getProjectModels: vi.fn(async () => ({ characterModel: 'image-model-1' })),
  toSignedUrlIfCos: vi.fn((url: string | null | undefined) => (url ? `https://signed.example/${url}` : null)),
}))

const outboundMock = vi.hoisted(() => ({
  normalizeOptionalReferenceImagesForGeneration: vi.fn(async () => ['normalized-primary-ref']),
}))

const prismaMock = vi.hoisted(() => ({
  project: {
    findUnique: vi.fn(),
  },
  projectVisualReferenceCase: {
    findFirst: vi.fn(),
  },
  characterAppearance: {
    findUnique: vi.fn(),
    findFirst: vi.fn(),
    update: vi.fn(async () => ({})),
  },
  projectCharacter: {
    findUnique: vi.fn(),
  },
  projectEditScript: {
    findFirst: vi.fn(),
  },
  projectEditScreenplay: {
    findFirst: vi.fn(),
  },
}))

const sharedMock = vi.hoisted(() => ({
  generateCleanImageToStorage: vi.fn<(input: {
    prompt: string
    options?: { referenceImages?: string[]; aspectRatio?: string }
  }) => Promise<string>>(async () => 'cos/character-generated-0.png'),
}))

vi.mock('@/lib/workers/utils', () => utilsMock)
vi.mock('@/lib/media/outbound-image', () => outboundMock)
vi.mock('@/lib/prisma', () => ({ prisma: prismaMock }))
vi.mock('@/lib/workers/shared', () => ({ reportTaskProgress: vi.fn(async () => undefined) }))
vi.mock('@/lib/workers/handlers/image-task-handler-shared', async () => {
  const actual = await vi.importActual<typeof import('@/lib/workers/handlers/image-task-handler-shared')>(
    '@/lib/workers/handlers/image-task-handler-shared',
  )
  return {
    ...actual,
    generateCleanImageToStorage: sharedMock.generateCleanImageToStorage,
  }
})

import { handleCharacterImageTask } from '@/lib/workers/handlers/character-image-task-handler'

function buildJob(
  payload: Record<string, unknown>,
  targetId = 'appearance-2',
  episodeId: string | null = null,
): Job<TaskJobData> {
  return {
    data: {
      taskId: 'task-character-image-1',
      type: TASK_TYPE.IMAGE_CHARACTER,
      locale: 'zh',
      projectId: 'project-1',
      episodeId,
      targetType: 'CharacterAppearance',
      targetId,
      payload,
      userId: 'user-1',
    },
  } as unknown as Job<TaskJobData>
}

describe('worker character-image-task-handler behavior', () => {
  beforeEach(() => {
    vi.clearAllMocks()

    prismaMock.project.findUnique.mockResolvedValue({
      visualStylePresetSource: 'system',
      visualStylePresetId: 'realistic',
    })
    prismaMock.projectVisualReferenceCase.findFirst.mockResolvedValue({
      id: 'style-case-default',
      title: '真人向｜冷白写实',
      description: '真人向；低饱和冷白写实；共享场景为角色所在叙事空间。',
      prompt: 'Shared scene: character in story environment. Chosen dimensions: live-action realism, muted palette. Style treatment: restrained photorealistic reference.',
      imageUrl: '/m/style-case-default',
      imageMedia: null,
    })

    prismaMock.characterAppearance.findUnique.mockResolvedValue({
      id: 'appearance-2',
      characterId: 'character-1',
      appearanceIndex: 1,
      descriptions: JSON.stringify(['角色描述A']),
      descriptionMetadata: null,
      description: '角色描述A',
      imageUrls: JSON.stringify([]),
      selectedIndex: 0,
      imageUrl: null,
      changeReason: '战斗形态',
      character: { name: 'Hero' },
    })

    prismaMock.characterAppearance.findFirst.mockResolvedValue({
      imageUrl: 'cos/primary-fallback.png',
      imageUrls: JSON.stringify(['cos/primary-fallback.png', 'cos/primary-selected.png']),
      selectedIndex: 1,
    })
    prismaMock.projectEditScript.findFirst.mockResolvedValue(null)
    prismaMock.projectEditScreenplay.findFirst.mockResolvedValue(null)
  })

  it('characterModel not configured -> explicit error', async () => {
    utilsMock.getProjectModels.mockResolvedValueOnce({ characterModel: '' })
    await expect(handleCharacterImageTask(buildJob({}))).rejects.toThrow('Character model not configured')
  })

  it('success path -> uses primary appearance as reference and persists imageUrls', async () => {
    const job = buildJob({ imageIndex: 0 })
    const result = await handleCharacterImageTask(job)

    expect(result).toEqual({
      appearanceId: 'appearance-2',
      imageCount: 1,
      imageUrl: 'cos/character-generated-0.png',
    })

    const generationInput = sharedMock.generateCleanImageToStorage.mock.calls[0]?.[0] as {
      prompt: string
      options?: { referenceImages?: string[]; aspectRatio?: string }
    }

    expect(generationInput.prompt).toContain(CHARACTER_PROMPT_SUFFIX)
    expect(generationInput.prompt.split(CHARACTER_PROMPT_SUFFIX).length - 1).toBe(1)
    expect(generationInput.prompt).not.toContain('真实电影级画面质感')
    expect(utilsMock.toSignedUrlIfCos).toHaveBeenCalledWith('cos/primary-selected.png', 3600)
    expect(generationInput.options).toEqual(expect.objectContaining({
      referenceImages: ['normalized-primary-ref'],
      aspectRatio: CHARACTER_ASSET_IMAGE_RATIO,
    }))

    expect(prismaMock.characterAppearance.update).toHaveBeenCalledWith({
      where: { id: 'appearance-2' },
      data: {
        imageUrls: JSON.stringify(['cos/character-generated-0.png']),
        imageUrl: 'cos/character-generated-0.png',
      },
    })
  })

  it('primary appearance generation omits referenceImages option when no reference image exists', async () => {
    outboundMock.normalizeOptionalReferenceImagesForGeneration.mockResolvedValueOnce([])
    prismaMock.characterAppearance.findUnique.mockResolvedValueOnce({
      id: 'appearance-1',
      characterId: 'character-1',
      appearanceIndex: 0,
      descriptions: JSON.stringify(['主形象描述A']),
      descriptionMetadata: null,
      description: '主形象描述A',
      imageUrls: JSON.stringify([]),
      selectedIndex: 0,
      imageUrl: null,
      changeReason: '初始形象',
      character: { name: 'Hero' },
    })

    await handleCharacterImageTask(buildJob({ imageIndex: 0 }, 'appearance-1'))

    expect(prismaMock.characterAppearance.findFirst).not.toHaveBeenCalled()
    const generationInput = sharedMock.generateCleanImageToStorage.mock.calls[0]?.[0] as {
      options?: { referenceImages?: string[]; aspectRatio?: string }
    }
    expect(generationInput.options).toEqual({
      aspectRatio: CHARACTER_ASSET_IMAGE_RATIO,
    })
    expect(Object.prototype.hasOwnProperty.call(generationInput.options || {}, 'referenceImages')).toBe(false)
  })

  it('ignores legacy payload artStyle in prompt', async () => {
    const job = buildJob({ imageIndex: 0, artStyle: 'japanese-anime' })
    await handleCharacterImageTask(job)

    const generationInput = sharedMock.generateCleanImageToStorage.mock.calls[0]?.[0] as {
      prompt: string
    }
    expect(generationInput.prompt).not.toContain('japanese-anime')
    expect(generationInput.prompt).not.toContain('日系动漫')
  })

  it('selected visual reference style becomes the style source and reference image', async () => {
    prismaMock.projectVisualReferenceCase.findFirst.mockResolvedValueOnce({
      id: 'style-case-1',
      title: '冷白写实',
      description: '低饱和写实职场室内，冷白光和自然皮肤质感。',
      prompt: 'photorealistic restrained office drama, cool white light, muted palette',
      imageUrl: '/m/style-case-1',
      imageMedia: null,
    })
    outboundMock.normalizeOptionalReferenceImagesForGeneration.mockResolvedValueOnce(['normalized-style-ref'])

    await handleCharacterImageTask(buildJob({ imageIndex: 0 }, 'appearance-1', 'episode-1'))

    const generationInput = sharedMock.generateCleanImageToStorage.mock.calls[0]?.[0] as {
      prompt: string
      options?: { referenceImages?: string[]; aspectRatio?: string }
    }
    expect(generationInput.prompt).toContain('选中的视觉风格案例（最高优先级）：')
    expect(generationInput.prompt).toContain('冷白写实')
    expect(generationInput.prompt).toContain('选中案例的媒介类别具有约束力')
    expect(generationInput.prompt).not.toContain('真实电影级画面质感')
    expect(generationInput.options?.referenceImages).toEqual(['normalized-style-ref'])
  })

  it('uses the selected visual reference case as the only style source in character image prompt', async () => {
    await handleCharacterImageTask(buildJob({ imageIndex: 0 }, 'appearance-2', 'episode-1'))

    const generationInput = sharedMock.generateCleanImageToStorage.mock.calls[0]?.[0] as {
      prompt: string
    }
    expect(generationInput.prompt).toContain('角色描述A')
    expect(generationInput.prompt).toContain('选中的视觉风格案例（最高优先级）：')
    expect(generationInput.prompt).toContain('真人向｜冷白写实')
    expect(generationInput.prompt).not.toContain('Style Bible')
  })

  it('candidate casting stills -> appends expression prop and background requirements to image prompt', async () => {
    prismaMock.characterAppearance.findUnique.mockResolvedValueOnce({
      id: 'appearance-2',
      characterId: 'character-1',
      appearanceIndex: 0,
      descriptions: JSON.stringify(['高挑女性调查员，黑色机能外套，黑色战术靴']),
      descriptionMetadata: JSON.stringify([
        {
          description: '高挑女性调查员，黑色机能外套，黑色战术靴',
          visualTraits: {
            face: '眉尾短疤',
            hair: '低发髻',
            body: '高挑偏瘦',
            costume: '黑色机能外套',
            makeupAndAccessories: '',
            skin: '眼下倦纹',
            visibleState: '疲惫但清醒',
            accessibility: '助听器',
            tattoosAndMarks: '右前臂几何纹身',
            scars: '左眉尾短疤',
          },
          castingNotes: {
            score: 92,
            strengths: ['身份清晰'],
            risks: [],
            recommendation: '适合选角。',
            fitTags: ['镜头友好'],
          },
          castingStills: [
            {
              kind: 'crying',
              title: '哭泣表情定妆',
              prompt: '同一角色哭泣状态，眼眶湿润，助听器和短疤保持一致',
              expression: '哭泣',
              prop: '',
              background: '低干扰灰墙',
              purpose: '测试悲伤戏',
            },
            {
              kind: 'costume',
              title: '雨夜外勤换装定妆',
              prompt: '同一角色换上防水长外套和深色战术靴，身份标记保持一致',
              expression: '中性',
              prop: '',
              background: '低干扰背景',
              purpose: '测试服装跨度',
            },
            {
              kind: 'prop',
              title: '折叠手杖道具定妆',
              prompt: '同一角色手持折叠手杖，道具不遮挡脸部',
              expression: '中性',
              prop: '折叠手杖',
              background: '低干扰背景',
              purpose: '测试道具匹配',
            },
            {
              kind: 'background',
              title: '城市调查现场背景定妆',
              prompt: '同一角色站在近未来城市调查现场背景前，人物仍为主体',
              expression: '中性',
              prop: '',
              background: '近未来城市调查现场',
              purpose: '测试场景融合度',
            },
          ],
        },
      ]),
      description: '高挑女性调查员，黑色机能外套，黑色战术靴',
      imageUrls: JSON.stringify([]),
      selectedIndex: 0,
      imageUrl: null,
      changeReason: '初始形象',
      character: { name: 'Hero' },
    })

    await handleCharacterImageTask(buildJob({ imageIndex: 0 }, 'appearance-2'))

    const generationInput = sharedMock.generateCleanImageToStorage.mock.calls[0]?.[0] as {
      prompt: string
    }
    expect(generationInput.prompt).toContain('【选角定妆素材要求】')
    expect(generationInput.prompt).toContain('哭泣表情定妆')
    expect(generationInput.prompt).toContain('雨夜外勤换装定妆')
    expect(generationInput.prompt).toContain('换装定妆必须清楚呈现服装材质、层次或穿搭变化')
    expect(generationInput.prompt).toContain('折叠手杖道具定妆')
    expect(generationInput.prompt).toContain('城市调查现场背景定妆')
    expect(generationInput.prompt).toContain('近未来城市调查现场')
    expect(generationInput.prompt).toContain('具体的非白底故事场景')
  })

  it('ignores invalid legacy payload artStyle', async () => {
    await expect(handleCharacterImageTask(buildJob({ imageIndex: 0, artStyle: 'noir' }))).resolves.toEqual(expect.objectContaining({
      appearanceId: 'appearance-2',
    }))
  })

  it('uses requested count for grouped generation and expands imageUrls to requested size', async () => {
    sharedMock.generateCleanImageToStorage
      .mockResolvedValueOnce('cos/character-generated-0.png')
      .mockResolvedValueOnce('cos/character-generated-1.png')
      .mockResolvedValueOnce('cos/character-generated-2.png')
      .mockResolvedValueOnce('cos/character-generated-3.png')
      .mockResolvedValueOnce('cos/character-generated-4.png')

    const result = await handleCharacterImageTask(buildJob({ count: 5 }))

    expect(sharedMock.generateCleanImageToStorage).toHaveBeenCalledTimes(5)
    expect(result).toEqual({
      appearanceId: 'appearance-2',
      imageCount: 5,
      imageUrl: 'cos/character-generated-0.png',
    })
    expect(prismaMock.characterAppearance.update).toHaveBeenCalledWith({
      where: { id: 'appearance-2' },
      data: {
        imageUrls: JSON.stringify([
          'cos/character-generated-0.png',
          'cos/character-generated-1.png',
          'cos/character-generated-2.png',
          'cos/character-generated-3.png',
          'cos/character-generated-4.png',
        ]),
        imageUrl: 'cos/character-generated-0.png',
      },
    })
  })
})
