import { describe, expect, it } from 'vitest'
import { analyzeNativeAudioSamples } from '@/lib/audio-design/native-audio-analysis'
import { TEST_CLOCK } from './audio-timeline-fixture'

describe('native video audio analysis', () => {
  it('detects frame-locked activity and transients without inventing event semantics', () => {
    const samples = new Float32Array(48_000 * 10)
    const frameSamples = 2_000
    for (let index = frameSamples * 3; index < frameSamples * 8; index += 1) {
      samples[index] = Math.sin(index / 8) * 0.08
    }
    samples[frameSamples * 3] = 0.9

    const analysis = analyzeNativeAudioSamples({
      samples,
      clock: TEST_CLOCK,
      clip: {
        order: 1,
        sourceKind: 'panel',
        panelId: 'panel-1',
        groupId: null,
        shotNumber: 1,
        shotNumbers: [1],
        range: { startFrame: 0, endFrameExclusive: 240 },
        visualSummary: null,
        soundDirection: null,
      },
    })

    expect(analysis.frameFeatures).toHaveLength(240)
    expect(analysis.activityRanges).toEqual(expect.arrayContaining([
      expect.objectContaining({ range: expect.objectContaining({ startFrame: 3 }) }),
    ]))
    expect(analysis.transientFrames).toContain(3)
    expect(JSON.stringify(analysis)).not.toMatch(/dialogue|footstep|door/i)
  })
})
