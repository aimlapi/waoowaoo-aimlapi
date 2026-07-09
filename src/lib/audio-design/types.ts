import { z } from 'zod'

export const audioStemRoleSchema = z.enum([
  'dialogue',
  'foley',
  'spot_sfx',
  'ambience',
  'bgm',
  'native_video',
])

export const nativeDialogueSourceProviderSchema = z.enum([
  'seedance_2_0',
  'video_model_native',
])

export const nativeDialogueSourceSchema = z.object({
  mode: z.literal('native_video_dialogue'),
  provider: nativeDialogueSourceProviderSchema,
  policy: z.literal('keep_for_dialogue_and_lip_sync'),
  description: z.string().trim().min(1),
})

export const visualActionSoundLayerSchema = z.enum([
  'foley',
  'spot_sfx',
])

export const visualActionEventSchema = z.object({
  id: z.string().trim().min(1),
  soundLayer: visualActionSoundLayerSchema,
  visualAnchor: z.string().trim().min(1),
  shotNumber: z.number().int().positive().optional().nullable(),
  startSec: z.number().min(0),
  impactSec: z.number().min(0),
  endSec: z.number().positive(),
  syncToleranceFrames: z.number().int().positive().max(12),
  confidence: z.number().min(0).max(1),
  description: z.string().trim().min(1),
}).superRefine((event, ctx) => {
  if (event.impactSec < event.startSec || event.impactSec > event.endSec) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['impactSec'],
      message: 'VISUAL_ACTION_EVENT_IMPACT_OUT_OF_RANGE',
    })
  }
  if (event.endSec <= event.startSec) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['endSec'],
      message: 'VISUAL_ACTION_EVENT_TIME_RANGE_INVALID',
    })
  }
})

export const visualActionTimelineSchema = z.object({
  schemaVersion: z.literal(1),
  sourceKind: z.literal('video_action_timeline'),
  targetDurationSeconds: z.number().positive().max(600),
  frameRate: z.number().positive().max(240),
  timingAuthority: z.literal('video_locked_visual_action'),
  actionEvents: z.array(visualActionEventSchema),
}).superRefine((timeline, ctx) => {
  timeline.actionEvents.forEach((event, index) => {
    if (event.endSec > timeline.targetDurationSeconds + 0.001) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['actionEvents', index, 'endSec'],
        message: 'VISUAL_ACTION_TIMELINE_EVENT_OUT_OF_RANGE',
      })
    }
  })
})

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

export const foleyCueSchema = z.object({
  cueId: z.string().trim().min(1),
  beatNumber: z.number().int().positive(),
  label: z.string().trim().min(1),
  description: z.string().trim().min(1),
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

export const soundMixDialogueStrategySchema = z.object({
  action: z.enum(['keep_native', 'enhance', 'mute']),
  duckingTrigger: z.boolean(),
})

export const scoreLayerRoleSchema = z.enum([
  'tension_bed',
  'rhythmic',
  'theme',
  'accent',
  'atmospheric_pad',
  'sub_bed',
  'low_mid_body',
  'mid_pulse',
  'high_air',
  'perc_impacts',
  'motif_texture',
  'transition_riser',
])

export const scoreFrequencyBandSchema = z.enum([
  'sub',
  'low',
  'low_mid',
  'mid',
  'high_mid',
  'high',
  'full_range',
])

export const scoreStackRoleSchema = z.enum([
  'foundation',
  'body',
  'motion',
  'emotion',
  'clarity',
  'impact',
  'transition',
])

export const scoreScoringStanceSchema = z.enum([
  'detached_observer',
  'subjective_pressure',
  'empathetic_support',
  'procedural_control',
  'minimal_presence',
])

export const scoreEmotionDiagnosisSchema = z.object({
  surfaceEmotion: z.string().trim().min(1),
  trueScoringEmotion: z.string().trim().min(1),
  scoringStance: scoreScoringStanceSchema,
  avoidEmotions: z.array(z.string().trim().min(1)).min(1),
  musicShouldDo: z.string().trim().min(1),
  musicShouldNotDo: z.string().trim().min(1),
})

export const scoreSilenceWindowSchema = z.object({
  startSec: z.number().min(0),
  endSec: z.number().positive(),
  reason: z.string().trim().min(1),
}).superRefine((window, ctx) => {
  if (window.endSec <= window.startSec) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['endSec'],
      message: 'SCORE_SILENCE_WINDOW_TIME_RANGE_INVALID',
    })
  }
})

export const scoreDuckingWindowSchema = z.object({
  startSec: z.number().min(0),
  endSec: z.number().positive(),
  scoreVolume: z.number().min(0).max(1),
  muteFrequencyBands: z.array(scoreFrequencyBandSchema),
  reason: z.string().trim().min(1),
}).superRefine((window, ctx) => {
  if (window.endSec <= window.startSec) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['endSec'],
      message: 'SCORE_DUCKING_WINDOW_TIME_RANGE_INVALID',
    })
  }
})

