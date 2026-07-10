import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ProviderConfig } from '@/lib/user-api/runtime-config'
import { startScenarioServer } from '../../helpers/fakes/scenario-server'

const providerConfigMock = vi.hoisted(() => vi.fn())

vi.mock('@/lib/user-api/runtime-config', () => ({
  getProviderConfig: providerConfigMock,
}))

describe('provider contract - ElevenLabs ambience', () => {
  let server: Awaited<ReturnType<typeof startScenarioServer>> | null = null

  beforeEach(async () => {
    vi.clearAllMocks()
    server = await startScenarioServer()
    providerConfigMock.mockResolvedValue({
      id: 'elevenlabs',
      name: 'ElevenLabs',
      apiKey: 'eleven-key',
      baseUrl: server.baseUrl,
    } satisfies ProviderConfig)
  })

  afterEach(async () => {
    await server?.close()
    server = null
  })

  it('submits loopable ambience with the exact provider contract', async () => {
    server!.defineScenario({
      method: 'POST',
      path: '/v1/sound-generation',
      mode: 'success',
      submitResponse: {
        status: 200,
        headers: { 'content-type': 'audio/mpeg' },
        body: Buffer.from('ambience-audio'),
      },
    })
    const { executeElevenLabsAudioGeneration } = await import('@/lib/ai-providers/elevenlabs/audio')

    const result = await executeElevenLabsAudioGeneration({
      userId: 'user-1',
      selection: {
        provider: 'elevenlabs',
        modelId: 'eleven_text_to_sound_v2',
        modelKey: 'elevenlabs::eleven_text_to_sound_v2',
        variantSubKind: 'official',
      },
      prompt: 'Seamless indoor stadium crowd ambience, no speech, no music.',
      options: {
        generationKind: 'ambience',
        durationSeconds: 10,
        promptInfluence: 0.7,
        loop: true,
      },
    })

    expect(result).toMatchObject({ success: true, audioMimeType: 'audio/mpeg' })
    const requests = server!.getRequests('POST', '/v1/sound-generation')
    expect(requests).toHaveLength(1)
    expect(requests[0]?.headers['xi-api-key']).toBe('eleven-key')
    expect(JSON.parse(requests[0]?.bodyText || '{}')).toEqual({
      text: 'Seamless indoor stadium crowd ambience, no speech, no music.',
      model_id: 'eleven_text_to_sound_v2',
      duration_seconds: 10,
      prompt_influence: 0.7,
      loop: true,
    })
  })

  it('rejects physical action sound ownership before contacting ElevenLabs', async () => {
    const { executeElevenLabsAudioGeneration } = await import('@/lib/ai-providers/elevenlabs/audio')

    await expect(executeElevenLabsAudioGeneration({
      userId: 'user-1',
      selection: {
        provider: 'elevenlabs',
        modelId: 'eleven_text_to_sound_v2',
        modelKey: 'elevenlabs::eleven_text_to_sound_v2',
        variantSubKind: 'official',
      },
      prompt: 'A door slam.',
      options: { generationKind: 'foley', durationSeconds: 1 },
    })).rejects.toThrow('ELEVENLABS_AUDIO_GENERATION_KIND_UNSUPPORTED:foley')

    expect(server!.getRequests('POST', '/v1/sound-generation')).toHaveLength(0)
  })
})
