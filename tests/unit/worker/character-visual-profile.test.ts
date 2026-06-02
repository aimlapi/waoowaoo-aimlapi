import type { Job } from 'bullmq'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { TASK_TYPE, type TaskJobData } from '@/lib/task/types'

const prismaMock = vi.hoisted(() => ({
  $transaction: vi.fn(),
  projectCharacter: {
    findFirst: vi.fn(),
    update: vi.fn(async () => ({})),
    delete: vi.fn(async () => ({})),
  },
  characterAppearance: {
    create: vi.fn(async () => ({})),
    deleteMany: vi.fn(async () => ({ count: 1 })),
  },
}))

const llmMock = vi.hoisted(() => ({
  getCompletionContent: vi.fn(),
}))

const helperMock = vi.hoisted(() => ({
  resolveProjectModel: vi.fn(async () => ({
    projectId: 'project-1',
    analysisModel: 'llm::analysis-1',
  })),
}))

const workerMock = vi.hoisted(() => ({
  reportTaskProgress: vi.fn(async () => undefined),
  assertTaskActive: vi.fn(async () => undefined),
}))

vi.mock('@/lib/prisma', () => ({ prisma: prismaMock }))
vi.mock('@/lib/ai-exec/engine', () => ({
  executeAiTextStep: vi.fn(async () => ({
    text: llmMock.getCompletionContent(),
    reasoning: '',
    usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
    completion: { id: 'completion-1' },
  })),
}))
vi.mock('@/types/character-profile', () => ({
  validateProfileData: vi.fn(() => true),
  stringifyProfileData: vi.fn((value: unknown) => JSON.stringify(value)),
}))
vi.mock('@/lib/llm-observe/internal-stream-context', () => ({
  getInternalLLMStreamCallbacks: vi.fn(() => null),
  withInternalLLMStreamCallbacks: vi.fn(async (_callbacks: unknown, fn: () => Promise<unknown>) => await fn()),
}))
vi.mock('@/lib/workers/shared', () => ({ reportTaskProgress: workerMock.reportTaskProgress }))
vi.mock('@/lib/workers/utils', () => ({ assertTaskActive: workerMock.assertTaskActive }))
vi.mock('@/lib/workers/handlers/llm-stream', () => ({
  createWorkerLLMStreamContext: vi.fn(() => ({ streamRunId: 'run-1', nextSeqByStepLane: {} })),
  createWorkerLLMStreamCallbacks: vi.fn(() => ({
    onStage: vi.fn(),
    onChunk: vi.fn(),
    onComplete: vi.fn(),
    onError: vi.fn(),
    flush: vi.fn(async () => undefined),
  })),
}))
vi.mock('@/lib/workers/handlers/character-visual-profile-helpers', async () => {
  const actual = await vi.importActual<typeof import('@/lib/workers/handlers/character-visual-profile-helpers')>(
    '@/lib/workers/handlers/character-visual-profile-helpers',
  )
  return {
    ...actual,
    resolveProjectModel: helperMock.resolveProjectModel,
  }
})
vi.mock('@/lib/ai-prompts', () => ({
  AI_PROMPT_IDS: { CHARACTER_VISUAL_PROFILE: 'character-visual-profile' },
  buildAiPrompt: vi.fn(() => 'character-visual-prompt'),
}))

import {
  generateCharacterVisualProfile,
  generateCreatedCharacterVisualProfile,
} from '@/lib/workers/handlers/character-visual-profile'

function buildJob(): Job<TaskJobData> {
  return {
    data: {
      taskId: 'task-analyze-global-1',
      type: TASK_TYPE.ANALYZE_GLOBAL,
      locale: 'zh',
      projectId: 'project-1',
      episodeId: null,
      targetType: 'Project',
      targetId: 'project-1',
      payload: {},
      userId: 'user-1',
    },
  } as unknown as Job<TaskJobData>
}