export const forbiddenScoreTimbreWindowSchema = z.object({
  timbre: z.string().trim().min(1),
  startSec: z.number().min(0),
  endSec: z.number().positive(),
  reason: z.string().trim().min(1),
}).superRefine((window, ctx) => {
  if (window.endSec <= window.startSec) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['endSec'],
      message: 'FORBIDDEN_SCORE_TIMBRE_WINDOW_TIME_RANGE_INVALID',
    })
  }
})

export const scoreMixStrategySchema = z.object({
  generationMode: z.literal('single_cue_or_sparse_layers_with_mix_automation'),
  priorityPolicy: z.literal('dialogue_then_spot_sfx_then_foley_then_ambience_then_score'),
  defaultScoreVolume: z.number().min(0).max(1),
  maxSimultaneousScoreLayers: z.number().int().positive().max(4),
  musicSilenceWindows: z.array(scoreSilenceWindowSchema),
  sfxDuckingWindows: z.array(scoreDuckingWindowSchema),
  forbiddenTimbresNearSfx: z.array(forbiddenScoreTimbreWindowSchema),
})

export const scoreLayerSchema = z.object({
  id: z.string().trim().min(1),
  role: scoreLayerRoleSchema,
  frequencyBand: scoreFrequencyBandSchema,
  stackRole: scoreStackRoleSchema,
  instrument: z.string().trim().min(1),
  startSec: z.number().min(0),
  endSec: z.number().positive(),
  duckingRequired: z.boolean(),
  dynamicCurve: z.string().trim().min(1),
  densityCurve: z.string().trim().min(1),
  mixPriority: z.number().int().min(1).max(10),
  description: z.string().trim().min(1),
}).superRefine((layer, ctx) => {
  if (layer.endSec <= layer.startSec) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['endSec'],
      message: 'SOUND_MIX_SCORE_LAYER_TIME_RANGE_INVALID',
    })
  }
})

export const soundMixFoleyLayerSchema = z.object({
  id: z.string().trim().min(1),
  type: z.string().trim().min(1),
  timestamps: z.array(z.number().min(0)).min(1),
  material: z.string().trim().min(1),
  description: z.string().trim().min(1).optional(),
})

export const soundMixSpotSfxLayerSchema = z.object({
  id: z.string().trim().min(1),
  effectName: z.string().trim().min(1),
  startSec: z.number().min(0),
  durationSec: z.number().positive(),
  priority: z.enum(['high', 'critical']),
  material: z.string().trim().min(1).optional(),
  description: z.string().trim().min(1),
})

export const soundMixAmbienceLayerSchema = z.object({
  id: z.string().trim().min(1),
  space: z.string().trim().min(1),
  layers: z.array(z.string().trim().min(1)).min(1),
  startSec: z.number().min(0),
  endSec: z.number().positive(),
  description: z.string().trim().min(1).optional(),
}).superRefine((layer, ctx) => {
  if (layer.endSec <= layer.startSec) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['endSec'],
      message: 'SOUND_MIX_AMBIENCE_LAYER_TIME_RANGE_INVALID',
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
  provider: z.enum(['fal', 'elevenlabs']).nullable(),
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
  nativeDialogueSource: nativeDialogueSourceSchema,
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

export const scriptSoundAnalysisSchema = z.object({
  schemaVersion: z.literal(1),
  sourceKind: z.enum(['script', 'sound_description']),
  targetDurationSeconds: z.number().positive().max(600),
  summary: z.string().trim().min(1),
  emotionalArc: z.string().trim().min(1),
  soundEffectTimingPolicy: z.object({
    foleySpotTimingSource: z.literal('visual_action_timeline_required'),
    scriptTimingAllowed: z.literal(false),
    syncToleranceFrames: z.number().int().positive().max(12),
  }),
  scoreEmotionDiagnosis: scoreEmotionDiagnosisSchema,
  scoreMixStrategy: scoreMixStrategySchema,
  projectMetadata: z.object({
    bpm: z.number().int().positive().max(260),
    key: z.string().trim().min(1),
    overallMood: z.string().trim().min(1),
  }),
  dialogueStrategy: soundMixDialogueStrategySchema,
  scoreLayers: z.array(scoreLayerSchema),
  foleyLayers: z.array(soundMixFoleyLayerSchema),
  spotSfxLayers: z.array(soundMixSpotSfxLayerSchema),
  ambienceLayers: z.array(soundMixAmbienceLayerSchema),
}).superRefine((analysis, ctx) => {
  const checkEnd = (path: Array<string | number>, endSec: number) => {
    if (endSec > analysis.targetDurationSeconds + 0.001) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path,
        message: 'SCRIPT_SOUND_ANALYSIS_TIMING_OUT_OF_RANGE',
      })
    }
  }

  analysis.scoreLayers.forEach((layer, index) => checkEnd(['scoreLayers', index, 'endSec'], layer.endSec))
  analysis.scoreMixStrategy.musicSilenceWindows.forEach((window, index) => checkEnd(['scoreMixStrategy', 'musicSilenceWindows', index, 'endSec'], window.endSec))
  analysis.scoreMixStrategy.sfxDuckingWindows.forEach((window, index) => checkEnd(['scoreMixStrategy', 'sfxDuckingWindows', index, 'endSec'], window.endSec))
  analysis.scoreMixStrategy.forbiddenTimbresNearSfx.forEach((window, index) => checkEnd(['scoreMixStrategy', 'forbiddenTimbresNearSfx', index, 'endSec'], window.endSec))
  analysis.foleyLayers.forEach((layer, index) => {
    layer.timestamps.forEach((timestamp, timestampIndex) => {
      checkEnd(['foleyLayers', index, 'timestamps', timestampIndex], timestamp)
    })
  })
  analysis.spotSfxLayers.forEach((layer, index) => {
    checkEnd(['spotSfxLayers', index, 'durationSec'], layer.startSec + layer.durationSec)
  })
  analysis.ambienceLayers.forEach((layer, index) => checkEnd(['ambienceLayers', index, 'endSec'], layer.endSec))
})

