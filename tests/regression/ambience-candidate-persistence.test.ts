import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { AudioTimelineV2 } from '@/lib/audio-design/types'
import type { AmbienceAsset } from '@/lib/bgm-score/types'

const generateAudioStemMock = vi.hoisted(() => vi.fn())
const ensureMediaObjectMock = vi.hoisted(() => vi.fn())
const storageMock = vi.hoisted(() => ({
  generateUniqueKey: vi.fn((prefix: string, ext: string) => `${prefix}/candidate.${ext}`),
  getObjectBuffer: vi.fn(),
  toFetchableUrl: vi.fn((url: string) => url),
  uploadObject: vi.fn(),
}))
const execFileMock = vi.hoisted(() => vi.fn())

vi.mock('node:child_process', () => ({ execFile: execFileMock }))
vi.mock('@/lib/audio-design/stem-generation', () => ({ generateAudioStem: generateAudioStemMock }))
vi.mock('@/lib/media/service', () => ({ ensureMediaObjectFromStorageKey: ensureMediaObjectMock }))
vi.mock('@/lib/storage', () => storageMock)

const timeline = {
  clock: { fpsNumerator: 24, fpsDenominator: 1, sampleRate: 48_000, totalFrames: 240 },
  ambienceSources: [{
    sourceId: 'room-tone',
    sourceContinuityId: 'room-tone-continuity',
    worldId: 'room',
    playbackType: 'continuous_evolving',
    semanticRole: 'room air',
    range: { startFrame: 0, endFrameExclusive: 240 },
    description: 'quiet room air',
    generationPrompt: 'Isolated quiet room air, continuous and stable, no footsteps.',
    promptInfluence: 0.8,
    loopPolicy: null,
  }],
} as unknown as AudioTimelineV2

describe('ambience candidate persistence regression', () => {
  let workspaceDir = ''

  beforeEach(async () => {
    vi.clearAllMocks()
    workspaceDir = await mkdtemp(path.join(os.tmpdir(), 'ambience-progress-'))
    generateAudioStemMock.mockResolvedValue({
      success: true,
      audioBase64: Buffer.from('generated-audio').toString('base64'),
      audioMimeType: 'audio/mpeg',
    })
    storageMock.uploadObject
      .mockResolvedValueOnce('audio/ambience/candidate-0.mp3')
      .mockResolvedValueOnce('audio/ambience/candidate-1.mp3')
    ensureMediaObjectMock.mockImplementation(async (storageKey: string) => ({
      id: `media-${storageKey}`,
      url: `/media/${storageKey}`,
    }))
    execFileMock.mockImplementation((
      _command: string,
      args: readonly string[],
      callback: (error: Error | null, stdout: string, stderr: string) => void,
    ) => {
      const outputPath = args[args.length - 1]
      if (!outputPath) throw new Error('TEST_PCM_OUTPUT_PATH_MISSING')
      void writeFile(outputPath, Buffer.alloc(48_000 * 4)).then(
        () => callback(null, '', ''),
        (error: Error) => callback(error, '', ''),
      )
    })
  })

  afterEach(async () => {
    await rm(workspaceDir, { recursive: true, force: true })
  })

  it('persists the first candidate immediately and resumes by generating only the missing candidate', async () => {
    const { generateAmbienceAssets } = await import('@/lib/bgm-score/audio-assets')
    let checkpoint: readonly AmbienceAsset[] = []
    await expect(generateAmbienceAssets({
      userId: 'user-1',
      timeline,
      workspaceDir,
      reusableAssets: [],
      onProgress: async (assets) => {
        checkpoint = [...assets]
        throw new Error('TEST_INTERRUPTION_AFTER_FIRST_CHECKPOINT')
      },
    })).rejects.toThrow('TEST_INTERRUPTION_AFTER_FIRST_CHECKPOINT')

    expect(checkpoint).toHaveLength(1)
    expect(checkpoint[0]).toMatchObject({ sourceId: 'room-tone', candidateIndex: 0, selected: false })
    expect(generateAudioStemMock).toHaveBeenCalledTimes(1)

    const progressSnapshots: Array<readonly AmbienceAsset[]> = []
    const completed = await generateAmbienceAssets({
      userId: 'user-1',
      timeline,
      workspaceDir,
      reusableAssets: checkpoint,
      onProgress: async (assets) => {
        progressSnapshots.push([...assets])
      },
    })

    expect(generateAudioStemMock).toHaveBeenCalledTimes(2)
    expect(progressSnapshots[0]).toHaveLength(2)
    expect(completed).toHaveLength(2)
    expect(completed.filter((candidate) => candidate.selected)).toHaveLength(1)
    expect(completed.map((candidate) => candidate.candidateIndex).sort()).toEqual([0, 1])
  })
})
