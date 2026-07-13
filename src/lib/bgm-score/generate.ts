import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import type { Job } from 'bullmq'
import { analyzeAudioContinuity } from '@/lib/audio-design/continuity-analysis'
import { analyzeLockedVideoFrames } from '@/lib/audio-design/video-visual-analysis'
import type { VideoVisualAnalysis } from '@/lib/audio-design/video-visual-types'
import { resolveVisualContinuityFacts } from '@/lib/audio-design/visual-continuity'
import {
  buildAudioTimelineV2,
  buildTimelineClips,
  createTimelineClock,
  createTimelineSignature,
} from '@/lib/audio-design/timeline'
import {
  framesToSeconds,
  type AudioTimelineV2,
} from '@/lib/audio-design/types'
import { parseNullableEditScriptStyleBible } from '@/lib/edit-script/style-bible-prompt'
import { prisma } from '@/lib/prisma'
import type { TaskJobData } from '@/lib/task/types'
import {
  buildFinalRenderClips,
  FINAL_RENDER_FPS_DENOMINATOR,
  FINAL_RENDER_FPS_NUMERATOR,
  parseFinalRenderEditScriptShots,
  parseFinalRenderEditScriptVideoBlocks,
  selectFinalRenderMusicDurationSeconds,
  type FinalRenderClipPlan,
  type FinalRenderEditScriptInput,
} from '@/lib/video-compose/final-render-plan'
import { reportTaskProgress } from '@/lib/workers/shared'
import { generateAmbienceAssets } from './audio-assets'
import { buildDisplayBgmPlan, buildFinalBgmMusicRequests } from './prompt'
import { mergeBgmScoreProjectData, parseEditorProjectData } from './project-data'
import { generateScoreCandidates } from './score-candidates'
import {
  BGM_SCORE_STATUS,
  bgmScoreProjectDataSchema,
  type AmbienceAsset,
  type BgmScorePlan,
  type BgmScoreProjectData,
  type ScoreCandidateAsset,
} from './types'

type BgmScoreGeneratePayload = {
  readonly episodeId?: unknown
  readonly musicModel?: unknown
  readonly outputFormat?: unknown
}

function readString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

function readOutputFormat(value: unknown): 'mp3' | 'wav' {
  if (value === undefined || value === null || value === '') return 'mp3'
  if (value === 'mp3' || value === 'wav') return value
  throw new Error('BGM_SCORE_OUTPUT_FORMAT_INVALID')
}

async function buildEditScript(episodeId: string): Promise<FinalRenderEditScriptInput | null> {
  const script = await prisma.projectEditScript.findUnique({
    where: { episodeId },
    select: {
      id: true,
      userPrompt: true,
      title: true,
      logline: true,
      durationSec: true,
      styleBibleJson: true,
      shotsJson: true,
      videoBlocksJson: true,
    },
  })
  if (!script) return null
  const shots = parseFinalRenderEditScriptShots(script.shotsJson)
  if (shots.length === 0) return null
  return {
    id: script.id,
    userPrompt: script.userPrompt,
    title: script.title,
    logline: script.logline,
    durationSec: script.durationSec,
    styleBible: parseNullableEditScriptStyleBible(script.styleBibleJson),
    shots,
    videoBlocks: parseFinalRenderEditScriptVideoBlocks({ value: script.videoBlocksJson, shots }),
  }
}

function ensureSchedulableTimeline(clips: readonly FinalRenderClipPlan[]): void {
  if (clips.length === 0) throw new Error('BGM_SCORE_VIDEO_TIMELINE_INCOMPLETE')
  const invalidClip = clips.find((clip) => !Number.isFinite(clip.durationSeconds) || clip.durationSeconds <= 0)
  if (invalidClip) throw new Error(`BGM_SCORE_VIDEO_TIMELINE_INCOMPLETE:${invalidClip.groupId ?? invalidClip.panelId}`)
}

async function writeBgmScoreProjectData(input: {
  readonly episodeId: string
  readonly bgmScore: BgmScoreProjectData
}): Promise<void> {
  const existing = await prisma.videoEditorProject.findUnique({
    where: { episodeId: input.episodeId },
    select: { projectData: true },
  })
  const projectData = mergeBgmScoreProjectData(
    parseEditorProjectData(existing?.projectData ?? null),
    input.bgmScore,
  )
  await prisma.videoEditorProject.upsert({
    where: { episodeId: input.episodeId },
    create: {
      episodeId: input.episodeId,
      projectData: JSON.stringify(projectData),
      renderStatus: null,
      renderTaskId: null,
      outputUrl: null,
    },
    update: { projectData: JSON.stringify(projectData) },
  })
}

function readReusableProjectData(value: string | null | undefined, signature: string): BgmScoreProjectData | null {
  const record = parseEditorProjectData(value)
  const parsed = bgmScoreProjectDataSchema.safeParse(record.bgmScore)
  if (!parsed.success || parsed.data.timelineSignature !== signature) return null
  return parsed.data
}

