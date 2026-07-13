import { z } from 'zod'
import { findAmbiencePromptPolicyViolation } from './ambience-prompt-policy'

export const AUDIO_TIMELINE_SCHEMA_VERSION = 3 as const
export const AUDIO_SAMPLE_RATE = 48_000 as const

export const frameRangeSchema = z.object({
  startFrame: z.number().int().min(0),
  endFrameExclusive: z.number().int().positive(),
}).superRefine((range, ctx) => {
  if (range.endFrameExclusive <= range.startFrame) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['endFrameExclusive'],
      message: 'AUDIO_FRAME_RANGE_INVALID',
    })
  }
})

export const timelineClockSchema = z.object({
  fpsNumerator: z.number().int().positive().max(240_000),
  fpsDenominator: z.number().int().positive().max(10_000),
  sampleRate: z.literal(AUDIO_SAMPLE_RATE),
  totalFrames: z.number().int().positive(),
})

export const timelineClipAudioSchema = z.object({
  order: z.number().int().positive(),
  sourceKind: z.enum(['panel', 'videoGroup']),
  panelId: z.string().trim().min(1),
  groupId: z.string().trim().min(1).optional().nullable(),
  shotNumber: z.number().int().positive().optional().nullable(),
  shotNumbers: z.array(z.number().int().positive()),
  range: frameRangeSchema,
  visualSummary: z.string().trim().min(1).optional().nullable(),
  soundDirection: z.string().trim().min(1).optional().nullable(),
})

export const nativeAudioPolicySchema = z.object({
  provider: z.enum(['seedance_2_0', 'video_model_native']),
  dialogueAndActionPolicy: z.literal('keep_native_dialogue_and_synchronized_actions'),
  generatedPostRoles: z.tuple([z.literal('ambience'), z.literal('bgm')]),
  missingCriticalActionPolicy: z.literal('fail_and_regenerate_video_segment'),
})

export const ACOUSTIC_ENCLOSURE_VALUES = ['open', 'semi_open', 'enclosed'] as const
export const ACOUSTIC_DISTANCE_VALUES = ['near', 'medium', 'far'] as const

export const acousticPerspectiveSchema = z.object({
  perspectiveId: z.string().trim().min(1),
  zoneId: z.string().trim().min(1),
  range: frameRangeSchema,
  enclosure: z.enum(ACOUSTIC_ENCLOSURE_VALUES),
  distance: z.enum(ACOUSTIC_DISTANCE_VALUES),
  occlusion: z.number().min(0).max(1),
  description: z.string().trim().min(1),
})

export const soundWorldSchema = z.object({
  worldId: z.string().trim().min(1),
  continuityKey: z.string().trim().min(1),
  range: frameRangeSchema,
  location: z.string().trim().min(1),
  timeContext: z.string().trim().min(1),
  weatherContext: z.string().trim().min(1).optional().nullable(),
  persistentSourceIds: z.array(z.string().trim().min(1)),
  perspectives: z.array(acousticPerspectiveSchema).min(1),
})

export const ACOUSTIC_TRANSITION_TYPE_VALUES = [
  'entering_enclosure',
  'exiting_enclosure',
  'approaching_source',
  'receding_from_source',
  'occlusion_increasing',
  'occlusion_decreasing',
  'portal_opening',
  'portal_closing',
  'room_to_room',
  'perspective_shift',
] as const
export const acousticTransitionTypeSchema = z.enum(ACOUSTIC_TRANSITION_TYPE_VALUES)

export const acousticTransitionSchema = z.object({
  transitionId: z.string().trim().min(1),
  sourceContinuityId: z.string().trim().min(1),
  range: frameRangeSchema,
  fromZoneId: z.string().trim().min(1),
  toZoneId: z.string().trim().min(1),
  transitionType: acousticTransitionTypeSchema,
  preservePlaybackPhase: z.literal(true),
  automationIntent: z.object({
    gain: z.string().trim().min(1),
    frequency: z.string().trim().min(1),
    spatialWidth: z.string().trim().min(1),
    reverb: z.string().trim().min(1),
  }),
})

export const nativeActionAudibleStateSchema = z.enum([
  'present',
  'weak',
  'missing',
  'uncertain',
])

