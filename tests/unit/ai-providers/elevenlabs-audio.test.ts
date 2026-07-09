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
      prompt: 'A sharp metal dental tool taps against a tooth enamel surface.',
      options: {
        generationKind: 'spot_sfx',
        durationSeconds: 2.5,
        promptInfluence: 0.8,
        loop: false,
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
      text: 'A sharp metal dental tool taps against a tooth enamel surface.',
      model_id: 'eleven_text_to_sound_v2',
      duration_seconds: 2.5,
      prompt_influence: 0.8,
      loop: false,
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

  it('accepts Foley and ambience sound generation kinds', async () => {
    fetchMock
      .mockResolvedValueOnce(new Response(new Uint8Array([1]), { status: 200 }))
      .mockResolvedValueOnce(new Response(new Uint8Array([2]), { status: 200 }))

    const generationKinds = ['foley', 'ambience'] as const
    for (const generationKind of generationKinds) {
      await executeElevenLabsAudioGeneration({
        userId: 'user-1',
        selection: {
          provider: 'elevenlabs',
          modelId: 'eleven_text_to_sound_v2',
          modelKey: 'elevenlabs::eleven_text_to_sound_v2',
          variantSubKind: 'official',
        },
        prompt: `${generationKind} prompt.`,
        options: {
          generationKind,
        },
      })
    }

    expect(readSubmittedJson(0)).toEqual({
      text: 'foley prompt.',
      model_id: 'eleven_text_to_sound_v2',
    })
    expect(readSubmittedJson(1)).toEqual({
      text: 'ambience prompt.',
      model_id: 'eleven_text_to_sound_v2',
    })
  })

  it('fails explicitly when a non sound-design generation kind is requested', async () => {
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
        generationKind: 'dialogue_tts',
      },
    })).rejects.toThrow('ELEVENLABS_AUDIO_GENERATION_KIND_UNSUPPORTED:dialogue_tts')
  })
})
