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

import { executeFalMusicGeneration } from '@/lib/ai-providers/fal/music'

describe('FAL Lyria music request contract', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.stubGlobal('fetch', fetchMock)
  })

  it('forwards the technical exclusion plan as negative_prompt', async () => {
    fetchMock
      .mockResolvedValueOnce(new Response(JSON.stringify({ request_id: 'request-1' }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ status: 'COMPLETED' }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        audio: { url: 'https://cdn.example.com/score.mp3', content_type: 'audio/mpeg' },
      }), { status: 200 }))

    await executeFalMusicGeneration({
      userId: 'user-1',
      selection: {
        provider: 'fal',
        modelId: 'fal-ai/lyria3/pro',
        modelKey: 'fal::fal-ai/lyria3/pro',
        variantSubKind: 'official',
      },
      prompt: 'Instrumental through composed underscore with weakened pitch field.',
      options: {
        negativePrompt: 'heroic brass, triumphant rhythm, authentic cadences',
        durationSeconds: 60,
        vocalMode: 'instrumental',
        bpm: 58,
        outputFormat: 'mp3',
      },
    })

    const request = fetchMock.mock.calls[0]?.[1] as RequestInit | undefined
    expect(JSON.parse(String(request?.body))).toEqual({
      prompt: [
        'Instrumental through composed underscore with weakened pitch field.',
        'Target duration: 60 seconds',
        'BPM: 58',
        'Instrumental only. Do not include vocals or lyrics.',
        'Output format: mp3',
      ].join('\n'),
      negative_prompt: 'heroic brass, triumphant rhythm, authentic cadences',
    })
  })

  it('keeps generic music requests working when no negative_prompt is supplied', async () => {
    fetchMock
      .mockResolvedValueOnce(new Response(JSON.stringify({ request_id: 'request-generic' }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ status: 'COMPLETED' }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        audio: { url: 'https://cdn.example.com/generic.mp3', content_type: 'audio/mpeg' },
      }), { status: 200 }))

    await executeFalMusicGeneration({
      userId: 'user-1',
      selection: {
        provider: 'fal',
        modelId: 'fal-ai/lyria3/pro',
        modelKey: 'fal::fal-ai/lyria3/pro',
        variantSubKind: 'official',
      },
      prompt: 'Instrumental technical score prompt.',
      options: { durationSeconds: 60 },
    })
    const request = fetchMock.mock.calls[0]?.[1] as RequestInit | undefined
    expect(JSON.parse(String(request?.body))).toEqual({
      prompt: 'Instrumental technical score prompt.\nTarget duration: 60 seconds',
    })
  })

  it('fails immediately instead of polling until timeout on a non-2xx status response', async () => {
    fetchMock
      .mockResolvedValueOnce(new Response(JSON.stringify({ request_id: 'request-2' }), { status: 200 }))
      .mockResolvedValueOnce(new Response('method not allowed', { status: 405 }))

    await expect(executeFalMusicGeneration({
      userId: 'user-1',
      selection: {
        provider: 'fal',
        modelId: 'fal-ai/lyria3/pro',
        modelKey: 'fal::fal-ai/lyria3/pro',
        variantSubKind: 'official',
      },
      prompt: 'Instrumental technical score prompt.',
      options: { negativePrompt: 'vocals, lyrics' },
    })).rejects.toThrow('FAL_MUSIC_STATUS_FAILED (405): method not allowed')
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })
})
