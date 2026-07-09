import { z } from 'zod'

export const SOUND_EFFECT_SCORE_STATUS = {
  PENDING: 'pending',
  GENERATING: 'generating',
  COMPLETED: 'completed',
  FAILED: 'failed',
} as const

export type SoundEffectScoreStatus = (typeof SOUND_EFFECT_SCORE_STATUS)[keyof typeof SOUND_EFFECT_SCORE_STATUS]

export const ELEVENLABS_SOUND_EFFECT_MODEL = 'eleven_text_to_sound_v2'

export const soundEffectCuePlanSchema = z.object({
  cueId: z.string().trim().min(1),
  index: z.number().int().min(1),
  startSeconds: z.number().min(0),
  durationSeconds: z.number().positive().max(30),
  label: z.string().trim().min(1),
  prompt: z.string().trim().min(8),
  sourceClipOrders: z.array(z.number().int().min(1)).min(1),
  shotIds: z.array(z.string().trim().min(1)),
  shotNumbers: z.array(z.number().int().min(1)),
})

export const soundEffectScorePlanSchema = z.object({
  durationSeconds: z.number().positive().max(600),
  cues: z.array(soundEffectCuePlanSchema).max(128),
}).superRefine((plan, ctx) => {
  plan.cues.forEach((cue, index) => {
    if (cue.startSeconds + cue.durationSeconds > plan.durationSeconds + 0.001) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['cues', index, 'durationSeconds'],
        message: 'SOUND_EFFECT_CUE_TIMING_OUT_OF_RANGE',
      })
    }
  })
})

export type SoundEffectCuePlan = z.infer<typeof soundEffectCuePlanSchema>
export type SoundEffectScorePlan = z.infer<typeof soundEffectScorePlanSchema>

export interface SoundEffectCueRender extends SoundEffectCuePlan {
  readonly mediaId: string
  readonly url: string
  readonly storageKey: string
  readonly mimeType: string
  readonly durationMs: number
}

export interface SoundEffectScoreProjectData {
  readonly schemaVersion: 1
  readonly status: SoundEffectScoreStatus
  readonly taskId: string
  readonly editScriptId: string
  readonly timelineSignature: string
  readonly durationSeconds: number
  readonly soundModel: string
  readonly plan?: SoundEffectScorePlan
  readonly cues?: readonly SoundEffectCueRender[]
  readonly errorMessage?: string | null
}
