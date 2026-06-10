import type { Job } from 'bullmq'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { CHARACTER_STYLE_TEST_ASPECT_RATIO } from '@/lib/character-style-test/prompt'
import { TASK_TYPE, type TaskJobData } from '@/lib/task/types'

const sharedMock = vi.hoisted(() => ({
  reportTaskProgress: vi.fn(async () => undefined),
}))

const handlerSharedMock = vi.hoisted(() => ({
  generateCleanImageToStorage: vi.fn<(input: GenerationInput) => Promise<string>>(async () => 'cos/character-style-test.jpg'),
}))

const storageMock = vi.hoisted(() => ({
  getSignedUrl: vi.fn((key: string) => `https://signed.example/${key}`),
}))

const evaluatorMock = vi.hoisted(() => ({
  evaluateCharacterCastingCandidates: vi.fn(async () => ({
    winnerIndex: 1,
    summary: '候选 2 最适合角色。',
    candidates: [0, 1, 2].map((candidateIndex) => ({
      candidateIndex,
      totalScore: candidateIndex === 1 ? 92 : 80,
      criteria: [
        'roleConsistency',
        'identityReadability',
        'contactSheetCompleteness',
        'expressionRange',
        'costumeRange',
        'marksPropsFidelity',
        'backgroundFit',
        'productionUsability',
      ].map((key) => ({ key, score: candidateIndex === 1 ? 9 : 8, reason: `${key} visible` })),
      strengths: [`candidate ${candidateIndex} strength`],
      risks: [`candidate ${candidateIndex} risk`],
      recommendation: `candidate ${candidateIndex} recommendation`,
    })),
  })),
}))

const aiExecMock = vi.hoisted(() => ({
  executeAiTextStep: vi.fn(async () => ({ text: buildCastingPlanJson() })),
}))

const prismaMock = vi.hoisted(() => ({
  projectVisualReferenceCase: {
    findFirst: vi.fn(),
  },
  characterAppearance: {
    findUnique: vi.fn(async () => ({
      id: 'appearance-1',
      imageUrl: 'cos/old.jpg',
      imageUrls: '["cos/old.jpg"]',
      character: { projectId: 'project-1' },
    })),
    update: vi.fn(async () => ({})),
  },
}))

const outboundMock = vi.hoisted(() => ({
  normalizeOptionalReferenceImagesForGeneration: vi.fn(async () => [] as string[]),
}))

vi.mock('@/lib/workers/shared', () => sharedMock)
vi.mock('@/lib/storage', () => storageMock)
vi.mock('@/lib/media/outbound-image', () => outboundMock)
vi.mock('@/lib/workers/handlers/image-task-handler-shared', () => handlerSharedMock)
vi.mock('@/lib/character-casting/evaluator', () => evaluatorMock)
vi.mock('@/lib/ai-exec/engine', () => aiExecMock)
vi.mock('@/lib/prisma', () => ({ prisma: prismaMock }))

import { handleCharacterStyleTestTask } from '@/lib/workers/handlers/character-style-test-task-handler'

type GenerationInput = {
  job?: Job<TaskJobData>
  userId: string
  modelId: string
  prompt: string
  keyPrefix: string
  targetId: string
  options: {
    aspectRatio: string
    resolution?: string
    quality?: string
    referenceImages?: string[]
  }
}

type CastingEvaluationCallInput = {
  readonly candidates: readonly [
    { readonly request: string },
    { readonly request: string },
    { readonly request: string },
  ]
}

