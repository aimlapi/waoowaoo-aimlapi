import { z } from 'zod'
import {
  frameRangeSchema,
  timelineAudioDesignSchema,
  type TimelineAudioDesign,
} from '@/lib/audio-design/types'
import { videoVisualAnalysisSchema, type VideoVisualAnalysis } from '@/lib/audio-design/video-visual-types'

export const BGM_SCORE_STATUS = {
  PENDING: 'pending',
  GENERATING: 'generating',
  COMPLETED: 'completed',
  FAILED: 'failed',
} as const

export type BgmScoreStatus = (typeof BGM_SCORE_STATUS)[keyof typeof BGM_SCORE_STATUS]

const optionalTimedSectionFields = {
  startSec: z.number().min(0).optional().nullable(),
  endSec: z.number().positive().optional().nullable(),
} as const

function validateOptionalTimeRange(
  value: { readonly startSec?: number | null; readonly endSec?: number | null },
  ctx: z.RefinementCtx,
): void {
  if (typeof value.startSec === 'number' && typeof value.endSec === 'number' && value.endSec <= value.startSec) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['endSec'],
      message: 'BGM_SCORE_DESIGN_SECTION_INVALID_TIME_RANGE',
    })
  }
}

export const bgmScoreDesignSectionSchema = z.object({
  category: z.string().trim().min(1),
  title: z.string().trim().min(1),
  purpose: z.string().trim().min(1).optional().nullable(),
  ...optionalTimedSectionFields,
  content: z.string().trim().min(1),
}).superRefine(validateOptionalTimeRange)

export const bgmScorePromptSectionSchema = z.object({
  title: z.string().trim().min(1),
  purpose: z.string().trim().min(1).optional().nullable(),
  ...optionalTimedSectionFields,
  content: z.string().trim().min(1),
}).superRefine(validateOptionalTimeRange)

export const bgmScoreVirtualLayerSchema = z.object({
  name: z.string().trim().min(1),
  purpose: z.string().trim().min(1),
  content: z.string().trim().min(1),
})

export const bgmScorePlanSchema = z.object({
  durationSeconds: z.number().positive().max(600),
  creativeBrief: z.object({
    cueType: z.string().trim().min(1),
    genre: z.string().trim().min(1),
    mood: z.string().trim().min(1),
    narrativeFunction: z.string().trim().min(1),
  }),
  scoreDesign: z.object({
    overview: z.string().trim().min(1),
    sections: z.array(bgmScoreDesignSectionSchema).min(1).max(48),
  }),
  virtualLayers: z.array(bgmScoreVirtualLayerSchema).min(1).max(16),
  promptSections: z.array(bgmScorePromptSectionSchema).min(1).max(32),
  finalPrompt: z.string().trim().min(80),
  negativePrompt: z.string().trim().min(1).optional().nullable(),
}).superRefine((plan, ctx) => {
  const checkTimedSection = (
    path: Array<string | number>,
    startSec: number | null | undefined,
    endSec: number | null | undefined,
  ) => {
    if (typeof startSec === 'number' && startSec > plan.durationSeconds + 0.001) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path,
        message: 'BGM_SCORE_DESIGN_TIMING_OUT_OF_RANGE',
      })
    }
    if (typeof endSec === 'number' && endSec > plan.durationSeconds + 0.001) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path,
        message: 'BGM_SCORE_DESIGN_TIMING_OUT_OF_RANGE',
      })
    }
  }

  plan.scoreDesign.sections.forEach((section, index) => {
    checkTimedSection(['scoreDesign', 'sections', index, 'endSec'], section.startSec, section.endSec)
  })
  plan.promptSections.forEach((section, index) => {
    checkTimedSection(['promptSections', index, 'endSec'], section.startSec, section.endSec)
  })
})

export type BgmScorePlan = z.infer<typeof bgmScorePlanSchema>
export type BgmScoreDesignSection = z.infer<typeof bgmScoreDesignSectionSchema>
export type BgmScorePromptSection = z.infer<typeof bgmScorePromptSectionSchema>
export type BgmScoreVirtualLayer = z.infer<typeof bgmScoreVirtualLayerSchema>

export interface BgmScoreMix {
  readonly mediaId: string
  readonly url: string
  readonly storageKey: string
  readonly mimeType: string
  readonly durationMs: number
}

export const ambienceAssetSchema = z.object({
  sourceId: z.string().trim().min(1),
  candidateIndex: z.number().int().min(0).max(1),
  selected: z.boolean(),
  mediaId: z.string().trim().min(1),
  url: z.string().trim().min(1),
  storageKey: z.string().trim().min(1),
  mimeType: z.string().trim().min(1),
  durationMs: z.number().positive(),
  range: frameRangeSchema,
  loop: z.boolean(),
  crossfadeFrames: z.number().int().min(0),
  phaseOffsetFrames: z.number().int().min(0),
  boundaryScore: z.number().min(0),
})

export type AmbienceAsset = z.infer<typeof ambienceAssetSchema>

export interface BgmScoreProjectData {
  readonly schemaVersion: 4
  readonly status: BgmScoreStatus
  readonly taskId: string
  readonly analysisMode: 'video_only' | 'script_assisted'
  readonly editScriptId: string | null
  readonly timelineSignature: string
  readonly durationSeconds: number
  readonly musicModel: string
  readonly timelineAudio?: TimelineAudioDesign
  readonly plan?: BgmScorePlan
  readonly mix?: BgmScoreMix
  readonly ambienceAssets?: readonly AmbienceAsset[]
  readonly visualAnalysis?: VideoVisualAnalysis
  readonly stage?: string
  readonly errorMessage?: string | null
}

export const bgmScoreProjectDataSchema = z.object({
  schemaVersion: z.literal(4),
  status: z.enum([
    BGM_SCORE_STATUS.PENDING,
    BGM_SCORE_STATUS.GENERATING,
    BGM_SCORE_STATUS.COMPLETED,
    BGM_SCORE_STATUS.FAILED,
  ]),
  taskId: z.string().trim().min(1),
  analysisMode: z.enum(['video_only', 'script_assisted']),
  editScriptId: z.string().trim().min(1).nullable(),
  timelineSignature: z.string().trim().min(1),
  durationSeconds: z.number().positive(),
  musicModel: z.string().trim().min(1),
  timelineAudio: timelineAudioDesignSchema.optional(),
  plan: bgmScorePlanSchema.optional(),
  mix: z.object({
    mediaId: z.string().trim().min(1),
    url: z.string().trim().min(1),
    storageKey: z.string().trim().min(1),
    mimeType: z.string().trim().min(1),
    durationMs: z.number().positive(),
  }).optional(),
  ambienceAssets: z.array(ambienceAssetSchema).optional(),
  visualAnalysis: videoVisualAnalysisSchema.optional(),
  stage: z.string().trim().min(1).optional(),
  errorMessage: z.string().optional().nullable(),
})
