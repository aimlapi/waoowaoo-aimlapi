import type { VideoVisualAnalysis } from './video-visual-types'

const POSITIVE_SCENE_CHANGE_EVIDENCE: ReadonlySet<string> = new Set([
  'visible_spatial_passage',
  'establishing_view_of_new_location',
  'time_discontinuity',
  'weather_discontinuity',
] as const)

export type VisualContinuityFacts = {
  readonly confirmedSceneBoundaryFrames: readonly number[]
  readonly persistentSceneRule: 'preserve_until_positive_change_evidence'
  readonly closeUpRule: 'background_absence_is_not_scene_change'
}

export function resolveVisualContinuityFacts(analysis: VideoVisualAnalysis): VisualContinuityFacts {
  const confirmedSceneBoundaryFrames: number[] = []
  for (const observation of analysis.observations) {
    if (observation.continuityWithPrevious !== 'new_scene') continue
    const hasPositiveEvidence = observation.transitionEvidence.some((evidence) => (
      POSITIVE_SCENE_CHANGE_EVIDENCE.has(evidence)
    ))
    if (
      observation.locationEvidence !== 'observed'
      || observation.locationConfidence < 0.8
      || !hasPositiveEvidence
    ) {
      throw new Error(`AUDIO_VISUAL_SCENE_CHANGE_UNPROVEN:${observation.frame}`)
    }
    confirmedSceneBoundaryFrames.push(observation.frame)
  }
  return {
    confirmedSceneBoundaryFrames,
    persistentSceneRule: 'preserve_until_positive_change_evidence',
    closeUpRule: 'background_absence_is_not_scene_change',
  }
}

export function assertSoundWorldBoundariesMatchVisualFacts(input: {
  readonly soundWorldStartFrames: readonly number[]
  readonly facts: VisualContinuityFacts
}): void {
  const expected = new Set([0, ...input.facts.confirmedSceneBoundaryFrames])
  for (const frame of input.soundWorldStartFrames) {
    if (!expected.has(frame)) throw new Error(`AUDIO_SOUND_WORLD_BOUNDARY_UNPROVEN:${frame}`)
  }
  for (const frame of input.facts.confirmedSceneBoundaryFrames) {
    if (!input.soundWorldStartFrames.includes(frame)) {
      throw new Error(`AUDIO_SOUND_WORLD_BOUNDARY_MISSING:${frame}`)
    }
  }
}