export const nativeActionEventSchema = z.object({
  eventId: z.string().trim().min(1),
  actionType: z.string().trim().min(1),
  range: frameRangeSchema,
  anchorFrame: z.number().int().min(0),
  confidence: z.number().min(0).max(1),
  audibleState: nativeActionAudibleStateSchema,
  mixImportance: z.enum(['background', 'story', 'critical']),
  description: z.string().trim().min(1),
}).superRefine((event, ctx) => {
  if (event.anchorFrame < event.range.startFrame || event.anchorFrame >= event.range.endFrameExclusive) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['anchorFrame'],
      message: 'AUDIO_NATIVE_ACTION_ANCHOR_OUT_OF_RANGE',
    })
  }
})

export const AMBIENCE_PLAYBACK_TYPE_VALUES = [
  'seamless_loop',
  'ambient_event',
  'continuous_evolving',
] as const
export const ambiencePlaybackTypeSchema = z.enum(AMBIENCE_PLAYBACK_TYPE_VALUES)

export const ambienceLoopPolicySchema = z.object({
  enabled: z.literal(true),
  candidateCount: z.literal(2),
  targetFrames: z.number().int().positive(),
  crossfadeFrames: z.number().int().positive(),
  phaseOffsetFrames: z.number().int().min(0),
  promptInfluence: z.number().min(0).max(1),
}).superRefine((policy, ctx) => {
  if (policy.crossfadeFrames * 2 >= policy.targetFrames) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['crossfadeFrames'],
      message: 'AUDIO_AMBIENCE_LOOP_CROSSFADE_TOO_LONG',
    })
  }
})

export const ambienceSourceSchema = z.object({
  sourceId: z.string().trim().min(1),
  sourceContinuityId: z.string().trim().min(1),
  worldId: z.string().trim().min(1),
  playbackType: ambiencePlaybackTypeSchema,
  semanticRole: z.string().trim().min(1),
  range: frameRangeSchema,
  description: z.string().trim().min(1),
  generationPrompt: z.string().trim().min(1),
  promptInfluence: z.number().min(0).max(1),
  loopPolicy: ambienceLoopPolicySchema.optional().nullable(),
}).superRefine((source, ctx) => {
  const promptViolation = findAmbiencePromptPolicyViolation(source.generationPrompt)
  if (promptViolation) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['generationPrompt'],
      message: `AUDIO_AMBIENCE_PROMPT_ACTION_SOUND_FORBIDDEN:${promptViolation}`,
    })
  }
  if (source.playbackType === 'seamless_loop' && !source.loopPolicy) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['loopPolicy'],
      message: 'AUDIO_AMBIENCE_LOOP_POLICY_REQUIRED',
    })
  }
  if (source.playbackType !== 'seamless_loop' && source.loopPolicy) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['loopPolicy'],
      message: 'AUDIO_AMBIENCE_LOOP_POLICY_NOT_ALLOWED',
    })
  }
})

export const SCORE_SCORING_STANCE_VALUES = [
  'detached_observer',
  'subjective_pressure',
  'empathetic_support',
  'procedural_control',
  'minimal_presence',
] as const
export const scoreScoringStanceSchema = z.enum(SCORE_SCORING_STANCE_VALUES)

export const scoreNarrativeDiagnosisSchema = z.object({
  surfaceEmotion: z.string().trim().min(1),
  trueScoringEmotion: z.string().trim().min(1),
  scoringStance: scoreScoringStanceSchema,
  avoidEmotions: z.array(z.string().trim().min(1)).min(1),
  musicShouldDo: z.string().trim().min(1),
  musicShouldNotDo: z.string().trim().min(1),
})

export const SCORE_DENSITY_VALUES = ['minimal', 'sparse', 'moderate', 'dense'] as const
export const SCORE_REGISTER_VALUES = ['sub', 'low', 'low_mid', 'mid', 'high_mid', 'high'] as const
export const SCORE_INSTRUMENT_VALUES = [
  'sub_bass_sine',
  'contrabass',
  'contrabassoon',
  'bass_clarinet',
  'low_brass',
  'prepared_piano',
  'felt_piano',
  'muted_string_ensemble',
  'string_harmonics',
  'solo_cello',
  'solo_viola',
  'filtered_analog_synthesizer',
  'granular_spectral_texture',
  'controlled_broadband_noise',
  'soft_mallets',
  'frame_drum',
] as const
export const SCORE_ORCHESTRATION_ROLE_VALUES = [
  'foundation',
  'mass',
  'motion',
  'partial',
  'resonance',
  'pulse',
] as const
export const scoreDensitySchema = z.enum(SCORE_DENSITY_VALUES)
export const scoreRegisterSchema = z.enum(SCORE_REGISTER_VALUES)
export const scoreInstrumentSchema = z.enum(SCORE_INSTRUMENT_VALUES)

