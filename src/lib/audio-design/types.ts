import { z } from 'zod'

export const AUDIO_TIMELINE_SCHEMA_VERSION = 2 as const
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

export const acousticPerspectiveSchema = z.object({
  perspectiveId: z.string().trim().min(1),
  zoneId: z.string().trim().min(1),
  range: frameRangeSchema,
  enclosure: z.enum(['open', 'semi_open', 'enclosed']),
  distance: z.enum(['near', 'medium', 'far']),
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

export const acousticTransitionTypeSchema = z.enum([
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
])

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

export const ambiencePlaybackTypeSchema = z.enum([
  'seamless_loop',
  'ambient_event',
  'continuous_evolving',
])

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

export const scoreScoringStanceSchema = z.enum([
  'detached_observer',
  'subjective_pressure',
  'empathetic_support',
  'procedural_control',
  'minimal_presence',
])

export const scoreNarrativeDiagnosisSchema = z.object({
  surfaceEmotion: z.string().trim().min(1),
  trueScoringEmotion: z.string().trim().min(1),
  scoringStance: scoreScoringStanceSchema,
  avoidEmotions: z.array(z.string().trim().min(1)).min(1),
  musicShouldDo: z.string().trim().min(1),
  musicShouldNotDo: z.string().trim().min(1),
})

export const scoreStyleSchema = z.enum([
  'cinematic_underscore',
  'minimalist_underscore',
  'hybrid_cinematic',
  'ambient_cinematic',
  'orchestral_cinematic',
  'electronic_cinematic',
])

export const scoreMusicalEmotionSchema = z.enum([
  'restrained_tension',
  'cold_procedural_tension',
  'quiet_unease',
  'melancholic_reflection',
  'hopeful_resolve',
  'warm_intimacy',
  'urgent_momentum',
  'detached_observation',
  'mysterious_suspense',
  'solemn_gravity',
])

export const scoreHarmonicLanguageSchema = z.enum([
  'sparse_unresolved_minor',
  'modal_ambiguity',
  'slow_diatonic_motion',
  'open_fifths',
  'chromatic_suspension',
  'tonal_pedal',
  'gentle_consonance',
  'controlled_dissonance',
])

export const scoreDensitySchema = z.enum(['minimal', 'sparse', 'moderate', 'dense'])
export const scoreRegisterSchema = z.enum(['sub', 'low', 'low_mid', 'mid', 'high_mid', 'high'])
export const scoreInstrumentSchema = z.enum([
  'analog_synthesizer_pad',
  'muted_analog_synthesizer',
  'soft_sub_bass',
  'low_piano_resonance',
  'felt_piano',
  'prepared_piano',
  'bass_clarinet',
  'contrabassoon',
  'french_horn',
  'low_brass_ensemble',
  'restrained_string_ensemble',
  'solo_cello',
  'viola_texture',
  'glass_harmonica',
  'soft_mallet_percussion',
  'frame_drum',
  'electronic_pulse',
  'noise_texture',
  'wordless_synth_texture',
])

export const scoreArticulationSchema = z.enum([
  'sustained',
  'widely_spaced',
  'soft_attack',
  'slow_pulse',
  'restrained_staccato',
  'gentle_ostinato',
  'gradual_swell',
  'natural_decay',
])

export const scoreGenerationSectionSchema = z.object({
  sectionId: z.string().trim().min(1),
  range: frameRangeSchema,
  function: z.enum(['opening', 'development', 'transition', 'climax', 'release', 'closing']),
  energy: z.number().min(0).max(1),
  density: scoreDensitySchema,
  harmonicTension: z.number().min(0).max(1),
  instruments: z.array(scoreInstrumentSchema).min(1),
  articulations: z.array(scoreArticulationSchema).min(1),
})

export const scoreGenerationSpecSchema = z.object({
  bpm: z.number().int().positive().max(260),
  key: z.string().trim().regex(/^[A-G](?:#|b)? (?:major|minor)$/),
  meter: z.enum(['2/4', '3/4', '4/4', '5/4', '6/8', '7/8']),
  style: scoreStyleSchema,
  emotionalProfile: scoreMusicalEmotionSchema,
  harmonicLanguage: scoreHarmonicLanguageSchema,
  density: scoreDensitySchema,
  registers: z.array(scoreRegisterSchema).min(1),
  instruments: z.array(scoreInstrumentSchema).min(1),
  articulations: z.array(scoreArticulationSchema).min(1),
  sections: z.array(scoreGenerationSectionSchema).min(1),
})

export const scoreCueSchema = z.object({
  cueId: z.string().trim().min(1),
  musicalContinuityId: z.string().trim().min(1),
  range: frameRangeSchema,
  narrativeDiagnosis: scoreNarrativeDiagnosisSchema,
  generationSpec: scoreGenerationSpecSchema,
  intentionalSilenceRanges: z.array(frameRangeSchema),
})

export const automationTargetBusSchema = z.enum(['native', 'ambience', 'score', 'master'])
// Perspective EQ, width, and reverb are derived from structured SoundWorld
// perspectives. Free-form automation is intentionally limited to gain so the
// planner cannot emit filter parameters the renderer interprets differently.
export const automationParameterSchema = z.literal('gain_db')
export const automationInterpolationSchema = z.enum(['linear', 'smooth', 'equal_power'])

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
export type ScoreGenerationSpec = z.infer<typeof scoreGenerationSpecSchema>
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
