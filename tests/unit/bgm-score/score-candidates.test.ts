import { beforeEach, describe, expect, it, vi } from 'vitest'
import { buildFinalBgmMusicRequests } from '@/lib/bgm-score/prompt'
import { createTestContinuityPlan, TEST_CLOCK } from '../audio-design/audio-timeline-fixture'

const generateMusicMock = vi.hoisted(() => vi.fn())
const loadGeneratedAudioBufferMock = vi.hoisted(() => vi.fn())
const decodeMonoFloat32Mock = vi.hoisted(() => vi.fn())
const uploadGeneratedAudioMock = vi.hoisted(() => vi.fn())
const conformScoreDurationMock = vi.hoisted(() => vi.fn())

vi.mock('@/lib/ai-exec/engine', () => ({ generateMusic: generateMusicMock }))
vi.mock('@/lib/bgm-score/audio-assets', () => ({
  loadGeneratedAudioBuffer: loadGeneratedAudioBufferMock,
  decodeMonoFloat32: decodeMonoFloat32Mock,
  uploadGeneratedAudio: uploadGeneratedAudioMock,
}))
vi.mock('@/lib/audio-design/score-duration', () => ({ conformScoreDuration: conformScoreDurationMock }))

function richCandidate(): Float32Array {
  const sampleRate = 48_000
  const samples = new Float32Array(sampleRate * 10)
  const frequencies = [45, 120, 350, 1_200, 3_500, 8_000, 15_000]
  for (let index = 0; index < samples.length; index += 1) {
    samples[index] = frequencies.reduce(
      (sum, frequency) => sum + 0.5 * Math.sin(2 * Math.PI * frequency * index / sampleRate) / frequencies.length,
      0,
    )
  }
  return samples
}

describe('score candidate render strategies', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    generateMusicMock.mockResolvedValue({ success: true, audioBase64: 'YXVkaW8=', audioMimeType: 'audio/mpeg' })
    loadGeneratedAudioBufferMock.mockResolvedValue(Buffer.from('source-audio'))
    decodeMonoFloat32Mock.mockImplementation(async () => richCandidate())
    conformScoreDurationMock.mockResolvedValue({
      audio: Buffer.from('conformed-audio'),
      conformance: { sourceDurationSeconds: 10, tempoRatio: 1 },
    })
    uploadGeneratedAudioMock.mockImplementation(async () => {
      const index = uploadGeneratedAudioMock.mock.calls.length - 1
      return {
        mediaId: `media-${index}`,
        url: `/m/score-${index}`,
        storageKey: `music/score-${index}.mp3`,
        mimeType: 'audio/mpeg',
        durationMs: 10_000,
      }
    })
  })

  it('generates and persists one complete master for each planned strategy', async () => {
    const cue = createTestContinuityPlan().scoreCues[0]!
    const requests = buildFinalBgmMusicRequests({ cue, clock: TEST_CLOCK })
    const progress: number[] = []
    const { generateScoreCandidates } = await import('@/lib/bgm-score/score-candidates')

    const result = await generateScoreCandidates({
      userId: 'user-1',
      musicModel: 'fal::fal-ai/lyria3/pro',
      requests,
      providerDurationSeconds: 10,
      timelineDurationSeconds: 10,
      bpm: 60,
      outputFormat: 'mp3',
      spec: cue.musicTheorySpec,
      workspaceDir: '/tmp/audio-score-test',
      reusableCandidates: [],
      onProgress: async (candidates) => { progress.push(candidates.length) },
    })

    expect(generateMusicMock).toHaveBeenCalledTimes(4)
    expect(generateMusicMock.mock.calls.map((call) => call[3]?.negativePrompt)).toEqual(
      requests.map((request) => request.negativePrompt),
    )
    expect(result.candidates.map((candidate) => candidate.renderStrategy)).toEqual(
      cue.musicTheorySpec.renderStrategies,
    )
    expect(result.candidates.every((candidate) => candidate.quality.spectralCoverage >= 3)).toBe(true)
    expect(result.candidates.filter((candidate) => candidate.selected)).toHaveLength(1)
    expect(progress).toEqual([1, 2, 3, 4, 4])
  })
})