export async function handleBgmScoreGenerateTask(job: Job<TaskJobData>) {
  const payload = (job.data.payload || {}) as BgmScoreGeneratePayload
  const episodeId = readString(payload.episodeId) || readString(job.data.episodeId)
  const musicModel = readString(payload.musicModel)
  if (!episodeId) throw new Error('BGM_SCORE_EPISODE_REQUIRED')
  if (!musicModel) throw new Error('BGM_SCORE_MUSIC_MODEL_REQUIRED')

  let editScriptId: string | null = null
  let analysisMode: BgmScoreProjectData['analysisMode'] = 'video_only'
  let timelineSignature = ''
  let durationSeconds = 0
  let timelineAudio: AudioTimelineV2 | undefined
  let plan: BgmScorePlan | undefined
  let ambienceAssets: readonly AmbienceAsset[] = []
  let scoreCandidates: readonly ScoreCandidateAsset[] = []
  let visualAnalysis: VideoVisualAnalysis | undefined
  const workspaceDir = await mkdtemp(path.join(tmpdir(), 'waoowaoo-audio-design-'))

  try {
    await reportTaskProgress(job, 8, { stage: 'audio_timeline_lock' })
    const [project, episode, editScript, panels, videoGroups, editorProject] = await Promise.all([
      prisma.project.findUnique({
        where: { id: job.data.projectId },
        select: { analysisModel: true, videoRatio: true },
      }),
      prisma.projectEpisode.findFirst({
        where: { id: episodeId, projectId: job.data.projectId },
        select: { id: true },
      }),
      buildEditScript(episodeId),
      prisma.projectPanel.findMany({
        where: { storyboard: { episodeId } },
        include: {
          videoMedia: true,
          storyboard: {
            select: {
              id: true,
              createdAt: true,
              storyboardTextJson: true,
              clip: { select: { createdAt: true } },
            },
          },
        },
      }),
      prisma.projectVideoGroup.findMany({
        where: { episodeId, projectId: job.data.projectId },
        include: { videoMedia: true },
      }),
      prisma.videoEditorProject.findUnique({
        where: { episodeId },
        select: { projectData: true },
      }),
    ])
    if (!project) throw new Error('BGM_SCORE_PROJECT_NOT_FOUND')
    if (!episode) throw new Error('BGM_SCORE_EPISODE_NOT_FOUND')
    const analysisModel = readString(project.analysisModel)
    if (!analysisModel) throw new Error('BGM_SCORE_ANALYSIS_MODEL_REQUIRED')

    const clips = buildFinalRenderClips({ panels, videoGroups, editScript })
    ensureSchedulableTimeline(clips)
    const clock = createTimelineClock({
      clips,
      fpsNumerator: FINAL_RENDER_FPS_NUMERATOR,
      fpsDenominator: FINAL_RENDER_FPS_DENOMINATOR,
    })
    timelineSignature = createTimelineSignature({ clips, clock })
    durationSeconds = framesToSeconds(clock.totalFrames, clock)
    editScriptId = editScript?.id ?? null
    analysisMode = editScript ? 'script_assisted' : 'video_only'
    const timelineClips = buildTimelineClips(clips, clock)

    const reusable = readReusableProjectData(editorProject?.projectData ?? null, timelineSignature)
    scoreCandidates = reusable?.scoreCandidates ?? []
    if (reusable?.visualAnalysis) {
      visualAnalysis = reusable.visualAnalysis
    } else {
      await reportTaskProgress(job, 14, { stage: 'audio_video_visual_analysis' })
      visualAnalysis = await analyzeLockedVideoFrames({
        userId: job.data.userId,
        model: analysisModel,
        projectId: job.data.projectId,
        clips,
        timelineClips,
        clock,
      })
      await writeBgmScoreProjectData({
        episodeId,
        bgmScore: {
          schemaVersion: 5,
          status: BGM_SCORE_STATUS.GENERATING,
          taskId: job.data.taskId,
          analysisMode,
          editScriptId,
          timelineSignature,
          durationSeconds,
          musicModel,
          visualAnalysis,
          ambienceAssets,
          scoreCandidates,
          stage: 'audio_video_visual_analyzed',
        },
      })
    }
    if (reusable?.timelineAudio && reusable.plan) {
      timelineAudio = reusable.timelineAudio
      plan = reusable.plan
      ambienceAssets = reusable.ambienceAssets ?? []
    } else {
      await reportTaskProgress(job, 18, { stage: 'audio_continuity_plan' })
      const continuityPlan = await analyzeAudioContinuity({
        userId: job.data.userId,
        model: analysisModel,
        clock,
        clips: timelineClips,
        narrativeContext: {
          analysisMode,
          visualAnalysis,
          scriptContext: editScript ? {
            title: editScript.title,
            logline: editScript.logline,
            styleBible: editScript.styleBible,
            shots: editScript.shots,
            videoBlocks: editScript.videoBlocks,
          } : null,
          videoRatio: project.videoRatio,
        },
        sceneContinuityFacts: resolveVisualContinuityFacts(visualAnalysis),
        projectId: job.data.projectId,
        locale: job.data.locale,
      })
      timelineAudio = buildAudioTimelineV2({
        clips,
        clock,
        timelineSignature,
        continuityPlan,
      })
      const scoreCue = timelineAudio.scoreCues[0]
      if (!scoreCue) throw new Error('BGM_SCORE_CONTINUOUS_CUE_REQUIRED')
      plan = buildDisplayBgmPlan({ cue: scoreCue, clock, locale: job.data.locale })
    }

    await writeBgmScoreProjectData({
      episodeId,
      bgmScore: {
        schemaVersion: 5,
        status: BGM_SCORE_STATUS.GENERATING,
        taskId: job.data.taskId,
        analysisMode,
        editScriptId,
        timelineSignature,
        durationSeconds,
        musicModel,
        timelineAudio,
        plan,
        visualAnalysis,
        ambienceAssets,
        scoreCandidates,
        stage: 'audio_continuity_planned',
      },
    })

    await reportTaskProgress(job, 35, { stage: 'audio_ambience_generate' })
    ambienceAssets = await generateAmbienceAssets({
      userId: job.data.userId,
      timeline: timelineAudio,
      workspaceDir,
      reusableAssets: ambienceAssets,
      onProgress: async (assets) => {
        await writeBgmScoreProjectData({
          episodeId,
          bgmScore: {
            schemaVersion: 5,
            status: BGM_SCORE_STATUS.GENERATING,
            taskId: job.data.taskId,
            analysisMode,
            editScriptId,
            timelineSignature,
            durationSeconds,
            musicModel,
            timelineAudio,
            plan,
            visualAnalysis,
            ambienceAssets: assets,
            scoreCandidates,
            stage: 'audio_ambience_generate',
          },
        })
      },
    })

    await reportTaskProgress(job, 65, { stage: 'audio_score_generate' })
    const outputFormat = readOutputFormat(payload.outputFormat)
    const scoreCue = timelineAudio.scoreCues[0]
    if (!scoreCue) throw new Error('BGM_SCORE_CONTINUOUS_CUE_REQUIRED')
    const musicRequests = buildFinalBgmMusicRequests({ cue: scoreCue, clock: timelineAudio.clock })
    const generatedScore = await generateScoreCandidates({
      userId: job.data.userId,
      musicModel,
      requests: musicRequests,
      providerDurationSeconds: selectFinalRenderMusicDurationSeconds(musicModel, durationSeconds),
      timelineDurationSeconds: durationSeconds,
      bpm: scoreCue.musicTheorySpec.bpm,
      outputFormat,
      spec: scoreCue.musicTheorySpec,
      workspaceDir,
      reusableCandidates: scoreCandidates,
      onProgress: async (candidates) => {
        scoreCandidates = candidates
        await writeBgmScoreProjectData({
          episodeId,
          bgmScore: {
            schemaVersion: 5,
            status: BGM_SCORE_STATUS.GENERATING,
            taskId: job.data.taskId,
            analysisMode,
            editScriptId,
            timelineSignature,
            durationSeconds,
            musicModel,
            timelineAudio,
            plan,
            visualAnalysis,
            ambienceAssets,
            scoreCandidates,
            stage: 'audio_score_candidate_quality',
          },
        })
      },
    })
    scoreCandidates = generatedScore.candidates
    const mix = generatedScore.selected

    await reportTaskProgress(job, 90, { stage: 'audio_assets_persist' })
    await writeBgmScoreProjectData({
      episodeId,
      bgmScore: {
        schemaVersion: 5,
        status: BGM_SCORE_STATUS.COMPLETED,
        taskId: job.data.taskId,
        analysisMode,
        editScriptId,
        timelineSignature,
        durationSeconds,
        musicModel,
        timelineAudio,
        plan,
        visualAnalysis,
        mix,
        ambienceAssets,
        scoreCandidates,
        stage: 'audio_assets_ready',
      },
    })

    return {
      episodeId,
      mediaId: mix.mediaId,
      audioUrl: mix.url,
      storageKey: mix.storageKey,
      musicModel,
      ambienceSourceCount: timelineAudio.ambienceSources.length,
      ambienceCandidateCount: ambienceAssets.length,
      scoreCandidateCount: scoreCandidates.length,
      durationMs: mix.durationMs,
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    if (timelineSignature && durationSeconds > 0) {
      await writeBgmScoreProjectData({
        episodeId,
        bgmScore: {
          schemaVersion: 5,
          status: BGM_SCORE_STATUS.FAILED,
          taskId: job.data.taskId,
          analysisMode,
          editScriptId,
          timelineSignature,
          durationSeconds,
          musicModel,
          ...(timelineAudio ? { timelineAudio } : {}),
          ...(plan ? { plan } : {}),
          ...(visualAnalysis ? { visualAnalysis } : {}),
          ambienceAssets,
          scoreCandidates,
          stage: 'failed',
          errorMessage: message,
        },
      })
    }
    throw error
  } finally {
    await rm(workspaceDir, { recursive: true, force: true })
  }
}
