import { describe, expect, it } from 'vitest'
import { resolveVisualContinuityFacts } from '@/lib/audio-design/visual-continuity'
import type { VideoVisualAnalysis } from '@/lib/audio-design/video-visual-types'

function analysisWithObservation(
  observation: VideoVisualAnalysis['observations'][number],
): VideoVisualAnalysis {
  return { schemaVersion: 2, sampleStepFrames: 24, observations: [observation] }
}

const baseObservation: VideoVisualAnalysis['observations'][number] = {
  frame: 864,
  location: 'campus plaza',
  locationEvidence: 'inferred',
  locationConfidence: 0.5,
  continuityWithPrevious: 'same_scene',
  transitionEvidence: ['camera_cut_only', 'background_out_of_frame'],
  enclosure: 'open',
  weather: 'overcast',
  persistentEnvironment: ['wind'],
  outOfFramePersistentEnvironment: ['crowd'],
  activityLevel: 0.9,
  suggestedScoreEnergy: 0.8,
  description: 'tight close-up in the same continuous action',
}

describe('visual scene continuity facts', () => {
  it('keeps a close-up camera cut inside the current scene', () => {
    expect(resolveVisualContinuityFacts(analysisWithObservation(baseObservation)))
      .toMatchObject({ confirmedSceneBoundaryFrames: [] })
  })

  it('rejects an asserted scene change that has no positive spatial or temporal evidence', () => {
    expect(() => resolveVisualContinuityFacts(analysisWithObservation({
      ...baseObservation,
      continuityWithPrevious: 'new_scene',
      locationConfidence: 0.95,
    }))).toThrow('AUDIO_VISUAL_SCENE_CHANGE_UNPROVEN:864')
  })

  it('accepts a directly observed establishing view of a new location', () => {
    expect(resolveVisualContinuityFacts(analysisWithObservation({
      ...baseObservation,
      location: 'interior corridor',
      locationEvidence: 'observed',
      locationConfidence: 0.95,
      continuityWithPrevious: 'new_scene',
      transitionEvidence: ['establishing_view_of_new_location'],
    })).confirmedSceneBoundaryFrames).toEqual([864])
  })
})