export const SCORE_FORM_VALUES = ['through_composed', 'continuous_variation'] as const
export const SCORE_PITCH_CENTER_VALUES = ['tonal', 'modal', 'weakened_pitch_field', 'atonal'] as const
export const SCORE_PITCH_COLLECTION_VALUES = [
  'diatonic',
  'modal',
  'chromatic_saturation',
  'whole_tone_fragments',
  'octatonic_fragments',
  'evolving_pitch_class_sets',
] as const
export const SCORE_INTERVAL_RELATION_VALUES = [
  'minor_second_aggregation',
  'major_seventh_tension',
  'tritone_polarity',
  'quartal_structures',
  'quintal_structures',
  'sustained_common_tones',
] as const
export const SCORE_CADENCE_POLICY_VALUES = [
  'no_cadence',
  'withhold_tonic',
  'deceptive_only',
  'open_ending',
  'tonal_resolution',
] as const
export const SCORE_HARMONIC_RHYTHM_VALUES = ['static', 'extremely_slow', 'slow', 'moderate'] as const
export const SCORE_VOICE_LEADING_VALUES = [
  'incremental_micro_motion',
  'semitone_displacement',
  'sustained_common_tones',
  'contrary_motion_expansion',
  'gradual_intervallic_transformation',
] as const
export const SCORE_TEXTURE_VALUES = [
  'sound_mass',
  'micropolyphonic',
  'independent_sustained_layers',
  'sparse_counterpoint',
  'homophonic',
] as const
export const SCORE_METRIC_SALIENCE_VALUES = ['suppressed', 'low', 'moderate', 'explicit'] as const
export const SCORE_EVENT_SPACING_VALUES = ['regular', 'irregular', 'asynchronous', 'stochastic'] as const
export const SCORE_SPECTRAL_EVOLUTION_VALUES = [
  'static',
  'gradual_expansion',
  'gradual_contraction',
  'continuous_redistribution',
] as const
export const SCORE_DYNAMIC_ENVELOPE_VALUES = [
  'long_arc',
  'slow_oscillation',
  'restrained_plateau',
  'continuous_redistribution',
] as const
export const SCORE_TRANSIENT_POLICY_VALUES = ['suppressed', 'restrained', 'permitted'] as const
export const SCORE_TECHNIQUE_VALUES = [
  'sustained_tone',
  'sul_ponticello',
  'sul_tasto',
  'flautando',
  'harmonic_fingering',
  'bow_pressure_modulation',
  'col_legno_tratto',
  'air_noise',
  'multiphonics',
  'key_click_resonance',
  'sympathetic_resonance',
  'slow_glissando',
  'microtonal_deviation',
] as const
export const SCORE_PHASE_FUNCTION_VALUES = [
  'establish',
  'transform',
  'intensify',
  'deplete',
  'suspend',
] as const
export const SCORE_PROHIBITION_VALUES = [
  'vocals',
  'lyrics',
  'spoken_word',
  'literal_sound_effects',
  'environmental_recordings',
  'functional_dominant_tonic',
  'authentic_cadence',
  'heroic_brass',
  'triumphant_rhythm',
  'romantic_swell',
  'cathartic_climax',
  'trailer_impacts',
  'stable_groove',
  'periodic_phrase_cycle',
] as const

export const scoreTheoryPhaseSchema = z.object({
  phaseId: z.string().trim().min(1),
  range: frameRangeSchema,
  function: z.enum(SCORE_PHASE_FUNCTION_VALUES),
  energy: z.number().min(0).max(1),
  density: scoreDensitySchema,
  spectralBand: scoreRegisterSchema,
  transientDensity: z.number().min(0).max(1),
})