function buildCastingPlanJson(): string {
  return JSON.stringify({
    characterDNA: {
      ageRange: '二十二到二十五岁',
      gender: '女性',
      ethnicityRegion: '当代中国城市职场',
      socialClass: '普通工薪阶层，刚进入职场',
      occupation: '公司实习生',
      temperament: '温柔、克制、有边界感',
      coreWound: '害怕在职场里被吞没，也害怕自己不够好',
      desireNeed: '想被认可，同时保住自尊和距离',
      narrativeFunction: '在职场压力中承载观众的共情入口',
      bodyEnergy: '收着、谨慎、但内里有韧性',
      styleCompatibility: '低饱和写实职场室内，冷白光和自然皮肤质感',
    },
    castingDirections: [
      {
        id: 'A',
        directionName: 'A 生活真实路线',
        interpretationLogic: '把角色放在真实办公室会遇到的普通新人里。',
        faceFamily: '圆脸偏幼、软轮廓、普通清瘦实习生脸',
        bodyType: '肩窄清瘦',
        emotionalTemperature: '温和、拘谨、礼貌',
        screenPresence: '低调可信，像真实工位旁的人',
        appearanceDescriptor: {
          faceShape: '圆脸偏幼，下巴短圆',
          boneStructure: '颧骨低平，下颌软，面部骨点不强',
          eyes: '眼距略宽，眼神闪避但不慌张',
          nose: '短鼻梁，小圆鼻头',
          lips: '嘴唇薄，常抿着',
          skinTexture: '自然皮肤，有轻微黑眼圈',
          hairstyle: '低马尾，碎发压在耳后',
          bodyType: '肩窄清瘦，手臂贴近身体',
          posture: '站姿收着，重心略后',
          wardrobe: '旧针织开衫、洗旧衬衫、帆布包',
          visualKeywords: ['磨旧帆布包', '袖口起球', '素色发圈', '生活真实'],
        },
        imagePrompt: 'This is casting alternative A for the same character. same character DNA, different actor-like interpretation. Round young face, low cheekbones, wide-set evasive eyes, narrow shoulders, old cardigan, grounded office intern look-test contact sheet.',
      },
      {
        id: 'B',
        directionName: 'B 情绪裂痕路线',
        interpretationLogic: '把职场打击后的压力和脆弱推到脸与姿态上。',
        faceFamily: '长脸高颧、湿润眼神、疲惫脆弱型演员脸',
        bodyType: '高瘦单薄',
        emotionalTemperature: '湿冷、强忍、压抑',
        screenPresence: '情绪压力最强，观众先看到她的内伤',
        appearanceDescriptor: {
          faceShape: '长脸，下巴窄长，脸颊凹',
          boneStructure: '颧骨更明显，眉骨轻压，颌线细',
          eyes: '眼下泛红，眼神湿润，视线防备',
          nose: '细长鼻梁，鼻翼窄',
          lips: '嘴唇干裂，唇色浅',
          skinTexture: '皮肤偏干，眼下暗沉',
          hairstyle: '半散低束发，额前碎发凌乱',
          bodyType: '高瘦单薄，脖子前探',
          posture: '肩膀下沉，双手攥紧',
          wardrobe: '宽松外套、皱衬衫、旧围巾',
          visualKeywords: ['泛红眼眶', '攥紧指节', '皱旧围巾', '情绪裂痕'],
        },
        imagePrompt: 'This is casting alternative B for the same character. same character DNA, different actor-like interpretation. Long face, stronger cheekbones, red wet eyes, narrow nose, dry lips, collapsed shoulders, emotionally wounded office intern look-test contact sheet.',
      },
      {
        id: 'C',
        directionName: 'C 轮廓记忆路线',
        interpretationLogic: '让同样温柔有距离的角色有更利落的银幕轮廓。',
        faceFamily: '窄脸短下巴、利眉骨、冷静疏离型演员脸',
        bodyType: '瘦直利落',
        emotionalTemperature: '冷静、疏离、清醒',
        screenPresence: '轮廓最强，一眼能记住但仍可信',
        appearanceDescriptor: {
          faceShape: '窄脸短下巴，脸部纵深短',
          boneStructure: '眉骨更利，颧骨斜收，下颌干净',
          eyes: '眼型狭长，目光稳定但保持距离',
          nose: '直鼻梁，鼻尖清楚',
          lips: '唇形清晰，嘴角平直',
          skinTexture: '皮肤细腻偏冷调，轻微疲惫纹理',
          hairstyle: '齐耳短发，发尾外翘',
          bodyType: '瘦直利落，肩线清楚',
          posture: '背挺直，重心偏一侧',
          wardrobe: '短夹克、高领内搭、窄肩包',
          visualKeywords: ['齐耳短发', '窄肩包', '硬挺短夹克', '清醒疏离'],
        },
        imagePrompt: 'This is casting alternative C for the same character. same character DNA, different actor-like interpretation. Narrow short-chin face, sharper brow bone, long steady eyes, straight nose, crisp lips, ear-length short hair, upright posture, silhouette-forward office intern look-test contact sheet.',
      },
    ],
    diversityCheck: {
      AB: 'A 圆脸低颧低存在感，B 长脸高颧湿冷脆弱；眼鼻唇、体态、presence 均不同，DNA 未漂移。',
      AC: 'A 软圆生活真实，C 窄脸短下巴利落疏离；脸型骨相、发型、姿态和银幕存在感不同。',
      BC: 'B 情绪裂痕高瘦前探，C 冷静轮廓瘦直挺背；五官至少两项不同，body/posture 不同。',
      passed: true,
    },
  })
}

