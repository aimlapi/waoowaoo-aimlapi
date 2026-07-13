import { describe, expect, it } from 'vitest'
import { buildAudioContinuityPrompt, parseAudioContinuityPlan } from '@/lib/audio-design/continuity-analysis'
import { createTestContinuityPlan, TEST_CLOCK } from './audio-timeline-fixture'

describe('audio continuity director', () => {
  it('covers acoustic transitions in both directions and preserves loop phase', () => {
    const prompt = buildAudioContinuityPrompt({
      clock: TEST_CLOCK,
      clips: [{
        order: 1,
        sourceKind: 'panel',
        panelId: 'panel-1',
        groupId: null,
        shotNumber: 1,
        shotNumbers: [1],
        range: { startFrame: 0, endFrameExclusive: 240 },
        visualSummary: 'move between stadium interior and exterior',
        soundDirection: 'native dialogue and action sounds only',
      }],
      narrativeContext: { weather: 'same storm' },
      sceneContinuityFacts: {
        confirmedSceneBoundaryFrames: [],
        persistentSceneRule: 'preserve_until_positive_change_evidence',
        closeUpRule: 'background_absence_is_not_scene_change',
      },
      locale: 'zh',
    })

    expect(prompt).toContain('室内与室外双向')
    expect(prompt).toContain('开放与封闭双向')
    expect(prompt).toContain('保留 sourceContinuityId、素材、Loop 播放位置和相位')
    expect(prompt).toContain('所有 acousticTransitions.preservePlaybackPhase 必须严格为 true')
    expect(prompt).toContain('"preservePlaybackPhase": [')
    expect(prompt).toContain('"forbiddenPositiveActionTerms": [')
    expect(prompt).toContain('"footsteps"')
    expect(prompt).toContain('不得规划生成 Foley、Spot SFX、对白或动作替代音')
    expect(prompt).toContain('不得输出 finalLyriaPrompt')
    expect(prompt).toContain('# 严格枚举契约')
    expect(prompt).toContain('"distance": [')
    expect(prompt).toContain('"near"')
    expect(prompt).toContain('"pitchCenter": [')
    expect(prompt).toContain('"weakened_pitch_field"')
    expect(prompt).toContain('"orchestrationRoles": [')
    expect(prompt).toContain('"resonance"')
    expect(prompt).toContain('musicTheorySpec')
    expect(prompt).toContain('"keyframeMaximumInclusive": 239')
  })

  it('parses the strict SoundWorld and loop plan schema', () => {
    const parsed = parseAudioContinuityPlan(JSON.stringify(createTestContinuityPlan()), {
      confirmedSceneBoundaryFrames: [],
      persistentSceneRule: 'preserve_until_positive_change_evidence',
      closeUpRule: 'background_absence_is_not_scene_change',
    })
    expect(parsed.soundWorlds[0]?.continuityKey).toBe('stadium-same-night-same-storm')
    expect(parsed.ambienceSources[0]?.loopPolicy?.candidateCount).toBe(2)
    expect(parsed.acousticTransitions[0]?.preservePlaybackPhase).toBe(true)
  })
})
