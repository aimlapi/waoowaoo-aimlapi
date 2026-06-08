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
      prompt: 'stop-motion clay and fabric character look-test, muted cool palette',
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
    expect(generationInput?.prompt).toContain('完整候选形象包')
    expect(generationInput?.prompt).toContain('至少两种不同表情')
    expect(generationInput?.prompt).toContain('至少两套不同服装或穿搭层次')
    expect(generationInput?.prompt).toContain('绝对禁止：任何来自旧项目风格、系统风格预设')
    expect(generationInput?.prompt).toContain('姓名、电话、邮箱')
    expect(generationInput?.prompt).not.toContain('真人摄影 contact sheet')
    expect(generationInput?.prompt).not.toContain('绝对禁止：概念艺术、插画、CG')
    expect(generationInput?.prompt).not.toContain('本次角色资产风格规范')
    expect(generationInput?.options.referenceImages).toEqual(['normalized-style-ref'])
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
    expect(handlerSharedMock.generateCleanImageToStorage.mock.calls[0]?.[0].prompt).toContain('候选 A 方向：生活真实度优先')
    expect(handlerSharedMock.generateCleanImageToStorage.mock.calls[1]?.[0].prompt).toContain('候选 B 方向：情绪创伤与表演强度优先')
    expect(handlerSharedMock.generateCleanImageToStorage.mock.calls[2]?.[0].prompt).toContain('候选 C 方向：造型记忆点与轮廓识别优先')
    expect(handlerSharedMock.generateCleanImageToStorage.mock.calls[2]?.[0].prompt).toContain('候选差异硬约束')
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
      expect(input.options.referenceImages).toEqual(['normalized-style-ref'])
    }
  })
})