function buildJob(payload: Record<string, unknown>, projectId = 'system'): Job<TaskJobData> {
  return {
    data: {
      taskId: 'task-character-style-test-1',
      type: TASK_TYPE.CHARACTER_STYLE_TEST,
      locale: 'zh',
      projectId,
      targetType: 'CharacterStyleTest',
      targetId: 'character-style-test',
      payload,
      userId: 'user-1',
    },
    } as unknown as Job<TaskJobData>
}

describe('worker character-style-test-task-handler', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    handlerSharedMock.generateCleanImageToStorage.mockImplementation(async () => 'cos/character-style-test.jpg')
    prismaMock.projectVisualReferenceCase.findFirst.mockResolvedValue(null)
    outboundMock.normalizeOptionalReferenceImagesForGeneration.mockResolvedValue([])
    aiExecMock.executeAiTextStep.mockResolvedValue({ text: buildCastingPlanJson() })
  })

  it('success path -> generates a stylized multi-view asset prompt from user input only', async () => {
    const result = await handleCharacterStyleTestTask(buildJob({
      characterRequest: '和尚',
      imageModel: 'character-model-1',
      generationOptions: { resolution: '1024x1024', quality: 'high' },
    }))

    expect(result).toEqual(expect.objectContaining({
      imageUrl: 'https://signed.example/cos/character-style-test.jpg',
      imageKey: 'cos/character-style-test.jpg',
      imageUrls: ['https://signed.example/cos/character-style-test.jpg'],
      imageKeys: ['cos/character-style-test.jpg'],
      prompt: expect.any(String),
      prompts: [expect.any(String)],
      aspectRatio: CHARACTER_STYLE_TEST_ASPECT_RATIO,
      styleSummary: '本次临时资产风格来源：和尚',
    }))

    const generationInput = handlerSharedMock.generateCleanImageToStorage.mock.calls[0]?.[0] as GenerationInput | undefined
    expect(generationInput).toEqual(expect.objectContaining({
      userId: 'user-1',
      modelId: 'character-model-1',
      keyPrefix: 'character-style-test',
      targetId: 'task-character-style-test-1',
      options: {
        aspectRatio: CHARACTER_STYLE_TEST_ASPECT_RATIO,
        resolution: '1024x1024',
        quality: 'high',
      },
    }))
    expect(generationInput?.prompt).toContain('用户输入（本次人物与风格的唯一来源）')
    expect(generationInput?.prompt).toContain('本次角色资产风格规范（必须显性执行，不要只在脑中概括）')
    expect(generationInput?.prompt).toContain('短输入规则：如果用户只输入一个身份或名词')
    expect(generationInput?.prompt).toContain('必须主动选择鲜明、统一、可继承的视觉方向')
    expect(generationInput?.prompt).toContain('整张图像像一张完整资产设定板，而不是四张孤立证件照')
    expect(generationInput?.prompt).toContain('左侧约 1/3 宽度为角色大头正面身份特写')
    expect(generationInput?.prompt).toContain('右侧约 2/3 宽度横向排列同一角色的正面全身、侧面全身、背面全身')
    expect(generationInput?.prompt).toContain('资产图不能使用纯白底')
    expect(generationInput?.prompt).toContain('不要继承项目既有风格')
  })

  it('missing image model -> explicit error before image generation', async () => {
    await expect(handleCharacterStyleTestTask(buildJob({
      characterRequest: '冷峻黑客',
    }))).rejects.toThrow('imageModel is required')
    expect(handlerSharedMock.generateCleanImageToStorage).not.toHaveBeenCalled()
  })

  it('casting photo mode without selected visual reference -> explicit error before image generation', async () => {
    await expect(handleCharacterStyleTestTask(buildJob({
      characterRequest: '冷峻女黑客，黑色长风衣',
      imageModel: 'character-model-1',
      promptMode: 'casting_photo',
    }))).rejects.toThrow('SELECTED_VISUAL_REFERENCE_STYLE_REQUIRED')
    expect(handlerSharedMock.generateCleanImageToStorage).not.toHaveBeenCalled()
  })

  it('casting photo mode -> generates a look-test contact sheet prompt from the selected visual reference', async () => {
    prismaMock.projectVisualReferenceCase.findFirst.mockResolvedValueOnce({
      id: 'style-case-1',
      title: '动画向｜冷白定格',
      description: '定格动画，粘土与布艺材质，低饱和冷白光。',
      prompt: '维度组合：定格动画；粘土与布艺；低饱和冷白光。必须严格使用视觉方向里描述的共享场景，保留同一批人物、人物站位、道具摆法。',
      imageUrl: '/m/style-case-1',
      imageMedia: null,
    })
    outboundMock.normalizeOptionalReferenceImagesForGeneration.mockResolvedValueOnce(['normalized-style-ref'])

    const result = await handleCharacterStyleTestTask(buildJob({
      characterRequest: '冷峻女黑客，黑色长风衣',
      imageModel: 'character-model-1',
      promptMode: 'casting_photo',
    }, 'project-1'))

    expect(result.styleSummary).toBe('本次选角定妆照来源：冷峻女黑客，黑色长风衣')
    const generationInput = handlerSharedMock.generateCleanImageToStorage.mock.calls[0]?.[0] as GenerationInput | undefined
    expect(generationInput?.prompt).toContain('用于选角、试镜与人物定妆判断的 contact sheet')
    expect(generationInput?.prompt).toContain('媒介和画风必须由已选视觉参考案例决定')
    expect(generationInput?.prompt).toContain('动画向｜冷白定格')
    expect(generationInput?.prompt).toContain('不要沿用案例提示词里的共享场景')
    expect(generationInput?.prompt).not.toContain('可复用风格语言摘要')
    expect(generationInput?.prompt).not.toContain('保留同一批人物、人物站位、道具摆法')
    expect(generationInput?.prompt).toContain('当前这张图是一位候选演员的完整形象包')
    expect(generationInput?.prompt).toContain('至少两种不同表情')
    expect(generationInput?.prompt).toContain('至少两套不同服装或穿搭层次')
    expect(generationInput?.prompt).toContain('绝对禁止：任何来自旧项目风格、系统风格预设')
    expect(generationInput?.prompt).toContain('姓名、电话、邮箱')
    expect(generationInput?.prompt).not.toContain('真人摄影 contact sheet')
    expect(generationInput?.prompt).not.toContain('绝对禁止：概念艺术、插画、CG')
    expect(generationInput?.prompt).not.toContain('本次角色资产风格规范')
    expect(generationInput?.options.referenceImages).toBeUndefined()
  })

  it('casting candidate mode -> generates three candidates, scores them, and persists the winner', async () => {
    handlerSharedMock.generateCleanImageToStorage.mockImplementation(async (input: GenerationInput) =>
      `cos/${input.targetId}.jpg`,
    )
    prismaMock.projectVisualReferenceCase.findFirst.mockResolvedValueOnce({
      id: 'style-case-1',
      title: '真人向｜冷白写实',
      description: '低饱和写实职场室内，冷白光和自然皮肤质感。',
      prompt: 'photorealistic restrained office drama, cool white light, muted palette',
      imageUrl: '/m/style-case-1',
      imageMedia: null,
    })

    const result = await handleCharacterStyleTestTask(buildJob({
      characterRequest: '二十三岁公司实习生，温柔但有距离感',
      imageModel: 'character-model-1',
      analysisModel: 'analysis-model-1',
      promptMode: 'casting_photo',
      castingCandidateCount: 3,
      appearanceId: 'appearance-1',
    }, 'project-1'))

    expect(handlerSharedMock.generateCleanImageToStorage).toHaveBeenCalledTimes(3)
    expect(handlerSharedMock.generateCleanImageToStorage.mock.calls[0]?.[0].prompt).toContain('选角方向 A：A 生活真实路线')
    expect(handlerSharedMock.generateCleanImageToStorage.mock.calls[1]?.[0].prompt).toContain('选角方向 B：B 情绪裂痕路线')
    expect(handlerSharedMock.generateCleanImageToStorage.mock.calls[2]?.[0].prompt).toContain('选角方向 C：C 轮廓记忆路线')
    expect(handlerSharedMock.generateCleanImageToStorage.mock.calls[2]?.[0].prompt).toContain('候选差异硬约束')
    expect(handlerSharedMock.generateCleanImageToStorage.mock.calls[2]?.[0].prompt).toContain('same character DNA, different actor-like interpretation')
    expect(handlerSharedMock.generateCleanImageToStorage.mock.calls[2]?.[0].prompt).toContain('不要用同一个 seed、同一张脸、同一底模')
    expect(aiExecMock.executeAiTextStep).toHaveBeenCalledWith(expect.objectContaining({
      action: 'character_casting_plan_generate',
      model: 'analysis-model-1',
      projectId: 'project-1',
    }))
    expect(handlerSharedMock.generateCleanImageToStorage.mock.calls[0]?.[0].prompt).toContain('选角方向 A：A 生活真实路线')
    expect(handlerSharedMock.generateCleanImageToStorage.mock.calls[0]?.[0].prompt).toContain('圆脸偏幼')
    expect(handlerSharedMock.generateCleanImageToStorage.mock.calls[0]?.[0].prompt).toContain('This is casting alternative A for the same character.')
    expect(handlerSharedMock.generateCleanImageToStorage.mock.calls[1]?.[0].prompt).toContain('选角方向 B：B 情绪裂痕路线')
    expect(handlerSharedMock.generateCleanImageToStorage.mock.calls[1]?.[0].prompt).toContain('长脸，下巴窄长')
    expect(handlerSharedMock.generateCleanImageToStorage.mock.calls[1]?.[0].prompt).toContain('This is casting alternative B for the same character.')
    expect(handlerSharedMock.generateCleanImageToStorage.mock.calls[2]?.[0].prompt).toContain('选角方向 C：C 轮廓记忆路线')
    expect(handlerSharedMock.generateCleanImageToStorage.mock.calls[2]?.[0].prompt).toContain('齐耳短发')
    expect(handlerSharedMock.generateCleanImageToStorage.mock.calls[2]?.[0].prompt).toContain('This is casting alternative C for the same character.')
    expect(evaluatorMock.evaluateCharacterCastingCandidates).toHaveBeenCalledWith(expect.objectContaining({
      userId: 'user-1',
      analysisModel: 'analysis-model-1',
      baseRequest: '二十三岁公司实习生，温柔但有距离感',
      candidates: [
        expect.objectContaining({ candidateIndex: 0, imageUrl: 'https://signed.example/cos/task-character-style-test-1-candidate-0.jpg' }),
        expect.objectContaining({ candidateIndex: 1, imageUrl: 'https://signed.example/cos/task-character-style-test-1-candidate-1.jpg' }),
        expect.objectContaining({ candidateIndex: 2, imageUrl: 'https://signed.example/cos/task-character-style-test-1-candidate-2.jpg' }),
      ],
    }))
    const evaluationCalls = evaluatorMock.evaluateCharacterCastingCandidates.mock.calls as unknown as Array<[
      CastingEvaluationCallInput,
    ]>
    const evaluationCall = evaluationCalls[0]?.[0]
    if (!evaluationCall) throw new Error('Expected evaluateCharacterCastingCandidates to be called')
    expect(evaluationCall.candidates[1].request).toContain('第 2 个不同选角/定妆方向')
    expect(prismaMock.characterAppearance.update).toHaveBeenCalledWith({
      where: { id: 'appearance-1' },
      data: expect.objectContaining({
        imageUrl: 'cos/task-character-style-test-1-candidate-1.jpg',
        imageUrls: JSON.stringify([
          'cos/task-character-style-test-1-candidate-0.jpg',
          'cos/task-character-style-test-1-candidate-1.jpg',
          'cos/task-character-style-test-1-candidate-2.jpg',
        ]),
        selectedIndex: 1,
        previousImageUrls: '["cos/old.jpg"]',
        changeReason: '选角定妆',
      }),
    })
    expect(result).toEqual(expect.objectContaining({
      imageUrl: 'https://signed.example/cos/task-character-style-test-1-candidate-1.jpg',
      imageKey: 'cos/task-character-style-test-1-candidate-1.jpg',
      imageUrls: [
        'https://signed.example/cos/task-character-style-test-1-candidate-0.jpg',
        'https://signed.example/cos/task-character-style-test-1-candidate-1.jpg',
        'https://signed.example/cos/task-character-style-test-1-candidate-2.jpg',
      ],
      appearanceId: 'appearance-1',
      evaluation: expect.objectContaining({ winnerIndex: 1 }),
      castingPlan: expect.objectContaining({
        characterDNA: expect.objectContaining({ occupation: '公司实习生' }),
        diversityCheck: expect.objectContaining({ passed: true }),
      }),
      castingPlans: expect.arrayContaining([
        expect.objectContaining({ directionName: 'A 生活真实路线' }),
        expect.objectContaining({ directionName: 'B 情绪裂痕路线' }),
        expect.objectContaining({ directionName: 'C 轮廓记忆路线' }),
      ]),
    }))
  })

  it('casting candidate mode -> uses selected visual reference style for all candidates', async () => {
    prismaMock.projectVisualReferenceCase.findFirst.mockResolvedValueOnce({
      id: 'style-case-1',
      title: '冷白写实',
      description: '真实摄影质感，冷白光和低饱和色彩。',
      prompt: 'photorealistic cool white light, muted palette',
      imageUrl: '/m/style-case-1',
      imageMedia: null,
    })
    outboundMock.normalizeOptionalReferenceImagesForGeneration.mockResolvedValueOnce(['normalized-style-ref'])

    await handleCharacterStyleTestTask(buildJob({
      characterRequest: '二十三岁公司实习生，温柔但有距离感',
      imageModel: 'character-model-1',
      analysisModel: 'analysis-model-1',
      promptMode: 'casting_photo',
      castingCandidateCount: 3,
    }, 'project-1'))

    expect(handlerSharedMock.generateCleanImageToStorage).toHaveBeenCalledTimes(3)
    for (const call of handlerSharedMock.generateCleanImageToStorage.mock.calls) {
      const input = call[0] as GenerationInput
      expect(input.prompt).toContain('选中的视觉风格案例（最高优先级）：')
      expect(input.prompt).toContain('冷白写实')
      expect(input.prompt).toContain('选中案例的媒介类别具有约束力')
      expect(input.options.referenceImages).toBeUndefined()
    }
  })
})
