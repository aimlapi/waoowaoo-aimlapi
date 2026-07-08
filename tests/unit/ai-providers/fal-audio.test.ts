import { beforeEach, describe, expect, it, vi } from 'vitest'

const getProviderConfigMock = vi.hoisted(() => vi.fn(async () => ({
  id: 'fal',
  name: 'fal',
  apiKey: 'fal-key',
})))

const fetchMock = vi.hoisted(() => vi.fn())

vi.mock('@/lib/user-api/runtime-config', () => ({
  getProviderConfig: getProviderConfigMock,
}))

import { executeFalAudioGeneration } from '@/lib/ai-providers/fal/audio'

function readSubmittedJson(): unknown {
  const init = fetchMock.mock.calls[0]?.[1] as RequestInit | undefined
  return JSON.parse(String(init?.body || '{}')) as unknown
}

describe('fal audio generation', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.stubGlobal('fetch', fetchMock)
  })

  it('submits xAI TTS dialogue payloads and returns the completed audio URL', async () => {
    fetchMock
      .mockResolvedValueOnce(new Response(JSON.stringify({ request_id: 'req-tts-1' }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        status: 'COMPLETED',
        response_url: 'https://queue.fal.run/xai/tts/v1/requests/req-tts-1',
      }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        audio: {
          url: 'https://cdn.example.com/dialogue.mp3',
          content_type: 'audio/mpeg',
        },
      }), { status: 200 }))

    const result = await executeFalAudioGeneration({
      userId: 'user-1',
      selection: {
        provider: 'fal',
        modelId: 'xai/tts/v1',
        modelKey: 'fal::xai/tts/v1',
        variantSubKind: 'official',
      },
      prompt: 'Stay quiet.',
      options: {
        voice: 'alloy',
        language: 'en',
        outputFormat: 'mp3',
      },
    })

    expect(fetchMock).toHaveBeenNthCalledWith(1, 'https://queue.fal.run/xai/tts/v1', expect.objectContaining({
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Key fal-key',
      },
    }))
    expect(readSubmittedJson()).toEqual({
      text: 'Stay quiet.',
      voice: 'alloy',
      language: 'en',
      output_format: 'mp3',
    })
    expect(result.audioUrl).toBe('https://cdn.example.com/dialogue.mp3')
  })

  it('submits Seed Audio sound payloads with explicit stem controls', async () => {
    fetchMock
      .mockResolvedValueOnce(new Response(JSON.stringify({ request_id: 'req-sfx-1' }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ status: 'COMPLETED' }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        audio: 'https://cdn.example.com/sfx.wav',
      }), { status: 200 }))

    await executeFalAudioGeneration({
      userId: 'user-1',
      selection: {
        provider: 'fal',
        modelId: 'bytedance/seed-audio-1.0',
        modelKey: 'fal::bytedance/seed-audio-1.0',
        variantSubKind: 'official',
      },
      prompt: 'A heavy wooden door slam in a wide concrete hall.',
      options: {
        outputFormat: 'wav',
        audioUrls: ['https://cdn.example.com/ref.wav'],
        sampleRate: 48000,
        speed: 1,
        volume: 1.2,
        pitch: -2,
      },
    })

    expect(readSubmittedJson()).toEqual({
      prompt: 'A heavy wooden door slam in a wide concrete hall.',
      output_format: 'wav',
      sample_rate: 48000,
      speed: 1,
      volume: 1.2,
      pitch: -2,
      audio_urls: ['https://cdn.example.com/ref.wav'],
    })
  })

  it('fails explicitly when dialogue TTS has no voice', async () => {
    await expect(executeFalAudioGeneration({
      userId: 'user-1',
      selection: {
        provider: 'fal',
        modelId: 'xai/tts/v1',
        modelKey: 'fal::xai/tts/v1',
        variantSubKind: 'official',
      },
      prompt: 'Stay quiet.',
      options: {},
    })).rejects.toThrow('FAL_AUDIO_TTS_VOICE_REQUIRED')
  })
})
