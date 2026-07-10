import { describe, expect, it } from 'vitest'
import { buildGainAutomationVolumeFilter } from '@/lib/audio-design/automation'
import { automationLaneSchema } from '@/lib/audio-design/types'
import { TEST_CLOCK } from './audio-timeline-fixture'

describe('frame-locked gain automation', () => {
  it('renders a smooth curve instead of a rectangular mute window', () => {
    const filter = buildGainAutomationVolumeFilter({
      baseVolume: 0.8,
      clock: TEST_CLOCK,
      lanes: [{
        laneId: 'score-action-space',
        targetBus: 'score',
        targetSourceId: null,
        parameter: 'gain_db',
        keyframes: [
          { frame: 48, value: 0, interpolation: 'smooth' },
          { frame: 60, value: -4, interpolation: 'smooth' },
          { frame: 72, value: -4, interpolation: 'linear' },
          { frame: 96, value: 0, interpolation: 'smooth' },
        ],
        postBehavior: 'hold',
        reason: 'leave space for a native synchronized action sound',
        sourceEventId: 'native-action-1',
      }],
    })

    expect(filter).toContain('pow(10')
    expect(filter).toContain('(3-2*')
    expect(filter).not.toContain('between(')
    expect(filter).not.toContain(',0,')
  })

  it('keeps executable automation to one authoritative gain parameter', () => {
    expect(automationLaneSchema.safeParse({
      laneId: 'unsupported-filter',
      targetBus: 'ambience',
      targetSourceId: 'rain',
      parameter: 'low_pass_hz',
      keyframes: [
        { frame: 0, value: 2_000, interpolation: 'smooth' },
        { frame: 24, value: 12_000, interpolation: 'smooth' },
      ],
      postBehavior: 'hold',
      reason: 'perspective transition',
      sourceEventId: 'transition-1',
    }).success).toBe(false)
  })
})
