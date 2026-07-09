import type { Job } from 'bullmq'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { TASK_TYPE, type TaskJobData } from '@/lib/task/types'

const prismaMock = vi.hoisted(() => ({
  project: {
    findUnique: vi.fn(),
  },
  projectEpisode: {
    findFirst: vi.fn(),
  },
  projectEditSoundEffectScore: {
    upsert: vi.fn(),
  },
}))
const configServiceMock = vi.hoisted(() => ({
  getProjectModelConfig: vi.fn(),
}))
const executeAiStructuredTextStepMock = vi.hoisted(() => vi.fn())
const loadEpisodeChapterOutputClipsMock = vi.hoisted(() => vi.fn())
const generateElevenLabsSoundEffectMock = vi.hoisted(() => vi.fn())
const reportTaskProgressMock = vi.hoisted(() => vi.fn())
const streamMock = vi.hoisted(() => ({
  flush: vi.fn(async () => undefined),
}))
const mediaServiceMock = vi.hoisted(() => ({
  ensureMediaObjectFromStorageKey: vi.fn(),
}))
const storageMock = vi.hoisted(() => ({
  generateUniqueKey: vi.fn((prefix: string, ext: string) => `${prefix}/asset.${ext}`),
  uploadObject: vi.fn(),
}))

vi.mock('@/lib/prisma', () => ({
  prisma: prismaMock,
}))

vi.mock('@/lib/config-service', () => configServiceMock)

vi.mock('@/lib/ai-exec/structured-step', () => ({
  executeAiStructuredTextStep: executeAiStructuredTextStepMock,
}))

vi.mock('@/lib/video-compose/episode-chapter-clips', () => ({
  loadEpisodeChapterOutputClips: loadEpisodeChapterOutputClipsMock,
}))

vi.mock('@/lib/ai-providers/elevenlabs/sound-effects', () => ({
  generateElevenLabsSoundEffect: generateElevenLabsSoundEffectMock,
}))

vi.mock('@/lib/workers/shared', () => ({
  reportTaskProgress: reportTaskProgressMock,
}))

vi.mock('@/lib/llm-observe/internal-stream-context', () => ({
  withInternalLLMStreamCallbacks: vi.fn(async (_callbacks: unknown, fn: () => Promise<unknown>) => await fn()),
}))

vi.mock('@/lib/workers/handlers/llm-stream', () => ({
  createWorkerLLMStreamContext: vi.fn(() => ({ streamRunId: 'run-1', nextSeqByStepLane: {} })),
  createWorkerLLMStreamCallbacks: vi.fn(() => streamMock),
}))

vi.mock('@/lib/media/service', () => ({
  ensureMediaObjectFromStorageKey: mediaServiceMock.ensureMediaObjectFromStorageKey,
}))

vi.mock('@/lib/storage', () => ({
  generateUniqueKey: storageMock.generateUniqueKey,
  uploadObject: storageMock.uploadObject,
}))

function buildJob(): Job<TaskJobData> {
  return {
    queueName: 'waoowaoo-music',
    data: {
      taskId: 'task-sfx-1',
      type: TASK_TYPE.SOUND_EFFECT_SCORE_PLAN,
      locale: 'zh',
      projectId: 'project-1',
      episodeId: 'episode-1',
      targetType: 'ProjectEpisode',
      targetId: 'episode-1',
      payload: { episodeId: 'episode-1' },
      userId: 'user-1',
    } satisfies TaskJobData,
  } as unknown as Job<TaskJobData>
}

const clips = [{
  panelId: 'chapter-1',
  groupId: 'group-1',
  sourceKind: 'videoGroup' as const,
  source: { storageKey: 'chapter-video/chapter-1.mp4' },
  durationSeconds: 3,
  order: 1,
  shotNumber: 1,
  shotNumbers: [1],
  shotId: 'shot-1',
  shotIds: ['shot-1'],
  description: 'A door opens.',
  sound: 'Door creak.',
}]

describe('sound effect score worker', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    prismaMock.project.findUnique.mockResolvedValue({ videoRatio: '16:9' })
    prismaMock.projectEpisode.findFirst.mockResolvedValue({ id: 'episode-1' })
    configServiceMock.getProjectModelConfig.mockResolvedValue({ analysisModel: 'openai::gpt-5-mini' })
    loadEpisodeChapterOutputClipsMock.mockResolvedValue(clips)
    executeAiStructuredTextStepMock.mockImplementation(async (input: { validate: (raw: unknown) => unknown }) => ({
      data: input.validate({
        durationSeconds: 3,
        cues: [{
          cueId: 'sfx-001',
          index: 1,
          startSeconds: 0.4,
          durationSeconds: 1.2,
          label: '门轴轻响',
          prompt: '干净的电影拟音：门轴轻轻吱呀响，无音乐，无人声',
          sourceClipOrders: [1],
          shotIds: ['shot-1'],
          shotNumbers: [1],
        }],
      }),
    }))
    generateElevenLabsSoundEffectMock.mockResolvedValue({
      buffer: Buffer.from('sfx'),
      mimeType: 'audio/mpeg',
      modelId: 'eleven_text_to_sound_v2',
    })
    storageMock.uploadObject.mockResolvedValue('audio/sound-effects/asset.mp3')
    mediaServiceMock.ensureMediaObjectFromStorageKey.mockResolvedValue({
      id: 'media-sfx-1',
      url: '/m/sfx-1',
    })
  })

  it('generates ElevenLabs sound effects from the rendered timeline plan', async () => {
    const { handleSoundEffectScoreGenerateTask } = await import('@/lib/sound-effects/generate')

    const result = await handleSoundEffectScoreGenerateTask(buildJob())

    expect(result).toMatchObject({
      episodeId: 'episode-1',
      soundModel: 'eleven_text_to_sound_v2',
      cueCount: 1,
      audioUrls: ['/m/sfx-1'],
    })
    expect(generateElevenLabsSoundEffectMock).toHaveBeenCalledWith({
      text: '干净的电影拟音：门轴轻轻吱呀响，无音乐，无人声',
      durationSeconds: 1.2,
    })
    const completedCall = prismaMock.projectEditSoundEffectScore.upsert.mock.calls.find((call) => {
      const data = call[0] as { update?: { status?: string; cuesJson?: { cues?: unknown[] } } }
      return data.update?.status === 'completed'
    })
    expect(completedCall).toBeDefined()
    expect(completedCall?.[0]).toMatchObject({
      where: { episodeId: 'episode-1' },
      update: {
        status: 'completed',
        taskId: 'task-sfx-1',
        soundModel: 'eleven_text_to_sound_v2',
        cuesJson: {
          cues: [expect.objectContaining({
            cueId: 'sfx-001',
            mediaId: 'media-sfx-1',
            url: '/m/sfx-1',
            storageKey: 'audio/sound-effects/asset.mp3',
          })],
        },
      },
    })
  })
})
