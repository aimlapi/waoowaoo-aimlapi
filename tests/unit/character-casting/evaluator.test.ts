import { beforeEach, describe, expect, it, vi } from 'vitest'
import { CHARACTER_CASTING_CRITERIA } from '@/lib/character-casting/evaluation'

const executeVisionCompletionMock = vi.hoisted(() => vi.fn(async () => ({
  id: 'completion-1',
  choices: [{
    message: {
      content: JSON.stringify({
        winnerIndex: 0,
        summary: '候选缺少有效差异，0 仅作为占位赢家。',
        candidates: [0, 1, 2].map((candidateIndex) => ({
          candidateIndex,
          criteria: CHARACTER_CASTING_CRITERIA.map((key) => ({
            key,
            score: 2,
            reason: `${key} 缺少可见差异`,
          })),
          strengths: ['没有足够可见优势'],
          risks: ['候选近似重复'],
          recommendation: '需要重新生成更有差异的候选。',
        })),
      }),
    },
  }],
})))

vi.mock('@/lib/ai-exec/engine', () => ({
  executeVisionCompletion: executeVisionCompletionMock,
}))

describe('character casting evaluator', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('tells the judge not to invent different scores for near-duplicate candidates', async () => {
    const { evaluateCharacterCastingCandidates } = await import('@/lib/character-casting/evaluator')

    const result = await evaluateCharacterCastingCandidates({
      userId: 'user-1',
      locale: 'zh',
      analysisModel: 'vision-model',
      baseRequest: '中年女性，失业后回乡',
      candidates: [
        { candidateIndex: 0, request: '候选 A', imageUrl: 'https://example.com/a.jpg' },
        { candidateIndex: 1, request: '候选 B', imageUrl: 'https://example.com/b.jpg' },
        { candidateIndex: 2, request: '候选 C', imageUrl: 'https://example.com/c.jpg' },
      ],
    })

    const calls = executeVisionCompletionMock.mock.calls as unknown as Array<[{
      readonly textPrompt: string
    }]>
    const firstCall = calls[0]
    if (!firstCall) throw new Error('Expected executeVisionCompletion to be called')
    const prompt = firstCall[0].textPrompt
    expect(prompt).toContain('反假评分规则')
    expect(prompt).toContain('不得假装它们各有不同优点')
    expect(prompt).toContain('候选缺少有效差异')
    expect(prompt).toContain('winnerIndex 只能把 0 当作占位赢家')
    expect(result.winnerIndex).toBe(0)
    expect(result.summary).toContain('候选缺少有效差异')
  })
})
