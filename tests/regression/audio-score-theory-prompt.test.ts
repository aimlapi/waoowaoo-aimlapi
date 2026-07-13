import { describe, expect, it } from 'vitest'
import { buildLyriaPrompts } from '@/lib/audio-design/lyria-prompt'
import type { MusicTheorySpecV3 } from '@/lib/audio-design/types'
import { createTestContinuityPlan, TEST_CLOCK } from '../unit/audio-design/audio-timeline-fixture'

function render(spec: MusicTheorySpecV3): ReturnType<typeof buildLyriaPrompts> {
  const cue = createTestContinuityPlan().scoreCues[0]!
  return buildLyriaPrompts({
    cue: { ...cue, musicTheorySpec: spec },
    clock: TEST_CLOCK,
    strategy: 'balanced_ensemble',
  })
}

describe('music-theory provider prompt regressions', () => {
  it('compiles horror pressure into unresolved theory without positive genre drift', () => {
    const spec = createTestContinuityPlan().scoreCues[0]!.musicTheorySpec
    const output = render(spec)

    expect(output.prompt).toContain('weakened pitch field')
    expect(output.prompt).toContain('no cadence')
    expect(output.negativePrompt).toContain('global energy apex followed by consonant tonal stabilization')
    expect(`${output.prompt} ${output.negativePrompt}`).not.toMatch(
      /horror|terror|violent|blood|heroic|triumphant|victory|romantic|cathartic|redemptive|trailer|physical action/i,
    )
  })

  it('compiles restrained mutual affection into incomplete musical resolution', () => {
    const base = createTestContinuityPlan().scoreCues[0]!.musicTheorySpec
    const output = render({
      ...base,
      metricSalience: 'low',
      eventSpacing: 'irregular',
      pitch: {
        centerType: 'modal',
        centerPitch: 'A',
        collection: 'modal',
        intervalRelations: ['sustained_common_tones', 'major_seventh_tension'],
        microtonality: 'none',
      },
      harmony: {
        functionalSyntax: 'limited',
        cadencePolicy: 'withhold_tonic',
        harmonicRhythm: 'slow',
      },
      orchestration: base.orchestration.map((part, index) => index === 0
        ? { ...part, family: 'keyboards', instrument: 'felt_piano', register: 'mid', spectralSlot: 'mid', role: 'resonance', techniques: ['sustained_tone'] }
        : index === 1
          ? { ...part, family: 'strings', instrument: 'solo_viola', register: 'low_mid', spectralSlot: 'low_mid', role: 'motion', techniques: ['flautando'] }
          : part),
    })

    expect(output.prompt).toContain('withhold tonic')
    expect(output.prompt).toContain('sustained common tones')
    expect(output.prompt).not.toMatch(/romance|love|warm intimacy/i)
  })

  it('keeps action propulsion technical and explicitly excludes triumph', () => {
    const base = createTestContinuityPlan().scoreCues[0]!.musicTheorySpec
    const output = render({
      ...base,
      metricSalience: 'explicit',
      eventSpacing: 'irregular',
      texture: { organization: 'sparse_counterpoint', density: 'moderate', layerIndependence: 0.7 },
      dynamics: { envelope: 'continuous_redistribution', transientPolicy: 'permitted', minimumEnergy: 0.3, maximumEnergy: 0.85 },
      orchestration: base.orchestration.map((part, index) => index === 0
        ? { ...part, family: 'percussion', instrument: 'frame_drum', register: 'low_mid', spectralSlot: 'low_mid', role: 'pulse', rhythmicFunction: 'ostinato', techniques: ['sustained_tone'] }
        : index === 1
          ? { ...part, family: 'synthesizer', instrument: 'filtered_analog_synthesizer', register: 'low', spectralSlot: 'low', role: 'motion', techniques: ['sustained_tone'] }
          : part),
    })

    expect(output.prompt).toContain('explicit metric salience')
    expect(output.negativePrompt).toContain('major-mode cadential arrival with metrically reinforced pulse')
    expect(output.prompt).not.toMatch(/action|adventure|exciting/i)
  })

  it('represents comedy timing through meter and spacing without genre adjectives', () => {
    const base = createTestContinuityPlan().scoreCues[0]!.musicTheorySpec
    const output = render({
      ...base,
      bpm: 96,
      meter: '3/4',
      metricSalience: 'moderate',
      eventSpacing: 'irregular',
      pitch: {
        centerType: 'tonal', centerPitch: 'C', collection: 'diatonic',
        intervalRelations: ['quartal_structures'], microtonality: 'none',
      },
      harmony: { functionalSyntax: 'limited', cadencePolicy: 'deceptive_only', harmonicRhythm: 'moderate' },
      texture: { organization: 'homophonic', density: 'sparse', layerIndependence: 0.3 },
    })

    expect(output.prompt).toContain('96 BPM in 3/4')
    expect(output.prompt).toContain('irregular event spacing')
    expect(output.prompt).not.toMatch(/comedy|funny|playful|whimsical/i)
  })
})