export const audioDesignStateSchema = z.object({
  schemaVersion: z.literal(1),
  scriptAudio: scriptAudioDesignSchema.optional(),
  scriptSoundAnalysis: scriptSoundAnalysisSchema.optional(),
  shotAudioPlans: z.array(shotAudioPlanSchema),
  timelineAudio: timelineAudioDesignSchema.optional(),
})

export type AudioStemRole = z.infer<typeof audioStemRoleSchema>
export type NativeDialogueSourceProvider = z.infer<typeof nativeDialogueSourceProviderSchema>
export type NativeDialogueSource = z.infer<typeof nativeDialogueSourceSchema>
export type VisualActionSoundLayer = z.infer<typeof visualActionSoundLayerSchema>
export type VisualActionEvent = z.infer<typeof visualActionEventSchema>
export type VisualActionTimeline = z.infer<typeof visualActionTimelineSchema>
export type AudioDuckingReason = z.infer<typeof audioDuckingReasonSchema>
export type AudioProductionStatus = z.infer<typeof audioProductionStatusSchema>
export type AudioStemGenerationKind = z.infer<typeof audioStemGenerationKindSchema>
export type DialogueCue = z.infer<typeof dialogueCueSchema>
export type SpotSfxCue = z.infer<typeof spotSfxCueSchema>
export type FoleyCue = z.infer<typeof foleyCueSchema>
export type AmbienceCue = z.infer<typeof ambienceCueSchema>
export type SoundMixDialogueStrategy = z.infer<typeof soundMixDialogueStrategySchema>
export type ScoreLayerRole = z.infer<typeof scoreLayerRoleSchema>
export type ScoreFrequencyBand = z.infer<typeof scoreFrequencyBandSchema>
export type ScoreStackRole = z.infer<typeof scoreStackRoleSchema>
export type ScoreScoringStance = z.infer<typeof scoreScoringStanceSchema>
export type ScoreEmotionDiagnosis = z.infer<typeof scoreEmotionDiagnosisSchema>
export type ScoreSilenceWindow = z.infer<typeof scoreSilenceWindowSchema>
export type ScoreDuckingWindow = z.infer<typeof scoreDuckingWindowSchema>
export type ForbiddenScoreTimbreWindow = z.infer<typeof forbiddenScoreTimbreWindowSchema>
export type ScoreMixStrategy = z.infer<typeof scoreMixStrategySchema>
export type ScoreLayer = z.infer<typeof scoreLayerSchema>
export type SoundMixFoleyLayer = z.infer<typeof soundMixFoleyLayerSchema>
export type SoundMixSpotSfxLayer = z.infer<typeof soundMixSpotSfxLayerSchema>
export type SoundMixAmbienceLayer = z.infer<typeof soundMixAmbienceLayerSchema>
export type DuckingSegment = z.infer<typeof duckingSegmentSchema>
export type AudioStemPlan = z.infer<typeof audioStemPlanSchema>
export type TimelineClipAudio = z.infer<typeof timelineClipAudioSchema>
export type TimelineAudioDesign = z.infer<typeof timelineAudioDesignSchema>
export type ShotAudioPlan = z.infer<typeof shotAudioPlanSchema>
export type ScriptAudioDesign = z.infer<typeof scriptAudioDesignSchema>
export type ScriptSoundAnalysis = z.infer<typeof scriptSoundAnalysisSchema>
export type AudioDesignState = z.infer<typeof audioDesignStateSchema>