export const musicTheorySpecV2Schema = z.object({
  version: z.literal(2),
  bpm: z.number().int().positive().max(260),
  meter: z.enum(['2/4', '3/4', '4/4', '5/4', '6/8', '7/8']),
  form: z.enum(SCORE_FORM_VALUES),
  metricSalience: z.enum(SCORE_METRIC_SALIENCE_VALUES),
  eventSpacing: z.enum(SCORE_EVENT_SPACING_VALUES),
  pitch: z.object({
    centerType: z.enum(SCORE_PITCH_CENTER_VALUES),
    centerPitch: z.string().trim().regex(/^[A-G](?:#|b)?$/).optional().nullable(),
    collection: z.enum(SCORE_PITCH_COLLECTION_VALUES),
    intervalRelations: z.array(z.enum(SCORE_INTERVAL_RELATION_VALUES)).min(1),
    microtonality: z.enum(['none', 'limited', 'structural']),
  }),
  harmony: z.object({
    functionalSyntax: z.enum(['prohibited', 'limited', 'allowed']),
    cadencePolicy: z.enum(SCORE_CADENCE_POLICY_VALUES),
    harmonicRhythm: z.enum(SCORE_HARMONIC_RHYTHM_VALUES),
  }),
  voiceLeading: z.array(z.enum(SCORE_VOICE_LEADING_VALUES)).min(1),
  texture: z.object({
    organization: z.enum(SCORE_TEXTURE_VALUES),
    density: scoreDensitySchema,
    layerIndependence: z.number().min(0).max(1),
  }),
  spectrum: z.object({
    foundation: z.array(scoreRegisterSchema).min(1),
    upperActivity: z.enum(['absent', 'isolated_partials', 'restricted', 'active']),
    evolution: z.enum(SCORE_SPECTRAL_EVOLUTION_VALUES),
  }),
  orchestration: z.array(z.object({
    instrument: scoreInstrumentSchema,
    register: scoreRegisterSchema,
    role: z.enum(SCORE_ORCHESTRATION_ROLE_VALUES),
    techniques: z.array(z.enum(SCORE_TECHNIQUE_VALUES)).min(1),
  })).min(1).max(16),
  dynamics: z.object({
    envelope: z.enum(SCORE_DYNAMIC_ENVELOPE_VALUES),
    transientPolicy: z.enum(SCORE_TRANSIENT_POLICY_VALUES),
    minimumEnergy: z.number().min(0).max(1),
    maximumEnergy: z.number().min(0).max(1),
  }).superRefine((dynamics, ctx) => {
    if (dynamics.maximumEnergy < dynamics.minimumEnergy) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['maximumEnergy'],
        message: 'AUDIO_SCORE_DYNAMIC_RANGE_INVALID',
      })
    }
  }),
  phases: z.array(scoreTheoryPhaseSchema).min(1).max(12),
  prohibitions: z.array(z.enum(SCORE_PROHIBITION_VALUES)).min(1),
}).superRefine((spec, ctx) => {
  const requiredProhibitions = [
    'vocals',
    'lyrics',
    'spoken_word',
    'literal_sound_effects',
    'environmental_recordings',
  ] as const
  for (const prohibition of requiredProhibitions) {
    if (!spec.prohibitions.includes(prohibition)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['prohibitions'],
        message: `AUDIO_SCORE_REQUIRED_PROHIBITION_MISSING:${prohibition}`,
      })
    }
  }
  if (spec.pitch.centerType === 'atonal' && spec.pitch.centerPitch) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['pitch', 'centerPitch'],
      message: 'AUDIO_SCORE_ATONAL_CENTER_NOT_ALLOWED',
    })
  }
  if (spec.pitch.centerType !== 'atonal' && !spec.pitch.centerPitch) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['pitch', 'centerPitch'],
      message: 'AUDIO_SCORE_PITCH_CENTER_REQUIRED',
    })
  }
  if (spec.harmony.functionalSyntax === 'prohibited' && spec.harmony.cadencePolicy === 'tonal_resolution') {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['harmony', 'cadencePolicy'],
      message: 'AUDIO_SCORE_FUNCTIONAL_HARMONY_CONTRADICTION',
    })
  }
  spec.phases.forEach((phase, index) => {
    if (phase.energy < spec.dynamics.minimumEnergy || phase.energy > spec.dynamics.maximumEnergy) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['phases', index, 'energy'],
        message: 'AUDIO_SCORE_PHASE_ENERGY_OUTSIDE_DYNAMIC_RANGE',
      })
    }
  })
})

