import type { Job } from 'bullmq'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { TASK_TYPE, type TaskJobData } from '@/lib/task/types'
import { createTestContinuityPlan } from '../audio-design/audio-timeline-fixture'

const prismaMock = vi.hoisted(() => ({
  project: { findUnique: vi.fn() },
  projectEpisode: { findFirst: vi.fn() },
  projectEditScript: { findUnique: vi.fn() },
  projectPanel: { findMany: vi.fn() },
  projectVideoGroup: { findMany: vi.fn() },
  videoEditorProject: { findUnique: vi.fn(), upsert: vi.fn() },
}))
const executeAiTextStepMock = vi.hoisted(() => vi.fn())
const generateScoreCandidatesMock = vi.hoisted(() => vi.fn())
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
}))
vi.mock('@/lib/bgm-score/score-candidates', () => ({
  generateScoreCandidates: generateScoreCandidatesMock,
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
  const fixture = createTestContinuityPlan()
  const cue = fixture.scoreCues[0]!
  return JSON.stringify({
    ...fixture,
    soundWorlds: [],
    acousticTransitions: [],
    ambienceSources: [],
    scoreCues: [{
      ...cue,
      range: { startFrame: 0, endFrameExclusive: 72 },
      narrativeDiagnosis: {
        surfaceEmotion: 'violent bloody imagery',
        trueScoringEmotion: 'controlled pressure',
        scoringStance: 'procedural_control',
        avoidEmotions: ['sensational horror'],
        musicShouldDo: 'remain detached',
        musicShouldNotDo: 'imitate the physical event',
      },
      musicTheorySpec: {
        ...cue.musicTheorySpec,
        phases: cue.musicTheorySpec.phases.map((phase) => ({
          ...phase,
          range: { startFrame: 0, endFrameExclusive: 72 },
        })),
      },
    }],
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

describe('BGM score worker V5', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockReadyProject()
    prismaMock.videoEditorProject.findUnique.mockResolvedValue({ projectData: null })
    executeAiTextStepMock.mockResolvedValue({ text: continuityPlanText() })
    analyzeLockedVideoFramesMock.mockResolvedValue({
      schemaVersion: 2,
      sampleStepFrames: 24,
      observations: [{
        frame: 0,
        location: 'interior room',
        locationEvidence: 'observed',
        locationConfidence: 0.95,
        continuityWithPrevious: 'uncertain',
        transitionEvidence: [],
        enclosure: 'enclosed',
        weather: null,
        persistentEnvironment: ['quiet room'],
        outOfFramePersistentEnvironment: [],
        activityLevel: 0.3,
        suggestedScoreEnergy: 0.2,
        description: 'restrained interior scene',
      }],
    })
    generateScoreCandidatesMock.mockImplementation(async (input: {
      onProgress: (candidates: readonly unknown[]) => Promise<void>
    }) => {
      const quality = {
        actualDurationSeconds: 3, sourceDurationSeconds: 3, durationConformanceRatio: 1,
        peakAmplitude: 0.5, rmsAmplitude: 0.1, clippingRatio: 0, silenceRatio: 0,
        transientRate: 0.5, repetitionScore: 0.2, structureError: 0.1, qualityScore: 90, passed: true,
        spectralDistribution: { sub: 0.1, low: 0.2, lowMid: 0.2, mid: 0.2, highMid: 0.1, high: 0.1, air: 0.1 },
        spectralBudgetError: 0.1, spectralCoverage: 7, timbralVariation: 0.1,
        crestFactorDb: 8, dynamicRangeDb: 12,
      }
      const strategies = ['balanced_ensemble', 'counterpoint_clarity', 'spectral_depth', 'microdynamic_detail'] as const
      const candidates = strategies.map((renderStrategy, candidateIndex) => ({
        candidateIndex,
        renderStrategy,
        selected: candidateIndex === 0,
        mediaId: `media-${candidateIndex}`,
        url: `/m/score-${candidateIndex}`,
        storageKey: `music/score-${candidateIndex}.mp3`,
        mimeType: 'audio/mpeg',
        durationMs: 3000,
        quality,
      }))
      await input.onProgress(candidates)
      return {
        candidates,
        selected: {
          mediaId: 'media-mix', url: '/m/bgm-mix', storageKey: 'music/score-0.mp3',
          mimeType: 'audio/mpeg', durationMs: 3000,
        },
      }
    })
    storageMock.uploadObject.mockImplementation(async (_buffer: Buffer, key: string) => key)
    mediaServiceMock.ensureMediaObjectFromStorageKey.mockResolvedValue({ id: 'media-mix', url: '/m/bgm-mix' })
  })

  it('persists a 24 fps frame-authoritative timeline and a provider-safe Lyria prompt', async () => {
    const { handleBgmScoreGenerateTask } = await import('@/lib/bgm-score/generate')
    const result = await handleBgmScoreGenerateTask(job())

    expect(result).toMatchObject({ mediaId: 'media-mix', ambienceSourceCount: 0 })
    const requests = generateScoreCandidatesMock.mock.calls[0]?.[0]?.requests as readonly {
      prompt: string
      negativePrompt: string
      strategy: string
    }[]
    const lyriaPrompt = String(requests[0]?.prompt)
    expect(lyriaPrompt).toContain('60 BPM')
    expect(lyriaPrompt).not.toMatch(/violent|blood|gore|torture/i)
    expect(generateScoreCandidatesMock).toHaveBeenCalledWith(expect.objectContaining({
      requests: expect.arrayContaining([expect.objectContaining({
        strategy: 'spectral_depth',
        negativePrompt: expect.stringContaining('foreground brass fanfare intervals and parallel triadic voicing'),
      })]),
      reusableCandidates: [],
    }))

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
    expect(projectData.bgmScore?.schemaVersion).toBe(5)
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
    expect(generateScoreCandidatesMock).not.toHaveBeenCalled()
  })

  it('persists the failed stage without uploading a score when Lyria rejects the request', async () => {
    generateScoreCandidatesMock.mockRejectedValue(new Error('provider rejected final BGM'))
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
