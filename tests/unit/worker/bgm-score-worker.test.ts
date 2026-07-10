import type { Job } from 'bullmq'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { TASK_TYPE, type TaskJobData } from '@/lib/task/types'

const prismaMock = vi.hoisted(() => ({
  project: { findUnique: vi.fn() },
  projectEpisode: { findFirst: vi.fn() },
  projectEditScript: { findUnique: vi.fn() },
  projectPanel: { findMany: vi.fn() },
  projectVideoGroup: { findMany: vi.fn() },
  videoEditorProject: { findUnique: vi.fn(), upsert: vi.fn() },
}))
const executeAiTextStepMock = vi.hoisted(() => vi.fn())
const generateMusicMock = vi.hoisted(() => vi.fn())
const executeMediaGenerationMock = vi.hoisted(() => vi.fn())
const reportTaskProgressMock = vi.hoisted(() => vi.fn())
const analyzeLockedVideoFramesMock = vi.hoisted(() => vi.fn())
const mediaServiceMock = vi.hoisted(() => ({ ensureMediaObjectFromStorageKey: vi.fn() }))
const storageMock = vi.hoisted(() => ({
  generateUniqueKey: vi.fn((prefix: string, ext: string) => `${prefix}/asset.${ext}`),
  toFetchableUrl: vi.fn((url: string) => url),
  uploadObject: vi.fn(),
}))

vi.mock('@/lib/prisma', () => ({ prisma: prismaMock }))
vi.mock('@/lib/ai-exec/engine', () => ({
  executeAiTextStep: executeAiTextStepMock,
  executeMediaGeneration: executeMediaGenerationMock,
  generateMusic: generateMusicMock,
}))
vi.mock('@/lib/workers/shared', () => ({ reportTaskProgress: reportTaskProgressMock }))
vi.mock('@/lib/audio-design/video-visual-analysis', () => ({
  analyzeLockedVideoFrames: analyzeLockedVideoFramesMock,
}))
vi.mock('@/lib/media/service', () => ({
  ensureMediaObjectFromStorageKey: mediaServiceMock.ensureMediaObjectFromStorageKey,
}))
vi.mock('@/lib/storage', () => ({
  generateUniqueKey: storageMock.generateUniqueKey,
  toFetchableUrl: storageMock.toFetchableUrl,
  uploadObject: storageMock.uploadObject,
}))

function job(): Job<TaskJobData> {
  return {
    queueName: 'waoowaoo-music',
    data: {
      taskId: 'task-bgm-1',
      type: TASK_TYPE.BGM_SCORE_GENERATE,
      locale: 'zh',
      projectId: 'project-1',
      episodeId: 'episode-1',
      targetType: 'ProjectEpisode',
      targetId: 'episode-1',
      payload: {
        episodeId: 'episode-1',
        musicModel: 'fal::fal-ai/lyria3/pro',
      },
      userId: 'user-1',
    },
  } as unknown as Job<TaskJobData>
}

function continuityPlanText(): string {
  return JSON.stringify({
    schemaVersion: 2,
    soundWorlds: [],
    acousticTransitions: [],
    ambienceSources: [],
    scoreCues: [{
      cueId: 'score-master',
      musicalContinuityId: 'score-master-continuity',
      range: { startFrame: 0, endFrameExclusive: 72 },
      narrativeDiagnosis: {
        surfaceEmotion: 'violent bloody imagery',
        trueScoringEmotion: 'controlled pressure',
        scoringStance: 'procedural_control',
        avoidEmotions: ['sensational horror'],
        musicShouldDo: 'remain detached',
        musicShouldNotDo: 'imitate the physical event',
      },
      generationSpec: {
        bpm: 60,
        key: 'D minor',
        meter: '4/4',
        style: 'minimalist_underscore',
        emotionalProfile: 'cold_procedural_tension',
        harmonicLanguage: 'sparse_unresolved_minor',
        density: 'sparse',
        registers: ['low'],
        instruments: ['muted_analog_synthesizer'],
        articulations: ['sustained'],
        sections: [{
          sectionId: 'full-cue',
          range: { startFrame: 0, endFrameExclusive: 72 },
          function: 'development',
          energy: 0.3,
          density: 'sparse',
          harmonicTension: 0.4,
          instruments: ['muted_analog_synthesizer'],
          articulations: ['sustained'],
        }],
      },
      intentionalSilenceRanges: [],
    }],
    automationLanes: [],
  })
}