export const scoreCueSchema = z.object({
  cueId: z.string().trim().min(1),
  musicalContinuityId: z.string().trim().min(1),
  range: frameRangeSchema,
  narrativeDiagnosis: scoreNarrativeDiagnosisSchema,
  musicTheorySpec: musicTheorySpecV2Schema,
  intentionalSilenceRanges: z.array(frameRangeSchema),
}).superRefine((cue, ctx) => {
  const phases = cue.musicTheorySpec.phases
  if (phases[0]?.range.startFrame !== cue.range.startFrame
    || phases[phases.length - 1]?.range.endFrameExclusive !== cue.range.endFrameExclusive) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['musicTheorySpec', 'phases'],
      message: 'AUDIO_SCORE_PHASES_MUST_COVER_CUE',
    })
  }
  for (let index = 1; index < phases.length; index += 1) {
    if (phases[index - 1]?.range.endFrameExclusive !== phases[index]?.range.startFrame) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['musicTheorySpec', 'phases', index, 'range'],
        message: 'AUDIO_SCORE_PHASES_NOT_CONTIGUOUS',
      })
    }
  }
})

export const AUTOMATION_TARGET_BUS_VALUES = ['native', 'ambience', 'score', 'master'] as const
export const AUTOMATION_INTERPOLATION_VALUES = ['linear', 'smooth', 'equal_power'] as const
export const automationTargetBusSchema = z.enum(AUTOMATION_TARGET_BUS_VALUES)
// Perspective EQ, width, and reverb are derived from structured SoundWorld
// perspectives. Free-form automation is intentionally limited to gain so the
// planner cannot emit filter parameters the renderer interprets differently.
export const automationParameterSchema = z.literal('gain_db')
export const automationInterpolationSchema = z.enum(AUTOMATION_INTERPOLATION_VALUES)

export const automationKeyframeSchema = z.object({
  frame: z.number().int().min(0),
  value: z.number().finite(),
  interpolation: automationInterpolationSchema,
})

export const automationLaneSchema = z.object({
  laneId: z.string().trim().min(1),
  targetBus: automationTargetBusSchema,
  targetSourceId: z.string().trim().min(1).optional().nullable(),
  parameter: automationParameterSchema,
  keyframes: z.array(automationKeyframeSchema).min(2),
  postBehavior: z.enum(['hold', 'return_to_neutral']),
  reason: z.string().trim().min(1),
  sourceEventId: z.string().trim().min(1).optional().nullable(),
}).superRefine((lane, ctx) => {
  for (let index = 1; index < lane.keyframes.length; index += 1) {
    const previous = lane.keyframes[index - 1]
    const current = lane.keyframes[index]
    if (previous && current && current.frame <= previous.frame) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['keyframes', index, 'frame'],
        message: 'AUDIO_AUTOMATION_KEYFRAMES_NOT_STRICTLY_ASCENDING',
      })
    }
  }
})

export const audioStemRoleSchema = z.enum(['native_video', 'ambience', 'bgm'])
export const audioProductionStatusSchema = z.enum(['planned', 'generated', 'mixed'])
export const audioStemGenerationKindSchema = z.enum(['native_reference', 'ambience', 'music'])

export const audioStemPlanSchema = z.object({
  role: audioStemRoleSchema,
  status: audioProductionStatusSchema,
  provider: z.enum(['fal', 'elevenlabs']).nullable(),
  modelId: z.string().trim().min(1).nullable(),
  modelKey: z.string().trim().min(1).nullable(),
  generationKind: audioStemGenerationKindSchema,
  description: z.string().trim().min(1),
})

