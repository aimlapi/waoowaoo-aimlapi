import type { Job } from 'bullmq'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { TASK_TYPE, type TaskJobData } from '@/lib/task/types'
import { createKernelCompilerFixture } from '../../fixtures/audio/kernel-compiler'
import {
  buildFinalRenderEditorProjectData,
  buildFinalRenderNativeOnlyTimeline,
  buildFinalRenderTestTimeline,
} from './final-video-render-worker-fixture'

const execFileMock = vi.hoisted(() => vi.fn())
const readFileMock = vi.hoisted(() => vi.fn())
const prismaMock = vi.hoisted(() => ({
  videoEditorProject: { findUnique: vi.fn(), upsert: vi.fn() },
  project: { findUnique: vi.fn() },
  projectEpisode: { findFirst: vi.fn() },
  projectEditScript: { findUnique: vi.fn() },
  projectPanel: { findMany: vi.fn() },
  projectVideoGroup: { findMany: vi.fn() },
}))
const reportTaskProgressMock = vi.hoisted(() => vi.fn())
const mediaServiceMock = vi.hoisted(() => ({
  ensureMediaObjectFromStorageKey: vi.fn(),
  resolveStorageKeyFromMediaValue: vi.fn(),
}))
const storageMock = vi.hoisted(() => ({
  generateUniqueKey: vi.fn((prefix: string, ext: string) => `${prefix}/asset.${ext}`),
  getObjectBuffer: vi.fn(),
  toFetchableUrl: vi.fn((url: string) => url),
  uploadObject: vi.fn(),
}))

vi.mock('node:child_process', () => ({ execFile: execFileMock }))
vi.mock('node:fs/promises', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs/promises')>()
  return { ...actual, readFile: readFileMock }
})
vi.mock('@/lib/prisma', () => ({ prisma: prismaMock }))
vi.mock('@/lib/workers/shared', () => ({ reportTaskProgress: reportTaskProgressMock }))
vi.mock('@/lib/media/service', () => mediaServiceMock)
vi.mock('@/lib/storage', () => storageMock)

function buildJob(payload: Record<string, unknown>): Job<TaskJobData> {
  return {
    queueName: 'waoowaoo-video',
    data: {
      taskId: 'task-1',
      type: TASK_TYPE.FINAL_VIDEO_RENDER,
      locale: 'zh',
      projectId: 'project-1',
      episodeId: 'episode-1',
      targetType: 'ProjectEpisode',
      targetId: 'episode-1',
      payload,
      userId: 'user-1',
    } satisfies TaskJobData,
  } as unknown as Job<TaskJobData>
}

