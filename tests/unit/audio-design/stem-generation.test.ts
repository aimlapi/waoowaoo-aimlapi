import { beforeEach, describe, expect, it, vi } from 'vitest'

const executeMediaGenerationMock = vi.hoisted(() => vi.fn(async () => ({
  success: true,
  audioUrl: 'https://cdn.example.com/stem.mp3',
})))

vi.mock('@/lib/ai-exec/engine', () => ({
  executeMediaGeneration: executeMediaGenerationMock,
}))

import { generateAudioStem } from '@/lib/audio-design/stem-generation'

describe('audio stem generation', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('routes dialogue stems to the FAL TTS audio executor', async () => {
    await generateAudioStem({
      userId: 'user-1',
      role: 'dialogue',
      prompt: 'Stay quiet.',
      voice: 'alloy',
      language: 'en',
      outputFormat: 'mp3',
    })

    expect(executeMediaGenerationMock).toHaveBeenCalledWith({
      modality: 'audio',
      userId: 'user-1',
      modelKey: 'fal::xai/tts/v1',
      prompt: 'Stay quiet.',
      options: {
        generationKind: 'dialogue_tts',
        voice: 'alloy',
        language: 'en',
        outputFormat: 'mp3',
      },
    })
  })

  it('routes spot sound effects to the Seed Audio executor', async () => {
    await generateAudioStem({
      userId: 'user-1',
      role: 'spot_sfx',
      prompt: 'A heavy wooden door slam.',
      outputFormat: 'wav',
      sampleRate: 48000,
    })

    expect(executeMediaGenerationMock).toHaveBeenCalledWith({
      modality: 'audio',
      userId: 'user-1',
      modelKey: 'fal::bytedance/seed-audio-1.0',
      prompt: 'A heavy wooden door slam.',
      options: {
        generationKind: 'spot_sfx',
        voice: undefined,
        outputFormat: 'wav',
        audioUrls: undefined,
        imageUrl: undefined,
        sampleRate: 48000,
        speed: undefined,
        volume: undefined,
        pitch: undefined,
      },
    })
  })

  it('routes BGM stems to the existing music executor', async () => {
    await generateAudioStem({
      userId: 'user-1',
      role: 'bgm',
      prompt: 'Continuous tense instrumental score.',
      durationSeconds: 60,
      genre: 'cinematic',
      mood: 'tense',
      bpm: 92,
      outputFormat: 'mp3',
    })

    expect(executeMediaGenerationMock).toHaveBeenCalledWith({
      modality: 'music',
      userId: 'user-1',
      modelKey: 'fal::fal-ai/lyria3/pro',
      prompt: 'Continuous tense instrumental score.',
      options: {
        durationSeconds: 60,
        vocalMode: 'instrumental',
        genre: 'cinematic',
        mood: 'tense',
        bpm: 92,
        outputFormat: 'mp3',
      },
    })
  })

  it('fails explicitly when dialogue stem voice is missing', async () => {
    await expect(generateAudioStem({
      userId: 'user-1',
      role: 'dialogue',
      prompt: 'Stay quiet.',
      voice: '',
    })).rejects.toThrow('AUDIO_STEM_DIALOGUE_VOICE_REQUIRED')
  })
})
