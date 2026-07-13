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
  beforeEach(() => vi.clearAllMocks())

  it('routes loopable ambience to ElevenLabs only', async () => {
    await generateAudioStem({
      userId: 'user-1',
      role: 'ambience',
      prompt: 'Seamless stadium crowd ambience.',
      outputFormat: 'mp3',
      durationSeconds: 20,
      promptInfluence: 0.75,
      loop: true,
    })

    expect(executeMediaGenerationMock).toHaveBeenCalledWith({
      modality: 'audio',
      userId: 'user-1',
      modelKey: 'elevenlabs::eleven_text_to_sound_v2',
      prompt: 'Seamless stadium crowd ambience.',
      options: {
        generationKind: 'ambience',
        outputFormat: 'mp3',
        durationSeconds: 20,
        promptInfluence: 0.75,
        loop: true,
      },
    })
  })

  it('routes the continuous master score to Lyria', async () => {
    await generateAudioStem({
      userId: 'user-1',
      role: 'bgm',
      prompt: 'Instrumental minimalist cinematic underscore.',
      negativePrompt: 'vocals, lyrics, literal sound effects',
      durationSeconds: 60,
      bpm: 60,
      outputFormat: 'mp3',
    })

    expect(executeMediaGenerationMock).toHaveBeenCalledWith({
      modality: 'music',
      userId: 'user-1',
      modelKey: 'fal::fal-ai/lyria3/pro',
      prompt: 'Instrumental minimalist cinematic underscore.',
      options: {
        negativePrompt: 'vocals, lyrics, literal sound effects',
        durationSeconds: 60,
        vocalMode: 'instrumental',
        bpm: 60,
        outputFormat: 'mp3',
      },
    })
  })
})