describe('final video render worker', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    execFileMock.mockImplementation((
      command: string,
      args: readonly string[],
      optionsOrCallback: unknown,
      maybeCallback?: unknown,
    ) => {
      const callback = typeof optionsOrCallback === 'function' ? optionsOrCallback : maybeCallback
      if (typeof callback !== 'function') throw new Error('execFile callback missing')
      const argsText = args.join(' ')
      if (command === 'ffprobe' && argsText.includes('duration')) {
        callback(null, { stdout: '3.000\n', stderr: '' })
        return
      }
      if (command === 'ffprobe' && argsText.includes('-select_streams a:0')) {
        callback(null, { stdout: '0\n', stderr: '' })
        return
      }
      if (command === 'ffmpeg' && argsText.includes('print_format=json')) {
        callback(null, {
          stdout: '',
          stderr: '{"input_i":"-18.20","input_tp":"-2.30","input_lra":"5.20","input_thresh":"-28.30","target_offset":"0.30"}',
        })
        return
      }
      callback(null, { stdout: '', stderr: '' })
    })
    readFileMock.mockImplementation(async (filePath: string) => {
      if (filePath.endsWith('final.mp4')) return Buffer.from('final-video')
      const actual = await vi.importActual<typeof import('node:fs/promises')>('node:fs/promises')
      return actual.readFile(filePath)
    })
    storageMock.getObjectBuffer.mockResolvedValue(Buffer.from('media-data'))
    storageMock.uploadObject.mockResolvedValue('final-video/asset.mp4')
    mediaServiceMock.resolveStorageKeyFromMediaValue.mockResolvedValue('video/source.mp4')
    mediaServiceMock.ensureMediaObjectFromStorageKey.mockResolvedValue({ id: 'media-final', url: '/m/final-video' })
    prismaMock.project.findUnique.mockResolvedValue({ videoRatio: '9:16' })
    prismaMock.projectEpisode.findFirst.mockResolvedValue({ id: 'episode-1' })
    prismaMock.projectEditScript.findUnique.mockResolvedValue({
      id: 'edit-script-1',
      userPrompt: 'Render a final test edit.',
      title: 'Final Edit',
      logline: 'A test edit.',
      durationSec: 3,
      styleBibleJson: null,
      shotsJson: [{
        shotNumber: 1,
        durationSec: 3,
        dramaticPurpose: 'test purpose',
        visibleAction: 'A shot',
        audienceFocus: 'test focus',
        viewpoint: 'test viewpoint',
        revealPlan: 'test reveal',
        performanceBeat: 'test performance',
        continuityIn: 'test in',
        continuityOut: 'test out',
        charactersAndScene: 'A scene',
        sound: 'native dialogue and synchronized action sounds',
      }],
      videoBlocksJson: [{ kind: 'single', shotNumbers: [1], reason: 'single shot', prompt: 'video prompt' }],
      kernelCompilerJson: createKernelCompilerFixture(),
    })
    prismaMock.projectPanel.findMany.mockResolvedValue([{
      id: 'panel-1',
      panelIndex: 0,
      panelNumber: 1,
      duration: 3,
      description: 'panel 1',
      videoUrl: null,
      videoMedia: null,
      photographyRules: JSON.stringify({ source: 'edit_script', editScriptId: 'edit-script-1' }),
      storyboard: {
        id: 'storyboard-1',
        createdAt: new Date('2026-01-01T00:00:00.000Z'),
        storyboardTextJson: JSON.stringify({ editScriptId: 'edit-script-1' }),
        clip: { createdAt: new Date('2026-01-01T00:00:00.000Z') },
      },
    }])
    prismaMock.projectVideoGroup.findMany.mockResolvedValue([])
    prismaMock.videoEditorProject.findUnique.mockResolvedValue({
      projectData: buildFinalRenderEditorProjectData(buildFinalRenderTestTimeline()),
    })
  })

  afterEach(() => vi.restoreAllMocks())

  it('fails explicitly when an edit-first panel has no rendered video', async () => {
    const { handleFinalVideoRenderTask } = await import('@/lib/workers/final-video-render')

    await expect(handleFinalVideoRenderTask(buildJob({ episodeId: 'episode-1' })))
      .rejects.toThrow('AI 剪辑缺少可用视频：单镜头视频（镜头 1）。请先生成这些视频后再剪辑。')

    expect(execFileMock).not.toHaveBeenCalled()
    expect(prismaMock.videoEditorProject.upsert).toHaveBeenNthCalledWith(2, expect.objectContaining({
      update: expect.objectContaining({ renderStatus: 'failed' }),
    }))
  })

  it('renders against the locked 24fps timeline with smooth score automation', async () => {
    prismaMock.projectPanel.findMany.mockResolvedValue([{
      id: 'panel-1',
      panelIndex: 0,
      panelNumber: 1,
      duration: 3,
      description: 'panel 1',
      videoUrl: null,
      videoMedia: { storageKey: 'video/source.mp4', url: '/m/source-video' },
      photographyRules: JSON.stringify({ source: 'edit_script', editScriptId: 'edit-script-1' }),
      storyboard: {
        id: 'storyboard-1',
        createdAt: new Date('2026-01-01T00:00:00.000Z'),
        storyboardTextJson: JSON.stringify({ editScriptId: 'edit-script-1' }),
        clip: { createdAt: new Date('2026-01-01T00:00:00.000Z') },
      },
    }])
    const { handleFinalVideoRenderTask } = await import('@/lib/workers/final-video-render')

    const result = await handleFinalVideoRenderTask(buildJob({ episodeId: 'episode-1', bgmVolume: 0.8 }))

    expect(result).toMatchObject({ outputUrl: '/m/final-video', durationSeconds: 3 })
    const ffmpegCalls = execFileMock.mock.calls
      .filter((call) => call[0] === 'ffmpeg')
      .map((call) => (call[1] as readonly string[]).join(' '))
    expect(ffmpegCalls.some((args) => args.includes('fps=24/1'))).toBe(true)
    expect(ffmpegCalls.some((args) => args.includes('loudnorm=I=-18.000'))).toBe(true)
    expect(ffmpegCalls.some((args) => args.includes('sidechaincompress='))).toBe(false)
    expect(ffmpegCalls.some((args) => args.includes('between(t'))).toBe(false)
    expect(ffmpegCalls.some((args) => args.includes('(3-2*'))).toBe(true)

    const completedCall = prismaMock.videoEditorProject.upsert.mock.calls.find((call) => {
      const input = call[0] as { update?: { renderStatus?: string } }
      return input.update?.renderStatus === 'completed'
    })
    const serialized = (completedCall?.[0] as { update?: { projectData?: string } }).update?.projectData ?? '{}'
    const projectData = JSON.parse(serialized) as {
      durationSeconds?: number
      timeline?: readonly { startFrame: number; endFrameExclusive: number }[]
      audioMix?: { automationLaneCount?: number; targets?: { bgmIntegratedLufs?: number } }
    }
    expect(projectData.durationSeconds).toBe(3)
    expect(projectData.timeline).toEqual([expect.objectContaining({ startFrame: 0, endFrameExclusive: 72 })])
    expect(projectData.audioMix).toMatchObject({ automationLaneCount: 1, targets: { bgmIntegratedLufs: -18 } })
  })

  it('renders native audio without downloading BGM when SoundPresence rejects score', async () => {
    prismaMock.projectPanel.findMany.mockResolvedValue([{
      id: 'panel-1', panelIndex: 0, panelNumber: 1, duration: 3, description: 'panel 1', videoUrl: null,
      videoMedia: { storageKey: 'video/source.mp4', url: '/m/source-video' },
      photographyRules: JSON.stringify({ source: 'edit_script', editScriptId: 'edit-script-1' }),
      storyboard: {
        id: 'storyboard-1', createdAt: new Date('2026-01-01T00:00:00.000Z'),
        storyboardTextJson: JSON.stringify({ editScriptId: 'edit-script-1' }),
        clip: { createdAt: new Date('2026-01-01T00:00:00.000Z') },
      },
    }])
    prismaMock.videoEditorProject.findUnique.mockResolvedValue({
      projectData: buildFinalRenderEditorProjectData(buildFinalRenderNativeOnlyTimeline()),
    })
    const { handleFinalVideoRenderTask } = await import('@/lib/workers/final-video-render')

    await expect(handleFinalVideoRenderTask(buildJob({ episodeId: 'episode-1' })))
      .resolves.toMatchObject({ outputUrl: '/m/final-video' })
    expect(storageMock.getObjectBuffer).not.toHaveBeenCalledWith('music/bgm-score.m4a')
    const finalCall = execFileMock.mock.calls.find((call) => (
      call[0] === 'ffmpeg' && (call[1] as readonly string[]).some((arg) => arg.endsWith('final.mp4'))
    ))
    const finalArgs = (finalCall?.[1] ?? []) as readonly string[]
    expect(finalArgs.join(' ')).not.toContain('bgm.')
  })

  it('rejects a completed score whose frame timeline no longer matches the video edit', async () => {
    prismaMock.projectPanel.findMany.mockResolvedValue([{
      id: 'panel-1',
      panelIndex: 0,
      panelNumber: 1,
      duration: 3,
      description: 'panel 1',
      videoUrl: null,
      videoMedia: { storageKey: 'video/source.mp4', url: '/m/source-video' },
      photographyRules: JSON.stringify({ source: 'edit_script', editScriptId: 'edit-script-1' }),
      storyboard: {
        id: 'storyboard-1',
        createdAt: new Date('2026-01-01T00:00:00.000Z'),
        storyboardTextJson: JSON.stringify({ editScriptId: 'edit-script-1' }),
        clip: { createdAt: new Date('2026-01-01T00:00:00.000Z') },
      },
    }])
    prismaMock.videoEditorProject.findUnique.mockResolvedValue({
      projectData: buildFinalRenderEditorProjectData(buildFinalRenderTestTimeline('stale-signature')),
    })
    const { handleFinalVideoRenderTask } = await import('@/lib/workers/final-video-render')

    await expect(handleFinalVideoRenderTask(buildJob({ episodeId: 'episode-1' })))
      .rejects.toThrow('FINAL_VIDEO_RENDER_AUDIO_TIMELINE_STALE')

    expect(execFileMock).not.toHaveBeenCalled()
  })

  it('rejects a completed audio project after the Kernel Compiler document changes', async () => {
    const staleProject = JSON.parse(
      buildFinalRenderEditorProjectData(buildFinalRenderTestTimeline()),
    ) as { bgmScore: { kernelCompilerHash: string } }
    staleProject.bgmScore.kernelCompilerHash = 'ffffffffffffffffffffffff'
    prismaMock.videoEditorProject.findUnique.mockResolvedValue({
      projectData: JSON.stringify(staleProject),
    })
    const { handleFinalVideoRenderTask } = await import('@/lib/workers/final-video-render')

    await expect(handleFinalVideoRenderTask(buildJob({ episodeId: 'episode-1' })))
      .rejects.toThrow('FINAL_VIDEO_RENDER_AUDIO_KERNEL_STALE')
    expect(execFileMock).not.toHaveBeenCalled()
  })
})
