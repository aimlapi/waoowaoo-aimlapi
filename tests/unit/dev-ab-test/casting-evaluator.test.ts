import { beforeEach, describe, expect, it, vi } from 'vitest'
import { DEV_AB_CASTING_CRITERIA } from '@/lib/dev-ab-test/casting-evaluation'

const getUserModelConfigMock = vi.hoisted(() => vi.fn(async () => ({
  analysisModel: 'vision::judge-model' as string | null,
  characterModel: null,
  locationModel: null,
  storyboardModel: null,
  editModel: null,
  videoModel: null,
  audioModel: null,
  musicModel: null,
  capabilityDefaults: {},
})))

const executeVisionCompletionMock = vi.hoisted(() => vi.fn(async () => ({
  id: 'completion-1',
  choices: [{
    message: {
      content: JSON.stringify({
        winnerId: 'B',
        summary: 'B 的定妆素材更完整。',
        variants: [
          {
            id: 'A',
            criteria: DEV_AB_CASTING_CRITERIA.map((key) => ({
              key,
              score: 7,
              reason: `${key} A 可见依据`,
            })),
            strengths: ['A 脸部稳定'],
            risks: ['A 缺少背景素材'],
            recommendation: 'A 可作为备选。',
          },
          {
            id: 'B',
            criteria: DEV_AB_CASTING_CRITERIA.map((key) => ({
              key,
              score: key === 'costumeRange' ? 9 : 8,
              reason: `${key} B 可见依据`,
            })),
            strengths: ['B 换装明确', 'B 场景完整'],
            risks: ['B 局部特写可再加强'],
            recommendation: 'B 推荐选择。',
          },
        ],
      }),
    },
  }],
})))

vi.mock('@/lib/config-service', () => ({
  getUserModelConfig: getUserModelConfigMock,
}))

vi.mock('@/lib/ai-exec/engine', () => ({
  executeVisionCompletion: executeVisionCompletionMock,
}))

import { evaluateDevAbCasting } from '@/lib/dev-ab-test/casting-evaluator'

describe('dev A/B casting evaluator', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    getUserModelConfigMock.mockResolvedValue({
      analysisModel: 'vision::judge-model',
      characterModel: null,
      locationModel: null,
      storyboardModel: null,
      editModel: null,
      videoModel: null,
      audioModel: null,
      musicModel: null,
      capabilityDefaults: {},
    })
  })

  it('runs vision judging on A/B images and computes total scores from criteria', async () => {
    const result = await evaluateDevAbCasting({
      userId: 'user-1',
      locale: 'zh',
      baseRequest: '女调查员，手杖，助听器，纹身',
      variants: [
        { id: 'A', request: 'A 方案：白底身份照', imageUrl: 'https://signed.example/a.jpg' },
        { id: 'B', request: 'B 方案：换装和背景照', imageUrl: 'https://signed.example/b.jpg' },
      ],
    })

    expect(executeVisionCompletionMock).toHaveBeenCalledWith(expect.objectContaining({
      userId: 'user-1',
      model: 'vision::judge-model',
      imageUrls: ['https://signed.example/a.jpg', 'https://signed.example/b.jpg'],
      options: expect.objectContaining({
        temperature: 0.1,
        action: 'dev_ab_casting_evaluate',
      }),
    }))
    const calls = executeVisionCompletionMock.mock.calls as unknown as Array<[{ textPrompt: string }]>
    const firstCall = calls[0]
    const prompt = firstCall?.[0].textPrompt ?? ''
    expect(prompt).toContain('图片 1 是 A 方案，图片 2 是 B 方案')
    expect(prompt).toContain('女调查员，手杖，助听器，纹身')
    expect(result.winnerId).toBe('B')
    expect(result.variants[0]?.totalScore).toBe(70)
    expect(result.variants[1]?.totalScore).toBe(81)
  })

  it('missing analysis model -> fails explicitly before judging', async () => {
    getUserModelConfigMock.mockResolvedValueOnce({
      analysisModel: null,
      characterModel: null,
      locationModel: null,
      storyboardModel: null,
      editModel: null,
      videoModel: null,
      audioModel: null,
      musicModel: null,
      capabilityDefaults: {},
    })

    await expect(evaluateDevAbCasting({
      userId: 'user-1',
      locale: 'zh',
      baseRequest: '女调查员',
      variants: [
        { id: 'A', request: 'A 方案', imageUrl: 'https://signed.example/a.jpg' },
        { id: 'B', request: 'B 方案', imageUrl: 'https://signed.example/b.jpg' },
      ],
    })).rejects.toThrow('DEV_AB_CASTING_ANALYSIS_MODEL_REQUIRED')

    expect(executeVisionCompletionMock).not.toHaveBeenCalled()
  })
})
