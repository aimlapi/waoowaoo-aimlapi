import { beforeEach, describe, expect, it, vi } from 'vitest'

const getProviderConfigMock = vi.hoisted(() => vi.fn(async () => ({
  id: 'elevenlabs',
  name: 'ElevenLabs',
  apiKey: 'eleven-key',
})))

const fetchMock = vi.hoisted(() => vi.fn())

vi.mock('@/lib/user-api/runtime-config', () => ({
  getProviderConfig: getProviderConfigMock,
}))

import { executeElevenLabsAudioGeneration } from '@/lib/ai-providers/elevenlabs/audio'

function readSubmittedJson(callIndex = 0): unknown {
  const init = fetchMock.mock.calls[callIndex]?.[1] as RequestInit | undefined
  return JSON.parse(String(init?.body || '{}')) as unknown
}

describe('ElevenLabs audio generation', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.stubGlobal('fetch', fetchMock)
  })

  it('submits sound generation payloads with the user API key and returns MP3 audio', async () => {
    fetchMock.mockResolvedValueOnce(new Response(
      new Uint8Array([1, 2, 3]),
      {
        status: 200,
        headers: {
          'content-type': 'audio/mpeg',
        },
      },
    ))

    const result = await executeElevenLabsAudioGeneration({
      userId: 'user-1',
      selection: {
        provider: 'elevenlabs',
        modelId: 'eleven_text_to_sound_v2',
        modelKey: 'elevenlabs::eleven_text_to_sound_v2',
        variantSubKind: 'official',
      },
      prompt: 'Seamless loopable indoor stadium crowd ambience.',
      options: {
        generationKind: 'ambience',
        durationSeconds: 20,
        promptInfluence: 0.8,
        loop: true,
      },
    })

    expect(fetchMock).toHaveBeenCalledWith('https://api.elevenlabs.io/v1/sound-generation', expect.objectContaining({
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'audio/mpeg',
        'xi-api-key': 'eleven-key',
      },
    }))
    expect(readSubmittedJson()).toEqual({
      text: 'Seamless loopable indoor stadium crowd ambience.',
      model_id: 'eleven_text_to_sound_v2',
      duration_seconds: 20,
      prompt_influence: 0.8,
      loop: true,
    })
    expect(result).toEqual({
      success: true,
      audioBase64: 'AQID',
      audioMimeType: 'audio/mpeg',
      audioUrl: 'data:audio/mpeg;base64,AQID',
      metadata: {
        model: 'eleven_text_to_sound_v2',
      },
    })
  })

  it('fails explicitly when Foley is routed to ElevenLabs', async () => {
    await expect(executeElevenLabsAudioGeneration({
      userId: 'user-1',
      selection: {
        provider: 'elevenlabs',
        modelId: 'eleven_text_to_sound_v2',
        modelKey: 'elevenlabs::eleven_text_to_sound_v2',
        variantSubKind: 'official',
      },
      prompt: 'Room tone.',
      options: {
        generationKind: 'foley',
      },
    })).rejects.toThrow('ELEVENLABS_AUDIO_GENERATION_KIND_UNSUPPORTED:foley')
  })
})
