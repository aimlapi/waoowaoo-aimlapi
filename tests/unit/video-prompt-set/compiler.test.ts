import { describe, expect, it } from 'vitest'
import { compileVideoPromptSet } from '@/lib/video-prompt-set'

function shot(input: {
  readonly key: string
  readonly beatId: string
  readonly entryStateId: string
  readonly exitStateId: string
  readonly incomingCut: null | {
    readonly type: 'hard_cut' | 'cut_on_action' | 'match_cut' | 'sound_bridge' | 'motivated_reveal'
    readonly handoff: string
  }
  readonly shotSize: 'wide' | 'close'
  readonly angle: 'eye_level' | 'low'
  readonly subjectPlacement: 'left_third' | 'right_third'
}) {
  return {
    key: input.key,
    durationSeconds: 5,
    editRole: `Advance ${input.beatId}`,
    entryState: { stateId: input.entryStateId, description: `Entry ${input.entryStateId}` },
    incomingCut: input.incomingCut,
    references: [
      { key: 'Character image', mediaType: 'image' as const, purpose: 'Character identity' },
      { key: 'Character voice', mediaType: 'audio' as const, purpose: 'Voice identity' },
    ],
    camera: {
      shotSize: input.shotSize,
      angle: input.angle,
      subjectPlacement: input.subjectPlacement,
      screenDirection: 'left_to_right' as const,
      movement: 'locked' as const,
      lensAndDepth: 'Natural depth separation.',
      gazeTarget: 'The character looks at the door.',
      composition: 'The door remains visible in negative space.',
    },
    action: {
      beatId: input.beatId,
      description: `Perform ${input.beatId} once.`,
      dialogue: null,
    },
    exitState: { stateId: input.exitStateId, description: `Exit ${input.exitStateId}` },
    cutPoint: `After ${input.beatId} completes.`,
    sound: 'Audible room tone and synchronized movement.',
    prohibitions: [],
  }
}

describe('video prompt set compiler', () => {
  it('compiles one-shot contracts with deterministic independent media numbering', () => {
    const compiled = compileVideoPromptSet({
      aspectRatio: '16:9',
      locale: 'zh-CN',
      output: {
        kind: 'video_prompt_set',
        segments: [
          shot({
            key: 'shot-1',
            beatId: 'door-opens',
            entryStateId: 'door-closed',
            exitStateId: 'door-open',
            incomingCut: null,
            shotSize: 'wide',
            angle: 'eye_level',
            subjectPlacement: 'left_third',
          }),
          shot({
            key: 'shot-2',
            beatId: 'character-enters',
            entryStateId: 'door-open',
            exitStateId: 'character-inside',
            incomingCut: { type: 'cut_on_action', handoff: 'The open door carries the motion forward.' },
            shotSize: 'close',
            angle: 'low',
            subjectPlacement: 'right_third',
          }),
        ],
      },
    })

    expect(compiled.segments[0]?.prompt).toContain('一个连续镜头')
    expect(compiled.segments[0]?.prompt).toContain('@Image1 = Character image')
    expect(compiled.segments[0]?.prompt).toContain('@Audio1 = Character voice')
    expect(compiled.segments[0]?.referenceKeys).toEqual(['Character image', 'Character voice'])
  })

  it('rejects broken state handoff and insufficient adjacent visual variation', () => {
    expect(() => compileVideoPromptSet({
      aspectRatio: '16:9',
      output: {
        kind: 'video_prompt_set',
        segments: [
          shot({
            key: 'shot-1',
            beatId: 'door-opens',
            entryStateId: 'door-closed',
            exitStateId: 'door-open',
            incomingCut: null,
            shotSize: 'wide',
            angle: 'eye_level',
            subjectPlacement: 'left_third',
          }),
          shot({
            key: 'shot-2',
            beatId: 'character-enters',
            entryStateId: 'wrong-state',
            exitStateId: 'character-inside',
            incomingCut: { type: 'hard_cut', handoff: 'Continue after the opened door.' },
            shotSize: 'wide',
            angle: 'eye_level',
            subjectPlacement: 'left_third',
          }),
        ],
      },
    })).toThrow('VIDEO_SHOT_CONTINUITY_STATE_MISMATCH')
  })
})
