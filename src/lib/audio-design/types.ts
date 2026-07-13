import { z } from 'zod'
import { findAmbiencePromptPolicyViolation } from './ambience-prompt-policy'
import { scoreCueSchema } from './score-contract'
import {
  AUDIO_TIMELINE_SCHEMA_VERSION,
  frameRangeSchema,
  timelineClockSchema,
  type FrameRange,
} from './timeline-clock'

export * from './score-contract'
export * from './timeline-clock'

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
export const AMBIENCE_ROLE_VALUES = ['bed', 'detail', 'ambient_event'] as const
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
  role: z.enum(AMBIENCE_ROLE_VALUES),
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
  if (source.role === 'ambient_event' && source.playbackType !== 'ambient_event') {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['playbackType'],
      message: 'AUDIO_AMBIENCE_EVENT_PLAYBACK_TYPE_REQUIRED',
    })
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

interface AudioContinuityCore {
  readonly soundWorlds: readonly z.infer<typeof soundWorldSchema>[]
  readonly acousticTransitions: readonly z.infer<typeof acousticTransitionSchema>[]
  readonly ambienceSources: readonly z.infer<typeof ambienceSourceSchema>[]
  readonly automationLanes: readonly z.infer<typeof automationLaneSchema>[]
}

function validateAudioContinuityRelationships(
  plan: AudioContinuityCore,
  ctx: z.RefinementCtx,
): void {
  const worldById = new Map(plan.soundWorlds.map((world) => [world.worldId, world]))
  const sourceByContinuityId = new Map<string, Array<z.infer<typeof ambienceSourceSchema>>>()
  for (const source of plan.ambienceSources) {
    const group = sourceByContinuityId.get(source.sourceContinuityId) ?? []
    group.push(source)
    sourceByContinuityId.set(source.sourceContinuityId, group)
    const world = worldById.get(source.worldId)
    if (!world) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['ambienceSources'],
        message: `AUDIO_AMBIENCE_WORLD_MISSING:${source.sourceId}:${source.worldId}`,
      })
      continue
    }
    if (!world.persistentSourceIds.includes(source.sourceContinuityId) && source.role !== 'ambient_event') {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['ambienceSources'],
        message: `AUDIO_AMBIENCE_PERSISTENT_SOURCE_UNDECLARED:${source.sourceId}`,
      })
    }
    if (
      source.role === 'bed'
      && (source.range.startFrame > world.range.startFrame || source.range.endFrameExclusive < world.range.endFrameExclusive)
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['ambienceSources'],
        message: `AUDIO_AMBIENCE_BED_WORLD_COVERAGE_REQUIRED:${source.sourceId}`,
      })
    }
  }
  for (const world of plan.soundWorlds) {
    const hasBed = plan.ambienceSources.some((source) => source.worldId === world.worldId && source.role === 'bed')
    if (!hasBed) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['soundWorlds'],
        message: `AUDIO_SOUND_WORLD_BED_REQUIRED:${world.worldId}`,
      })
    }
  }
  const transitionIds = new Set(plan.acousticTransitions.map((transition) => transition.transitionId))
  for (const transition of plan.acousticTransitions) {
    const sources = sourceByContinuityId.get(transition.sourceContinuityId) ?? []
    if (sources.length !== 1) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['acousticTransitions'],
        message: `AUDIO_TRANSITION_SOURCE_IDENTITY_REQUIRED:${transition.transitionId}`,
      })
      continue
    }
    const source = sources[0]
    if (!source) continue
    if (
      source.range.startFrame > transition.range.startFrame
      || source.range.endFrameExclusive < transition.range.endFrameExclusive
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['acousticTransitions'],
        message: `AUDIO_TRANSITION_SOURCE_COVERAGE_REQUIRED:${transition.transitionId}`,
      })
    }
    const world = worldById.get(source.worldId)
    const zones = new Set(world?.perspectives.map((perspective) => perspective.zoneId) ?? [])
    if (!zones.has(transition.fromZoneId) || !zones.has(transition.toZoneId)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['acousticTransitions'],
        message: `AUDIO_TRANSITION_ZONE_COVERAGE_REQUIRED:${transition.transitionId}`,
      })
    }
  }
  for (const lane of plan.automationLanes) {
    if (lane.targetBus === 'ambience' && lane.sourceEventId && transitionIds.has(lane.sourceEventId)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['automationLanes'],
        message: `AUDIO_TRANSITION_DUPLICATE_GAIN_AUTOMATION:${lane.laneId}`,
      })
    }
  }
}

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
  validateAudioContinuityRelationships(timeline, ctx)
})

export const audioContinuityPlanSchema = z.object({
  schemaVersion: z.literal(AUDIO_TIMELINE_SCHEMA_VERSION),
  soundWorlds: z.array(soundWorldSchema),
  acousticTransitions: z.array(acousticTransitionSchema),
  ambienceSources: z.array(ambienceSourceSchema),
  scoreCues: z.array(scoreCueSchema).length(1),
  automationLanes: z.array(automationLaneSchema),
}).superRefine((plan, ctx) => {
  validateAudioContinuityRelationships(plan, ctx)
})

export type TimelineClipAudio = z.infer<typeof timelineClipAudioSchema>
export type NativeAudioPolicy = z.infer<typeof nativeAudioPolicySchema>
export type AcousticPerspective = z.infer<typeof acousticPerspectiveSchema>
export type SoundWorld = z.infer<typeof soundWorldSchema>
export type AcousticTransition = z.infer<typeof acousticTransitionSchema>
export type NativeActionEvent = z.infer<typeof nativeActionEventSchema>
export type AmbiencePlaybackType = z.infer<typeof ambiencePlaybackTypeSchema>
export type AmbienceLoopPolicy = z.infer<typeof ambienceLoopPolicySchema>
export type AmbienceSource = z.infer<typeof ambienceSourceSchema>
export type AutomationLane = z.infer<typeof automationLaneSchema>
export type AudioStemRole = z.infer<typeof audioStemRoleSchema>
export type AudioStemPlan = z.infer<typeof audioStemPlanSchema>
export type AudioTimelineV2 = z.infer<typeof audioTimelineV2Schema>
export type AudioContinuityPlan = z.infer<typeof audioContinuityPlanSchema>

export const timelineAudioDesignSchema = audioTimelineV2Schema
export type TimelineAudioDesign = AudioTimelineV2