function mockReadyProject(): void {
  prismaMock.project.findUnique.mockResolvedValue({ analysisModel: 'openai::gpt-4.1', videoRatio: '16:9' })
  prismaMock.projectEpisode.findFirst.mockResolvedValue({ id: 'episode-1' })
  prismaMock.projectEditScript.findUnique.mockResolvedValue({
    id: 'edit-script-1',
    userPrompt: 'test',
    title: 'Test',
    logline: 'A test with difficult imagery.',
    durationSec: 3,
    styleBibleJson: null,
    shotsJson: [{
      shotNumber: 1,
      durationSec: 3,
      dramaticPurpose: 'test',
      visibleAction: 'A visible action',
      audienceFocus: 'subject',
      viewpoint: 'medium',
      revealPlan: 'none',
      performanceBeat: 'restrained',
      continuityIn: 'continuous',
      continuityOut: 'continuous',
      charactersAndScene: 'room',
      sound: 'native dialogue and synchronized actions only',
    }],
    videoBlocksJson: [],
  })
  prismaMock.projectPanel.findMany.mockResolvedValue([{
    id: 'panel-1',
    panelIndex: 0,
    panelNumber: 1,
    duration: 3,
    description: 'panel 1',
    videoUrl: 'https://example.com/panel-1.mp4',
    videoMedia: null,
    photographyRules: JSON.stringify({ editScriptId: 'edit-script-1' }),
    storyboard: {
      id: 'storyboard-1',
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
      storyboardTextJson: JSON.stringify({ editScriptId: 'edit-script-1' }),
      clip: { createdAt: new Date('2026-01-01T00:00:00.000Z') },
    },
  }])
  prismaMock.projectVideoGroup.findMany.mockResolvedValue([])
}

