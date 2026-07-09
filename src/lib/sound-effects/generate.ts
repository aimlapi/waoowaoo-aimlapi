import type { Job } from 'bullmq'
import { Prisma } from '@prisma/client'
import { z } from 'zod'
import { executeAiStructuredTextStep } from '@/lib/ai-exec/structured-step'
import { generateElevenLabsSoundEffect } from '@/lib/ai-providers/elevenlabs/sound-effects'
import { getProjectModelConfig } from '@/lib/config-service'
import { withInternalLLMStreamCallbacks } from '@/lib/llm-observe/internal-stream-context'
import { ensureMediaObjectFromStorageKey } from '@/lib/media/service'
import { prisma } from '@/lib/prisma'
import { generateUniqueKey, uploadObject } from '@/lib/storage'
import type { TaskJobData } from '@/lib/task/types'
import { buildBgmTimelineSignature } from '@/lib/bgm-score/timeline'
import { loadEpisodeChapterOutputClips } from '@/lib/video-compose/episode-chapter-clips'
import type { FinalRenderClipPlan } from '@/lib/video-compose/final-render-plan'
import { createWorkerLLMStreamCallbacks, createWorkerLLMStreamContext } from '@/lib/workers/handlers/llm-stream'
import { reportTaskProgress } from '@/lib/workers/shared'
import { buildSoundEffectScorePlanPrompt } from './plan'
import {
  ELEVENLABS_SOUND_EFFECT_MODEL,
  SOUND_EFFECT_SCORE_STATUS,
  soundEffectScorePlanSchema,
  type SoundEffectCuePlan,
  type SoundEffectCueRender,
  type SoundEffectScorePlan,
  type SoundEffectScoreProjectData,
} from './types'

type SoundEffectScorePayload = {
  readonly episodeId?: unknown
}

function readString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

function extensionFromMimeType(mimeType: string): string {
  if (mimeType.includes('wav')) return 'wav'
  if (mimeType.includes('ogg')) return 'ogg'
  if (mimeType.includes('mp4') || mimeType.includes('m4a')) return 'm4a'
  return 'mp3'
}

function ensureSchedulableTimeline(clips: readonly FinalRenderClipPlan[]): void {
  if (clips.length === 0) throw new Error('SOUND_EFFECT_SCORE_VIDEO_TIMELINE_INCOMPLETE')
  const invalidClip = clips.find((clip) => !Number.isFinite(clip.durationSeconds) || clip.durationSeconds <= 0)
  if (invalidClip) {
    throw new Error(`SOUND_EFFECT_SCORE_VIDEO_TIMELINE_INCOMPLETE:${invalidClip.groupId ?? invalidClip.panelId}`)
  }
}

function normalizePlanIndexes(plan: SoundEffectScorePlan): SoundEffectScorePlan {
  return {
    ...plan,
    cues: plan.cues.map((cue, index) => ({
      ...cue,
      cueId: cue.cueId.trim() || `sfx-${String(index + 1).padStart(3, '0')}`,
      index: index + 1,
    })),
  }
}

function parseSoundEffectPlanValue(parsed: unknown, durationSeconds: number): SoundEffectScorePlan {
  const result = soundEffectScorePlanSchema.safeParse(parsed)
  if (!result.success) {
    throw new Error(`SOUND_EFFECT_SCORE_PLAN_INVALID:${result.error.issues.map((issue) => issue.message).join(',')}`)
  }
  const normalized = normalizePlanIndexes({
    ...result.data,
    durationSeconds,
  })
  const normalizedResult = soundEffectScorePlanSchema.safeParse(normalized)
  if (!normalizedResult.success) {
    throw new Error(`SOUND_EFFECT_SCORE_PLAN_INVALID:${normalizedResult.error.issues.map((issue) => issue.message).join(',')}`)
  }
  return normalizedResult.data
}

async function writeSoundEffectScoreProjectData(input: {
  readonly episodeId: string
  readonly soundEffectScore: SoundEffectScoreProjectData
}): Promise<void> {
  const cuesJson = input.soundEffectScore as unknown as Prisma.InputJsonValue
  const diagnosticsJson = input.soundEffectScore.errorMessage
    ? { errorMessage: input.soundEffectScore.errorMessage } as Prisma.InputJsonValue
    : Prisma.JsonNull
  await prisma.projectEditSoundEffectScore.upsert({
    where: { episodeId: input.episodeId },
    create: {
      episodeId: input.episodeId,
      cuesJson,
      diagnosticsJson,
      version: 1,
      status: input.soundEffectScore.status,
      taskId: input.soundEffectScore.taskId,
      timelineSignature: input.soundEffectScore.timelineSignature,
      soundModel: input.soundEffectScore.soundModel,
    },
    update: {
      cuesJson,
      diagnosticsJson,
      status: input.soundEffectScore.status,
      taskId: input.soundEffectScore.taskId,
      timelineSignature: input.soundEffectScore.timelineSignature,
      soundModel: input.soundEffectScore.soundModel,
    },
  })
}

async function renderCue(userId: string, cue: SoundEffectCuePlan): Promise<SoundEffectCueRender> {
  const generated = await generateElevenLabsSoundEffect({
    userId,
    text: cue.prompt,
    durationSeconds: cue.durationSeconds,
  })
  const storageKey = await uploadObject(
    generated.buffer,
    generateUniqueKey('audio/sound-effects', extensionFromMimeType(generated.mimeType)),
    1,
    generated.mimeType,
  )
  const media = await ensureMediaObjectFromStorageKey(storageKey, {
    mimeType: generated.mimeType,
    sizeBytes: generated.buffer.byteLength,
    durationMs: Math.round(cue.durationSeconds * 1000),
  })
  return {
    ...cue,
    mediaId: media.id,
    url: media.url,
    storageKey,
    mimeType: generated.mimeType,
    durationMs: Math.round(cue.durationSeconds * 1000),
  }
}

