import { describe, expect, it } from 'vitest'
import {
  buildVideoVisualAnalysisPrompt,
  parseVideoVisualObservationBatch,
} from '@/lib/audio-design/video-visual-analysis'
import { TEST_CLOCK } from './audio-timeline-fixture'

describe('locked video visual analysis', () => {
  it('uses exact frame identities and restricts observations to ambience and score facts', () => {
    const prompt = buildVideoVisualAnalysisPrompt([
      { frame: 0, imageUrl: 'data:image/jpeg;base64,AA==' },
      { frame: 24, imageUrl: 'data:image/jpeg;base64,AA==' },
    ], TEST_CLOCK)

    expect(prompt).toContain('Image 1: frame 0')
    expect(prompt).toContain('Image 2: frame 24')
    expect(prompt).toContain('Do not invent screenplay facts, dialogue, sound effects, or off-screen actions')
    expect(prompt).toContain('restricted narrative event')
  })

  it('rejects a vision response that changes the locked frame map', () => {
    const response = JSON.stringify({
      observations: [{
        frame: 1,
        location: 'interior room',
        enclosure: 'enclosed',
        weather: null,
        persistentEnvironment: ['room tone'],
        activityLevel: 0.2,
        suggestedScoreEnergy: 0.1,
        description: 'quiet interior',
      }],
    })

    expect(() => parseVideoVisualObservationBatch(response, [0]))
      .toThrow('AUDIO_VISUAL_ANALYSIS_FRAME_MAP_INVALID:1')
  })
})
