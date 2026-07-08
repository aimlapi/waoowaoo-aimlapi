import { z } from 'zod'

export const audioStemRoleSchema = z.enum([
  'dialogue',
  'foley',
  'spot_sfx',
  'ambience',
  'bgm',
  'native_video',
])

export const audioDuckingReasonSchema = z.enum([
  'dialogue',
  'critical_sfx',
  'native_video_sound',
])

export const audioProductionStatusSchema = z.enum([
  'planned',
  'generated',
  'mixed',
])

export const audioStemGenerationKindSchema = z.enum([
  'native_reference',
  'dialogue_tts',
  'foley',
  'spot_sfx',
  'ambience',
  'music',
])

export const dialogueCueSchema = z.object({
  cueId: z.string().trim().min(1),
  shotNumber: z.number().int().positive(),
  speaker: z.string().trim().min(1).optional().nullable(),
  text: z.string().trim().min(1),
  emotion: z.string().trim().min(1),
  delivery: z.string().trim().min(1),
  startSec: z.number().min(0).optional().nullable(),
  endSec: z.number().positive().optional().nullable(),
}).superRefine((cue, ctx) => {
  if (typeof cue.startSec === 'number' && typeof cue.endSec === 'number' && cue.endSec <= cue.startSec) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['endSec'],
      message: 'AUDIO_DESIGN_DIALOGUE_TIME_RANGE_INVALID',
    })
  }
})

export const spotSfxCueSchema = z.object({
  cueId: z.string().trim().min(1),
  shotNumber: z.number().int().positive(),
  label: z.string().trim().min(1),
  description: z.string().trim().min(1),
  priority: z.enum(['story', 'critical']),
  startSec: z.number().min(0).optional().nullable(),
  durationSec: z.number().positive().optional().nullable(),
})

export const ambienceCueSchema = z.object({
  cueId: z.string().trim().min(1),
  shotNumbers: z.array(z.number().int().positive()).min(1),
  description: z.string().trim().min(1),
  startSec: z.number().min(0),
  endSec: z.number().positive(),
}).superRefine((cue, ctx) => {
  if (cue.endSec <= cue.startSec) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['endSec'],
      message: 'AUDIO_DESIGN_AMBIENCE_TIME_RANGE_INVALID',
    })
  }
})

export const duckingSegmentSchema = z.object({
  startSec: z.number().min(0),
  endSec: z.number().positive(),
  bgmVolume: z.number().min(0).max(1),
  reason: audioDuckingReasonSchema,
  sourceId: z.string().trim().min(1),
}).superRefine((segment, ctx) => {
  if (segment.endSec <= segment.startSec) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['endSec'],
      message: 'AUDIO_DESIGN_DUCKING_TIME_RANGE_INVALID',
    })
  }
})

export const audioStemPlanSchema = z.object({
  role: audioStemRoleSchema,
  status: audioProductionStatusSchema,
  provider: z.literal('fal').nullable(),
  modelId: z.string().trim().min(1).nullable(),
  modelKey: z.string().trim().min(1).nullable(),
  generationKind: audioStemGenerationKindSchema,
  description: z.string().trim().min(1),
})

export const timelineClipAudioSchema = z.object({
  order: z.number().int().positive(),
  sourceKind: z.enum(['panel', 'videoGroup']),
  panelId: z.string().trim().min(1),
  groupId: z.string().trim().min(1).optional().nullable(),
  shotNumber: z.number().int().positive().optional().nullable(),
  shotNumbers: z.array(z.number().int().positive()),
  startSec: z.number().min(0),
  endSec: z.number().positive(),
  soundDirection: z.string().trim().min(1).optional().nullable(),
}).superRefine((clip, ctx) => {
  if (clip.endSec <= clip.startSec) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['endSec'],
      message: 'AUDIO_DESIGN_CLIP_TIME_RANGE_INVALID',
    })
  }
})

export const timelineAudioDesignSchema = z.object({
  schemaVersion: z.literal(1),
  timelineSignature: z.string().trim().min(1),
  durationSeconds: z.number().positive().max(600),
  clips: z.array(timelineClipAudioSchema),
  stemPlan: z.array(audioStemPlanSchema).min(1),
  dialogueCues: z.array(dialogueCueSchema),
  spotSfxPlan: z.array(spotSfxCueSchema),
  ambiencePlan: z.array(ambienceCueSchema),
  duckingProfile: z.array(duckingSegmentSchema),
})

export const shotAudioPlanSchema = z.object({
  shotNumber: z.number().int().positive(),
  dialogueCueIds: z.array(z.string().trim().min(1)),
  ambience: z.array(ambienceCueSchema),
  criticalSfx: z.array(spotSfxCueSchema),
  nativeVideoSoundPrompt: z.string().trim().min(1),
})

export const scriptAudioDesignSchema = z.object({
  voiceBible: z.array(z.object({
    characterName: z.string().trim().min(1),
    voiceTraits: z.string().trim().min(1),
    speakingPace: z.string().trim().min(1),
    emotionalRange: z.string().trim().min(1),
    constraints: z.array(z.string().trim().min(1)),
  })),
  dialogueLayer: z.array(dialogueCueSchema),
})

export const audioDesignStateSchema = z.object({
  schemaVersion: z.literal(1),
  scriptAudio: scriptAudioDesignSchema.optional(),
  shotAudioPlans: z.array(shotAudioPlanSchema),
  timelineAudio: timelineAudioDesignSchema.optional(),
})

export type AudioStemRole = z.infer<typeof audioStemRoleSchema>
export type AudioDuckingReason = z.infer<typeof audioDuckingReasonSchema>
export type AudioProductionStatus = z.infer<typeof audioProductionStatusSchema>
export type AudioStemGenerationKind = z.infer<typeof audioStemGenerationKindSchema>
export type DialogueCue = z.infer<typeof dialogueCueSchema>
export type SpotSfxCue = z.infer<typeof spotSfxCueSchema>
export type AmbienceCue = z.infer<typeof ambienceCueSchema>
export type DuckingSegment = z.infer<typeof duckingSegmentSchema>
export type AudioStemPlan = z.infer<typeof audioStemPlanSchema>
export type TimelineClipAudio = z.infer<typeof timelineClipAudioSchema>
export type TimelineAudioDesign = z.infer<typeof timelineAudioDesignSchema>
export type ShotAudioPlan = z.infer<typeof shotAudioPlanSchema>
export type ScriptAudioDesign = z.infer<typeof scriptAudioDesignSchema>
export type AudioDesignState = z.infer<typeof audioDesignStateSchema>