export async function handleSoundEffectScoreGenerateTask(job: Job<TaskJobData>) {
  const payload = (job.data.payload || {}) as SoundEffectScorePayload
  const episodeId = readString(payload.episodeId) || readString(job.data.episodeId)
  if (!episodeId) throw new Error('SOUND_EFFECT_SCORE_EPISODE_REQUIRED')

  let editScriptId = ''
  let signature = ''
  let durationSeconds = 0

  try {
    await reportTaskProgress(job, 8, { stage: 'sound_effect_score_prepare' })
    const [project, episode, projectModelConfig] = await Promise.all([
      prisma.project.findUnique({
        where: { id: job.data.projectId },
        select: { videoRatio: true },
      }),
      prisma.projectEpisode.findFirst({
        where: { id: episodeId, projectId: job.data.projectId },
        select: { id: true },
      }),
      getProjectModelConfig(job.data.projectId, job.data.userId),
    ])
    if (!project) throw new Error('SOUND_EFFECT_SCORE_PROJECT_NOT_FOUND')
    if (!episode) throw new Error('SOUND_EFFECT_SCORE_EPISODE_NOT_FOUND')
    const analysisModel = readString(projectModelConfig.analysisModel)
    if (!analysisModel) throw new Error('SOUND_EFFECT_SCORE_ANALYSIS_MODEL_REQUIRED')

    const clips = await loadEpisodeChapterOutputClips({
      episodeId,
      projectId: job.data.projectId,
    })
    ensureSchedulableTimeline(clips)
    editScriptId = `episode:${episodeId}`
    durationSeconds = clips.reduce((total, clip) => total + clip.durationSeconds, 0)
    signature = buildBgmTimelineSignature(clips)

    await writeSoundEffectScoreProjectData({
      episodeId,
      soundEffectScore: {
        schemaVersion: 1,
        status: SOUND_EFFECT_SCORE_STATUS.GENERATING,
        taskId: job.data.taskId,
        editScriptId,
        timelineSignature: signature,
        durationSeconds,
        soundModel: ELEVENLABS_SOUND_EFFECT_MODEL,
      },
    })

    await reportTaskProgress(job, 18, { stage: 'sound_effect_score_plan' })
    const streamContext = createWorkerLLMStreamContext(job, 'sound_effect_score_plan')
    const streamCallbacks = createWorkerLLMStreamCallbacks(job, streamContext)
    const completion = await withInternalLLMStreamCallbacks(
      streamCallbacks,
      async () => {
        try {
          return await executeAiStructuredTextStep({
            userId: job.data.userId,
            model: analysisModel,
            messages: [{
              role: 'user',
              content: buildSoundEffectScorePlanPrompt({
                clips,
                totalDurationSeconds: durationSeconds,
                locale: job.data.locale,
              }),
            }],
            temperature: 0.25,
            projectId: job.data.projectId,
            action: 'sound_effect_score_plan',
            locale: job.data.locale,
            meta: {
              stepId: 'sound_effect_score_plan',
              stepTitle: 'sound_effect_score_plan',
              stepIndex: 1,
              stepTotal: 1,
            },
            schema: z.unknown(),
            parse: { kind: 'object' },
            validate: (raw) => parseSoundEffectPlanValue(raw, durationSeconds),
          })
        } finally {
          await streamCallbacks.flush()
        }
      },
    )
    const plan = completion.data

    const renderedCues: SoundEffectCueRender[] = []
    for (const cue of plan.cues) {
      const progress = 45 + Math.round((cue.index - 1) / Math.max(1, plan.cues.length) * 40)
      await reportTaskProgress(job, progress, {
        stage: 'sound_effect_score_generate_sound',
        cueId: cue.cueId,
        cueIndex: cue.index,
        cueCount: plan.cues.length,
      })
      renderedCues.push(await renderCue(job.data.userId, cue))
    }

    await reportTaskProgress(job, 88, { stage: 'sound_effect_score_persist' })
    await writeSoundEffectScoreProjectData({
      episodeId,
      soundEffectScore: {
        schemaVersion: 1,
        status: SOUND_EFFECT_SCORE_STATUS.COMPLETED,
        taskId: job.data.taskId,
        editScriptId,
        timelineSignature: signature,
        durationSeconds,
        soundModel: ELEVENLABS_SOUND_EFFECT_MODEL,
        plan,
        cues: renderedCues,
      },
    })

    return {
      episodeId,
      soundModel: ELEVENLABS_SOUND_EFFECT_MODEL,
      cueCount: renderedCues.length,
      audioUrls: renderedCues.map((cue) => cue.url),
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    if (editScriptId && signature && durationSeconds > 0) {
      await writeSoundEffectScoreProjectData({
        episodeId,
        soundEffectScore: {
          schemaVersion: 1,
          status: SOUND_EFFECT_SCORE_STATUS.FAILED,
          taskId: job.data.taskId,
          editScriptId,
          timelineSignature: signature,
          durationSeconds,
          soundModel: ELEVENLABS_SOUND_EFFECT_MODEL,
          errorMessage: message,
        },
      })
    }
    throw error
  }
}
