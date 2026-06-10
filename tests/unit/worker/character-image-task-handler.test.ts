import type { Job } from 'bullmq'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { CHARACTER_ASSET_IMAGE_RATIO, CHARACTER_PROMPT_SUFFIX } from '@/lib/constants'
import { TASK_TYPE, type TaskJobData } from '@/lib/task/types'

const utilsMock = vi.hoisted(() => ({
  assertTaskActive: vi.fn(async () => undefined),
  getProjectModels: vi.fn(async () => ({
    characterModel: 'image-model-1',
    analysisModel: 'analysis-model-1',
  })),
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

const castingPlanMock = vi.hoisted(() => ({
  generateCharacterCastingPlanDocument: vi.fn(async () => buildCastingPlanDocument()),
}))

vi.mock('@/lib/workers/utils', () => utilsMock)
vi.mock('@/lib/media/outbound-image', () => outboundMock)
vi.mock('@/lib/prisma', () => ({ prisma: prismaMock }))
vi.mock('@/lib/workers/shared', () => ({ reportTaskProgress: vi.fn(async () => undefined) }))
vi.mock('@/lib/character-casting/casting-plan', () => castingPlanMock)
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

function buildCastingPlanDocument() {
  return {
    characterDNA: {
      ageRange: '五十到六十岁',
      gender: '男性',
      ethnicityRegion: '中国北方旧城',
      socialClass: '底层小市民',
      occupation: '无稳定职业',
      temperament: '怯懦又虚张声势',
      coreWound: '长期贫困和无后的羞耻',
      desireNeed: '想被承认还能留下后代',
      narrativeFunction: '推动求子荒诞事件',
      bodyEnergy: '被生活压弯又硬撑体面',
      styleCompatibility: '定格动画旧巷质感',
    },
    castingDirections: [
      {
        id: 'A',
        candidateIndex: 0,
        directionName: 'A 生活真实路线',
        interpretationLogic: '普通旧城老光棍，把荒诞藏在低存在感里。',
        faceFamily: '圆短松软脸',
        bodyType: '矮瘦塌肩',
        emotionalTemperature: '怯懦迟疑',
        screenPresence: '低存在感但可信',
        appearanceDescriptor: {
          faceShape: '圆短脸',
          boneStructure: '低颧骨圆下颌',
          eyes: '眼距宽且闪躲',
          nose: '短鼻梁圆鼻头',
          lips: '薄唇下垂',
          skinTexture: '蜡黄粗糙',
          hairstyle: '稀疏地中海',
          bodyType: '矮瘦塌肩',
          posture: '背微驼手贴身',
          wardrobe: '洗旧灰夹克',
          visualKeywords: ['生活真实', '低存在感'],
        },
        imagePrompt: 'This is casting alternative A for the same character. same character DNA, different actor-like interpretation. Round short face, low cheekbones, evasive eyes, worn gray jacket.',
      },
      {
        id: 'B',
        candidateIndex: 1,
        directionName: 'B 暴富荒诞路线',
        interpretationLogic: '突然有钱后用夸张体面掩盖自卑。',
        faceFamily: '宽短虚胖脸',
        bodyType: '矮壮虚胖',
        emotionalTemperature: '燥热虚张',
        screenPresence: '滑稽又刺眼',
        appearanceDescriptor: {
          faceShape: '宽短脸',
          boneStructure: '宽颧骨厚下颌',
          eyes: '小眼睛外凸',
          nose: '塌鼻梁宽鼻翼',
          lips: '厚唇僵笑',
          skinTexture: '油亮粗糙',
          hairstyle: '中央圆秃',
          bodyType: '矮壮虚胖',
          posture: '挺胸叉腰',
          wardrobe: '红衬衫粗金链',
          visualKeywords: ['暴富荒诞', '粗金链'],
        },
        imagePrompt: 'This is casting alternative B for the same character. same character DNA, different actor-like interpretation. Wide short face, broad cheekbones, short thick body, red shirt and gold chain.',
      },
      {
        id: 'C',
        candidateIndex: 2,
        directionName: 'C 悲凉尖瘦路线',
        interpretationLogic: '把求子的孤独和老去的紧绷推到脸上。',
        faceFamily: '尖瘦高颧脸',
        bodyType: '高瘦干硬',
        emotionalTemperature: '冷、悲凉、紧绷',
        screenPresence: '刺痛和孤独感强',
        appearanceDescriptor: {
          faceShape: '窄长尖脸',
          boneStructure: '高颧骨尖下巴',
          eyes: '深陷细长眼',
          nose: '鹰钩感高鼻梁',
          lips: '干薄紧抿',
          skinTexture: '灰黄干裂',
          hairstyle: '油亮后梳稀发',
          bodyType: '高瘦干硬',
          posture: '脖子前探手攥紧',
          wardrobe: '旧黑外套红内衫',
          visualKeywords: ['悲凉', '尖瘦', '紧绷'],
        },
        imagePrompt: 'This is casting alternative C for the same character. same character DNA, different actor-like interpretation. Long narrow face, high cheekbones, hooked nose, tense thin body, melancholic presence.',
      },
    ],
    diversityCheck: {
      AB: '圆短低颧 vs 宽短厚颌，体型和 presence 不同。',
      AC: '圆短松软 vs 尖瘦高颧，五官和姿态不同。',
      BC: '宽短虚胖 vs 窄长高瘦，screen presence 不同。',
      passed: true,
    },
  }
}

describe('worker character-image-task-handler behavior', () => {
  beforeEach(() => {
    vi.clearAllMocks()

    prismaMock.project.findUnique.mockResolvedValue({
      visualStylePresetSource: 'system',
      visualStylePresetId: 'realistic',
    })
    utilsMock.getProjectModels.mockResolvedValue({
      characterModel: 'image-model-1',
      analysisModel: 'analysis-model-1',
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
    prismaMock.projectEditScreenplay.findFirst.mockResolvedValue({
      screenplayText: '角色表：老王，五十多岁穷困潦倒，一夜暴富重金求子。',
    })
  })

  it('characterModel not configured -> explicit error', async () => {
    utilsMock.getProjectModels.mockResolvedValueOnce({
      characterModel: '',
      analysisModel: 'analysis-model-1',
    })
    await expect(handleCharacterImageTask(buildJob({}))).rejects.toThrow('Character model not configured')
  })

  it('success path -> uses primary appearance as reference and persists imageUrls', async () => {
    const job = buildJob({ imageIndex: 0 })
    const result = await handleCharacterImageTask(job)

    expect(result).toEqual({
      appearanceId: 'appearance-2',
      imageCount: 1,
      imageUrl: 'cos/character-generated-0.png',
      finalImagePrompts: [expect.stringContaining('角色描述A')],
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

  it('primary appearance generation omits referenceImages option while using Character DNA casting prompt', async () => {
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

    const result = await handleCharacterImageTask(buildJob({ imageIndex: 0 }, 'appearance-1'))

    expect(prismaMock.characterAppearance.findFirst).not.toHaveBeenCalled()
    const generationInput = sharedMock.generateCleanImageToStorage.mock.calls[0]?.[0] as {
      prompt: string
      options?: { referenceImages?: string[]; aspectRatio?: string }
    }
    expect(generationInput.prompt).toContain('This is casting alternative A for the same character.')
    expect(generationInput.options).toEqual({
      aspectRatio: CHARACTER_ASSET_IMAGE_RATIO,
    })
    expect(Object.prototype.hasOwnProperty.call(generationInput.options || {}, 'referenceImages')).toBe(false)
    expect(result).toEqual(expect.objectContaining({
      finalImagePrompts: [expect.stringContaining('This is casting alternative A for the same character.')],
      castingPlan: expect.objectContaining({
        diversityCheck: expect.objectContaining({ passed: true }),
      }),
    }))
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
      appearanceIndex: 1,
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
      finalImagePrompts: [
        expect.stringContaining('角色描述A'),
        expect.stringContaining('角色描述A'),
        expect.stringContaining('角色描述A'),
        expect.stringContaining('角色描述A'),
        expect.stringContaining('角色描述A'),
      ],
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

  it('primary three-candidate generation uses Character DNA casting plan before image prompts', async () => {
    outboundMock.normalizeOptionalReferenceImagesForGeneration.mockResolvedValueOnce(['normalized-style-ref'])
    prismaMock.characterAppearance.findUnique.mockResolvedValueOnce({
      id: 'appearance-1',
      characterId: 'character-1',
      appearanceIndex: 0,
      descriptions: JSON.stringify(['老王：五十多岁穷困潦倒的老光棍，一夜暴富后拼命装体面']),
      descriptionMetadata: null,
      description: '老王：五十多岁穷困潦倒的老光棍，一夜暴富后拼命装体面',
      imageUrls: JSON.stringify([]),
      selectedIndex: 0,
      imageUrl: null,
      changeReason: '选角定妆',
      character: { name: '老王' },
    })
    sharedMock.generateCleanImageToStorage
      .mockResolvedValueOnce('cos/laowang-a.png')
      .mockResolvedValueOnce('cos/laowang-b.png')
      .mockResolvedValueOnce('cos/laowang-c.png')

    const result = await handleCharacterImageTask(buildJob({ count: 3 }, 'appearance-1', 'episode-1'))

    expect(castingPlanMock.generateCharacterCastingPlanDocument).toHaveBeenCalledWith(expect.objectContaining({
      userId: 'user-1',
      projectId: 'project-1',
      locale: 'zh',
      analysisModel: 'analysis-model-1',
      characterRequest: expect.stringContaining('角色名：老王'),
    }))
    const castingPlanCalls = castingPlanMock.generateCharacterCastingPlanDocument.mock.calls as unknown as Array<[
      { readonly characterRequest: string },
    ]>
    const castingPlanCall = castingPlanCalls[0]?.[0]
    if (!castingPlanCall) throw new Error('Expected casting plan generation call')
    expect(castingPlanCall.characterRequest).toContain('剧本文本')
    expect(sharedMock.generateCleanImageToStorage).toHaveBeenCalledTimes(3)
    expect(sharedMock.generateCleanImageToStorage.mock.calls[0]?.[0].prompt).toContain('This is casting alternative A for the same character.')
    expect(sharedMock.generateCleanImageToStorage.mock.calls[1]?.[0].prompt).toContain('This is casting alternative B for the same character.')
    expect(sharedMock.generateCleanImageToStorage.mock.calls[2]?.[0].prompt).toContain('This is casting alternative C for the same character.')
    expect(sharedMock.generateCleanImageToStorage.mock.calls[0]?.[0].prompt).toContain('Character DNA -> Casting Directions -> Appearance Descriptors -> Image Prompts -> Diversity Judge')
    expect(sharedMock.generateCleanImageToStorage.mock.calls[1]?.[0].prompt).toContain('宽短脸')
    expect(sharedMock.generateCleanImageToStorage.mock.calls[2]?.[0].prompt).toContain('尖瘦高颧脸')
    expect(prismaMock.characterAppearance.update).toHaveBeenCalledWith({
      where: { id: 'appearance-1' },
      data: expect.objectContaining({
        imageUrls: JSON.stringify(['cos/laowang-a.png', 'cos/laowang-b.png', 'cos/laowang-c.png']),
        imageUrl: 'cos/laowang-a.png',
        descriptions: expect.stringContaining('选角方向 A'),
        descriptionMetadata: expect.stringContaining('faceFamily:圆短松软脸'),
        changeReason: '选角定妆',
      }),
    })
    expect(result).toEqual(expect.objectContaining({
      appearanceId: 'appearance-1',
      imageCount: 3,
      imageUrl: 'cos/laowang-a.png',
      finalImagePrompts: [
        expect.stringContaining('This is casting alternative A for the same character.'),
        expect.stringContaining('This is casting alternative B for the same character.'),
        expect.stringContaining('This is casting alternative C for the same character.'),
      ],
      castingPlan: expect.objectContaining({
        characterDNA: expect.objectContaining({ ageRange: '五十到六十岁' }),
        diversityCheck: expect.objectContaining({ passed: true }),
      }),
    }))
  })

  it('primary single-candidate regeneration still plans three casting directions first', async () => {
    prismaMock.characterAppearance.findUnique.mockResolvedValueOnce({
      id: 'appearance-1',
      characterId: 'character-1',
      appearanceIndex: 0,
      descriptions: JSON.stringify([
        '老王：五十多岁穷困潦倒的老光棍，一夜暴富后拼命装体面',
      ]),
      descriptionMetadata: null,
      description: '老王：五十多岁穷困潦倒的老光棍，一夜暴富后拼命装体面',
      imageUrls: JSON.stringify([]),
      selectedIndex: 0,
      imageUrl: null,
      changeReason: '初始形象',
      character: { name: '老王' },
    })
    sharedMock.generateCleanImageToStorage.mockResolvedValueOnce('cos/laowang-c.png')

    await handleCharacterImageTask(buildJob({ imageIndex: 2 }, 'appearance-1', 'episode-1'))

    expect(castingPlanMock.generateCharacterCastingPlanDocument).toHaveBeenCalledTimes(1)
    expect(sharedMock.generateCleanImageToStorage).toHaveBeenCalledTimes(1)
    expect(sharedMock.generateCleanImageToStorage.mock.calls[0]?.[0].prompt).toContain('This is casting alternative C for the same character.')
    expect(sharedMock.generateCleanImageToStorage.mock.calls[0]?.[0].prompt).toContain('尖瘦高颧脸')
    expect(prismaMock.characterAppearance.update).toHaveBeenCalledWith({
      where: { id: 'appearance-1' },
      data: expect.objectContaining({
        imageUrls: JSON.stringify(['', '', 'cos/laowang-c.png']),
        imageUrl: 'cos/laowang-c.png',
        descriptions: expect.stringContaining('选角方向 C'),
        descriptionMetadata: expect.stringContaining('faceFamily:尖瘦高颧脸'),
      }),
    })
  })

  it('primary appearance rejects indexes outside A/B/C instead of using legacy descriptions', async () => {
    prismaMock.characterAppearance.findUnique.mockResolvedValueOnce({
      id: 'appearance-1',
      characterId: 'character-1',
      appearanceIndex: 0,
      descriptions: JSON.stringify(['旧方案A', '旧方案B', '旧方案C', '旧方案D']),
      descriptionMetadata: null,
      description: '旧方案A',
      imageUrls: JSON.stringify([]),
      selectedIndex: 0,
      imageUrl: null,
      changeReason: '初始形象',
      character: { name: '老王' },
    })

    await expect(handleCharacterImageTask(buildJob({ count: 4 }, 'appearance-1', 'episode-1')))
      .rejects
      .toThrow('Primary character appearance generation only supports casting alternatives A/B/C through Character DNA flow')
    expect(castingPlanMock.generateCharacterCastingPlanDocument).not.toHaveBeenCalled()
    expect(sharedMock.generateCleanImageToStorage).not.toHaveBeenCalled()
  })
})
