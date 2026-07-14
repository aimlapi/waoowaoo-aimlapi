import { describe, expect, it } from 'vitest'
import { findAmbiencePromptPolicyViolation } from '@/lib/audio-design/ambience-prompt-policy'
import { ambienceSourceSchema } from '@/lib/audio-design/types'

function sourceWithPrompt(generationPrompt: string): unknown {
  return {
    sourceId: 'crowd-bed',
    sourceContinuityId: 'crowd-continuity',
    worldId: 'plaza-world',
    role: 'bed',
    playbackType: 'seamless_loop',
    semanticRole: 'crowd ambience',
    baseGainDb: -12,
    salience: 0.2,
    spectralRole: 'broadband',
    foregroundPolicy: 'background_only',
    range: { startFrame: 0, endFrameExclusive: 240 },
    description: 'indistinct outdoor crowd bed',
    generationPrompt,
    promptInfluence: 0.7,
    loopPolicy: {
      enabled: true,
      candidateCount: 2,
      targetFrames: 216,
      crossfadeFrames: 12,
      phaseOffsetFrames: 0,
      promptInfluence: 0.7,
    },
  }
}

describe('ambience generation prompt policy', () => {
  it('rejects synchronized action sounds before the ambience provider is called', () => {
    const prompt = 'Outdoor crowd atmosphere, cold damp air, distant footsteps on concrete.'
    expect(findAmbiencePromptPolicyViolation(prompt)).toBe('footsteps')
    const parsed = ambienceSourceSchema.safeParse(sourceWithPrompt(prompt))
    expect(parsed.success).toBe(false)
    if (parsed.success) throw new Error('TEST_AMBIENCE_POLICY_REJECTION_REQUIRED')
    expect(parsed.error.issues[0]?.message).toBe('AUDIO_AMBIENCE_PROMPT_ACTION_SOUND_FORBIDDEN:footsteps')
  })

  it('allows environmental beds and explicit exclusions', () => {
    expect(findAmbiencePromptPolicyViolation(
      'Cold wind and indistinct crowd murmur, no footsteps, no doors, no music.',
    )).toBeNull()
    expect(ambienceSourceSchema.safeParse(sourceWithPrompt(
      'Cold wind and indistinct crowd murmur, no footsteps, no doors, no music.',
    )).success).toBe(true)
  })
})
