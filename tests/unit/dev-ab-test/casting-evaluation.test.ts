import { describe, expect, it } from 'vitest'
import {
  parseDevAbCastingEvaluationResult,
} from '@/lib/dev-ab-test/casting-evaluation'

describe('dev A/B casting evaluation result parser', () => {
  it('parses a valid judging result with winner and per-variant scores', () => {
    const parsed = parseDevAbCastingEvaluationResult({
      winnerId: 'B',
      summary: 'B 更适合。',
      variants: [
        {
          id: 'A',
          totalScore: 78,
          criteria: [{ key: 'roleConsistency', score: 8, reason: '脸部一致' }],
          strengths: ['身份清楚'],
          risks: ['场景不足'],
          recommendation: '可作为备选。',
        },
        {
          id: 'B',
          totalScore: 91,
          criteria: [{ key: 'costumeRange', score: 9, reason: '换装明确' }],
          strengths: ['素材完整'],
          risks: ['局部特写稍少'],
          recommendation: '推荐选择。',
        },
      ],
    })

    expect(parsed?.winnerId).toBe('B')
    expect(parsed?.variants[1]?.totalScore).toBe(91)
    expect(parsed?.variants[1]?.criteria[0]).toEqual({
      key: 'costumeRange',
      score: 9,
      reason: '换装明确',
    })
  })

  it('rejects malformed results without inventing fallback scores', () => {
    expect(parseDevAbCastingEvaluationResult({ winnerId: 'C', variants: [] })).toBeNull()
    expect(parseDevAbCastingEvaluationResult({ winnerId: 'A', variants: [{ id: 'A' }] })).toBeNull()
  })
})