describe('BGM score worker V4', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockReadyProject()
    prismaMock.videoEditorProject.findUnique.mockResolvedValue({ projectData: null })
    executeAiTextStepMock.mockResolvedValue({ text: continuityPlanText() })
    analyzeLockedVideoFramesMock.mockResolvedValue({
      schemaVersion: 1,
      sampleStepFrames: 24,
      observations: [{
        frame: 0,
        location: 'interior room',
        enclosure: 'enclosed',
        weather: null,
        persistentEnvironment: ['quiet room'],
        activityLevel: 0.3,
        suggestedScoreEnergy: 0.2,
        description: 'restrained interior scene',
      }],
    })
    generateMusicMock.mockResolvedValue({
      success: true,
      audioBase64: Buffer.from('score').toString('base64'),
      audioMimeType: 'audio/mpeg',
    })
    storageMock.uploadObject.mockImplementation(async (_buffer: Buffer, key: string) => key)
    mediaServiceMock.ensureMediaObjectFromStorageKey.mockResolvedValue({ id: 'media-mix', url: '/m/bgm-mix' })
  })

  it('persists a 24 fps frame-authoritative timeline and a provider-safe Lyria prompt', async () => {
    const { handleBgmScoreGenerateTask } = await import('@/lib/bgm-score/generate')
    const result = await handleBgmScoreGenerateTask(job())

    expect(result).toMatchObject({ mediaId: 'media-mix', ambienceSourceCount: 0 })
    const lyriaPrompt = String(generateMusicMock.mock.calls[0]?.[2])
    expect(lyriaPrompt).toContain('60 BPM')
    expect(lyriaPrompt).not.toMatch(/violent|blood|gore|torture/i)

    const completed = prismaMock.videoEditorProject.upsert.mock.calls.find((call) => {
      const data = JSON.parse(String(call[0]?.update?.projectData ?? '{}')) as {
        bgmScore?: { status?: string; schemaVersion?: number }
      }
      return data.bgmScore?.status === 'completed'
    })
    const projectData = JSON.parse(String(completed?.[0]?.update?.projectData ?? '{}')) as {
      bgmScore?: {
        schemaVersion?: number
        timelineAudio?: {
          clock?: { fpsNumerator?: number; fpsDenominator?: number; sampleRate?: number; totalFrames?: number }
          stemPlan?: readonly { role?: string }[]
        }
      }
    }
    expect(projectData.bgmScore?.schemaVersion).toBe(4)
    expect(projectData.bgmScore?.timelineAudio?.clock).toEqual({
      fpsNumerator: 24,
      fpsDenominator: 1,
      sampleRate: 48_000,
      totalFrames: 72,
    })
    expect(projectData.bgmScore?.timelineAudio?.stemPlan?.map((stem) => stem.role))
      .toEqual(['native_video', 'ambience', 'bgm'])
  })

  it('runs in video-only mode when no screenplay exists', async () => {
    prismaMock.projectEditScript.findUnique.mockResolvedValue(null)
    const { handleBgmScoreGenerateTask } = await import('@/lib/bgm-score/generate')

    await expect(handleBgmScoreGenerateTask(job())).resolves.toMatchObject({ mediaId: 'media-mix' })

    expect(analyzeLockedVideoFramesMock).toHaveBeenCalledWith(expect.objectContaining({
      clips: expect.arrayContaining([expect.objectContaining({ panelId: 'panel-1' })]),
      clock: expect.objectContaining({ fpsNumerator: 24, totalFrames: 72 }),
    }))
    const continuityPrompt = String(executeAiTextStepMock.mock.calls[0]?.[0]?.messages?.[0]?.content)
    expect(continuityPrompt).toContain('"analysisMode": "video_only"')
    expect(continuityPrompt).toContain('"scriptContext": null')
    const completed = prismaMock.videoEditorProject.upsert.mock.calls.find((call) => {
      const data = JSON.parse(String(call[0]?.update?.projectData ?? '{}')) as {
        bgmScore?: { status?: string }
      }
      return data.bgmScore?.status === 'completed'
    })
    const data = JSON.parse(String(completed?.[0]?.update?.projectData ?? '{}')) as {
      bgmScore?: { analysisMode?: string; editScriptId?: string | null; visualAnalysis?: unknown }
    }
    expect(data.bgmScore).toMatchObject({
      analysisMode: 'video_only',
      editScriptId: null,
      visualAnalysis: expect.objectContaining({ sampleStepFrames: 24 }),
    })
  })

  it('fails before model calls when no schedulable timeline exists', async () => {
    prismaMock.projectPanel.findMany.mockResolvedValue([])
    const { handleBgmScoreGenerateTask } = await import('@/lib/bgm-score/generate')

    await expect(handleBgmScoreGenerateTask(job())).rejects.toThrow('BGM_SCORE_VIDEO_TIMELINE_INCOMPLETE')
    expect(executeAiTextStepMock).not.toHaveBeenCalled()
    expect(generateMusicMock).not.toHaveBeenCalled()
  })

  it('persists the failed stage without uploading a score when Lyria rejects the request', async () => {
    generateMusicMock.mockResolvedValue({ success: false, error: 'provider rejected final BGM' })
    const { handleBgmScoreGenerateTask } = await import('@/lib/bgm-score/generate')

    await expect(handleBgmScoreGenerateTask(job())).rejects.toThrow('provider rejected final BGM')
    expect(storageMock.uploadObject).not.toHaveBeenCalled()
    const failed = prismaMock.videoEditorProject.upsert.mock.calls.find((call) => {
      const data = JSON.parse(String(call[0]?.update?.projectData ?? '{}')) as {
        bgmScore?: { status?: string; stage?: string; errorMessage?: string }
      }
      return data.bgmScore?.status === 'failed'
    })
    const data = JSON.parse(String(failed?.[0]?.update?.projectData ?? '{}')) as {
      bgmScore?: { stage?: string; errorMessage?: string }
    }
    expect(data.bgmScore).toMatchObject({ stage: 'failed', errorMessage: 'provider rejected final BGM' })
  })
})