export const audioTimelineV2Schema = z.object({
  schemaVersion: z.literal(AUDIO_TIMELINE_SCHEMA_VERSION),
  timelineSignature: z.string().trim().min(1),
  clock: timelineClockSchema,
  nativeAudioPolicy: nativeAudioPolicySchema,
  clips: z.array(timelineClipAudioSchema).min(1),
  soundWorlds: z.array(soundWorldSchema),
  acousticTransitions: z.array(acousticTransitionSchema),
  nativeActionEvents: z.array(nativeActionEventSchema),
  ambienceSources: z.array(ambienceSourceSchema),
  scoreCues: z.array(scoreCueSchema).length(1),
  automationLanes: z.array(automationLaneSchema),
  stemPlan: z.array(audioStemPlanSchema).length(3),
}).superRefine((timeline, ctx) => {
  const checkRange = (path: Array<string | number>, range: FrameRange): void => {
    if (range.endFrameExclusive > timeline.clock.totalFrames) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path,
        message: 'AUDIO_TIMELINE_RANGE_OUT_OF_BOUNDS',
      })
    }
  }

  timeline.clips.forEach((clip, index) => checkRange(['clips', index, 'range'], clip.range))
  timeline.soundWorlds.forEach((world, index) => checkRange(['soundWorlds', index, 'range'], world.range))
  timeline.acousticTransitions.forEach((transition, index) => checkRange(['acousticTransitions', index, 'range'], transition.range))
  timeline.nativeActionEvents.forEach((event, index) => checkRange(['nativeActionEvents', index, 'range'], event.range))
  timeline.ambienceSources.forEach((source, index) => checkRange(['ambienceSources', index, 'range'], source.range))
  timeline.scoreCues.forEach((cue, index) => checkRange(['scoreCues', index, 'range'], cue.range))
  timeline.automationLanes.forEach((lane, laneIndex) => {
    lane.keyframes.forEach((keyframe, keyframeIndex) => {
      if (keyframe.frame >= timeline.clock.totalFrames) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['automationLanes', laneIndex, 'keyframes', keyframeIndex, 'frame'],
          message: 'AUDIO_AUTOMATION_KEYFRAME_OUT_OF_BOUNDS',
        })
      }
    })
  })
})

export const audioContinuityPlanSchema = z.object({
  schemaVersion: z.literal(AUDIO_TIMELINE_SCHEMA_VERSION),
  soundWorlds: z.array(soundWorldSchema),
  acousticTransitions: z.array(acousticTransitionSchema),
  ambienceSources: z.array(ambienceSourceSchema),
  scoreCues: z.array(scoreCueSchema).length(1),
  automationLanes: z.array(automationLaneSchema),
})

export type FrameRange = z.infer<typeof frameRangeSchema>
export type TimelineClock = z.infer<typeof timelineClockSchema>
export type TimelineClipAudio = z.infer<typeof timelineClipAudioSchema>
export type NativeAudioPolicy = z.infer<typeof nativeAudioPolicySchema>
export type AcousticPerspective = z.infer<typeof acousticPerspectiveSchema>
export type SoundWorld = z.infer<typeof soundWorldSchema>
export type AcousticTransition = z.infer<typeof acousticTransitionSchema>
export type NativeActionEvent = z.infer<typeof nativeActionEventSchema>
export type AmbiencePlaybackType = z.infer<typeof ambiencePlaybackTypeSchema>
export type AmbienceLoopPolicy = z.infer<typeof ambienceLoopPolicySchema>
export type AmbienceSource = z.infer<typeof ambienceSourceSchema>
export type ScoreScoringStance = z.infer<typeof scoreScoringStanceSchema>
export type ScoreNarrativeDiagnosis = z.infer<typeof scoreNarrativeDiagnosisSchema>
export type MusicTheorySpecV2 = z.infer<typeof musicTheorySpecV2Schema>
export type ScoreCue = z.infer<typeof scoreCueSchema>
export type AutomationLane = z.infer<typeof automationLaneSchema>
export type AudioStemRole = z.infer<typeof audioStemRoleSchema>
export type AudioStemPlan = z.infer<typeof audioStemPlanSchema>
export type AudioTimelineV2 = z.infer<typeof audioTimelineV2Schema>
export type AudioContinuityPlan = z.infer<typeof audioContinuityPlanSchema>

export const timelineAudioDesignSchema = audioTimelineV2Schema
export type TimelineAudioDesign = AudioTimelineV2

export function framesToSeconds(frame: number, clock: TimelineClock): number {
  if (!Number.isInteger(frame) || frame < 0) throw new Error('AUDIO_FRAME_INVALID')
  return (frame * clock.fpsDenominator) / clock.fpsNumerator
}

export function secondsToFrames(seconds: number, clock: Pick<TimelineClock, 'fpsNumerator' | 'fpsDenominator'>): number {
  if (!Number.isFinite(seconds) || seconds < 0) throw new Error('AUDIO_SECONDS_INVALID')
  return Math.round((seconds * clock.fpsNumerator) / clock.fpsDenominator)
}

export function frameToSample(frame: number, clock: TimelineClock): number {
  if (!Number.isInteger(frame) || frame < 0) throw new Error('AUDIO_FRAME_INVALID')
  return Math.round((frame * clock.fpsDenominator * clock.sampleRate) / clock.fpsNumerator)
}