describe('worker character visual profile behavior', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    prismaMock.$transaction.mockImplementation(async (callback: (tx: typeof prismaMock) => Promise<unknown>) => {
      return await callback(prismaMock)
    })

    llmMock.getCompletionContent.mockReturnValue(
      JSON.stringify({
        characters: [
          {
            appearances: [
              {
                change_reason: '默认形象',
                descriptions: ['黑发，冷静，风衣'],
              },
            ],
          },
        ],
      }),
    )

    prismaMock.projectCharacter.findFirst.mockImplementation(async (args: { where: { id: string } }) => ({
      id: args.where.id,
      name: 'Hero',
      profileData: JSON.stringify({ archetype: 'lead' }),
      profileConfirmed: false,
      projectId: 'project-1',
    }))
  })

  it('generates visual profile -> rebuilds appearances and marks profileConfirmed', async () => {
    const result = await generateCharacterVisualProfile(buildJob(), { characterId: 'character-1' })

    expect(prismaMock.characterAppearance.deleteMany).toHaveBeenCalledWith({
      where: { characterId: 'character-1' },
    })
    expect(prismaMock.characterAppearance.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        characterId: 'character-1',
        appearanceIndex: 0,
        changeReason: '默认形象',
        description: '黑发，冷静，风衣',
        descriptionMetadata: JSON.stringify([
          {
            description: '黑发，冷静，风衣',
            visualTraits: {
              face: '',
              hair: '',
              body: '',
              costume: '',
              makeupAndAccessories: '',
              skin: '',
              visibleState: '',
              accessibility: '',
              tattoosAndMarks: '',
              scars: '',
            },
            castingNotes: {
              score: null,
              strengths: [],
              risks: [],
              recommendation: '',
              fitTags: [],
            },
            castingStills: [],
          },
        ]),
      }),
    })

    expect(prismaMock.projectCharacter.update).toHaveBeenCalledWith({
      where: { id: 'character-1' },
      data: {
        profileData: JSON.stringify({ archetype: 'lead' }),
        profileConfirmed: true,
      },
    })

    expect(result).toEqual(expect.objectContaining({
      success: true,
      character: expect.objectContaining({
        id: 'character-1',
        profileConfirmed: true,
      }),
    }))
  })

  it('structured visual profile candidates -> persists casting metadata aligned with descriptions', async () => {
    llmMock.getCompletionContent.mockReturnValue(
      JSON.stringify({
        characters: [
          {
            appearances: [
              {
                change_reason: '初始形象',
                descriptions: ['轮廓分明，黑色风衣，黑色皮鞋'],
                candidates: [
                  {
                    description: '轮廓分明，黑色风衣，黑色皮鞋',
                    visual_traits: {
                      face: '方脸，眉骨清晰',
                      body: '高挑宽肩',
                      costume: '黑色风衣与黑色皮鞋',
                      skin: '皮肤纹理粗粝',
                      visible_state: '眼下有轻微倦纹',
                      accessibility: '手杖',
                      tattoos_and_marks: '左颈小纹身',
                      scars: '眉尾短疤',
                    },
                    casting_notes: {
                      score: 87,
                      strengths: ['辨识度强', '时代感明确'],
                      risks: ['风衣细节可能被弱化'],
                      recommendation: '适合作为主视觉候选。',
                      fit_tags: ['镜头友好'],
                    },
                    casting_stills: [
                      {
                        kind: 'crying',
                        title: '哭泣表情定妆',
                        prompt: '同一角色哭泣状态，手杖仍在身侧',
                        expression: '哭泣',
                        prop: '手杖',
                        background: '低干扰灰墙',
                        purpose: '测试悲伤戏表情适配',
                      },
                      {
                        kind: 'smiling',
                        title: '微笑表情定妆',
                        prompt: '同一角色自然微笑状态',
                        expression: '微笑',
                        prop: '',
                        background: '低干扰灰墙',
                        purpose: '测试亲和力',
                      },
                      {
                        kind: 'costume',
                        title: '雨夜外勤换装定妆',
                        prompt: '同一角色换上防水长外套和黑色战术靴',
                        expression: '中性',
                        prop: '',
                        background: '低干扰灰墙',
                        purpose: '测试服装跨度',
                      },
                    ],
                  },
                ],
              },
            ],
          },
        ],
      }),
    )

    await generateCharacterVisualProfile(buildJob(), { characterId: 'character-1' })

    const createCall = prismaMock.characterAppearance.create.mock.calls.at(-1) as
      | [{ data?: { descriptions?: string; descriptionMetadata?: string } }]
      | undefined
    expect(createCall?.[0].data?.descriptions).toBe(JSON.stringify(['轮廓分明，黑色风衣，黑色皮鞋']))
    const metadata = JSON.parse(createCall?.[0].data?.descriptionMetadata ?? '[]') as Array<{
      description: string
      visualTraits: {
        face: string
        body: string
        costume: string
        skin: string
        visibleState: string
        accessibility: string
        tattoosAndMarks: string
        scars: string
      }
      castingNotes: {
        score: number | null
        strengths: string[]
        risks: string[]
        recommendation: string
        fitTags: string[]
      }
      castingStills: Array<{
        kind: string
        title: string
        prompt: string
        expression: string
        prop: string
        background: string
        purpose: string
      }>
    }>
    expect(metadata[0]?.description).toBe('轮廓分明，黑色风衣，黑色皮鞋')
    expect(metadata[0]?.visualTraits).toEqual(expect.objectContaining({
      face: '方脸，眉骨清晰',
      body: '高挑宽肩',
      costume: '黑色风衣与黑色皮鞋',
      skin: '皮肤纹理粗粝',
      visibleState: '眼下有轻微倦纹',
      accessibility: '手杖',
      tattoosAndMarks: '左颈小纹身',
      scars: '眉尾短疤',
    }))
    expect(metadata[0]?.castingNotes).toEqual({
      score: 87,
      strengths: ['辨识度强', '时代感明确'],
      risks: ['风衣细节可能被弱化'],
      recommendation: '适合作为主视觉候选。',
      fitTags: ['镜头友好'],
    })
    expect(metadata[0]?.castingStills).toEqual([
      {
        kind: 'crying',
        title: '哭泣表情定妆',
        prompt: '同一角色哭泣状态，手杖仍在身侧',
        expression: '哭泣',
        prop: '手杖',
        background: '低干扰灰墙',
        purpose: '测试悲伤戏表情适配',
      },
      {
        kind: 'smiling',
        title: '微笑表情定妆',
        prompt: '同一角色自然微笑状态',
        expression: '微笑',
        prop: '',
        background: '低干扰灰墙',
        purpose: '测试亲和力',
      },
      {
        kind: 'costume',
        title: '雨夜外勤换装定妆',
        prompt: '同一角色换上防水长外套和黑色战术靴',
        expression: '中性',
        prop: '',
        background: '低干扰灰墙',
        purpose: '测试服装跨度',
      },
    ])
  })

  it('newly created character visual profile failure -> deletes the created character before rethrowing', async () => {
    llmMock.getCompletionContent.mockReturnValue(JSON.stringify({ characters: [{ appearances: [] }] }))

    await expect(generateCreatedCharacterVisualProfile(
      buildJob(),
      'character-1',
      { suppressProgress: true },
    )).rejects.toThrow('AI返回格式错误: 缺少 appearances')

    expect(prismaMock.projectCharacter.delete).toHaveBeenCalledWith({
      where: { id: 'character-1' },
    })
  })
})
