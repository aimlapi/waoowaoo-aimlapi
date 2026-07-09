import { describe, expect, it, vi } from 'vitest'
import { testProviderConnection } from '@/lib/ai-exec/provider-test'

describe('provider connection diagnostics', () => {
  it('does not reject FAL keys through a no-spend remote probe', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch')

    const result = await testProviderConnection({
      apiType: 'fal',
      apiKey: 'fal-local-key',
    })

    expect(result.success).toBe(true)
    expect(result.steps).toEqual([
      {
        name: 'models',
        status: 'pass',
        message: 'FAL key saved; live FAL auth is verified when a generation request is submitted',
      },
      {
        name: 'imageGen',
        status: 'skip',
        message: 'Generation probe skipped to avoid spend',
      },
    ])
    expect(fetchSpy).not.toHaveBeenCalled()

    fetchSpy.mockRestore()
  })

  it('tests ElevenLabs keys through the no-spend user endpoint', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('{}', { status: 200 }))

    const result = await testProviderConnection({
      apiType: 'elevenlabs',
      apiKey: 'elevenlabs-local-key',
    })

    expect(result.success).toBe(true)
    expect(result.steps).toEqual([
      {
        name: 'credits',
        status: 'pass',
        message: 'ElevenLabs user endpoint ok',
      },
    ])
    expect(fetchSpy).toHaveBeenCalledWith('https://api.elevenlabs.io/v1/user', {
      method: 'GET',
      headers: {
        'xi-api-key': 'elevenlabs-local-key',
      },
    })

    fetchSpy.mockRestore()
  })

  it('reports ElevenLabs authentication failures without falling back to another provider', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('forbidden', { status: 403 }))

    const result = await testProviderConnection({
      apiType: 'elevenlabs',
      apiKey: 'wrong-key',
    })

    expect(result.success).toBe(false)
    expect(result.steps).toEqual([
      {
        name: 'credits',
        status: 'fail',
        message: 'Authentication failed (403)',
      },
    ])
    expect(fetchSpy).toHaveBeenCalledTimes(1)

    fetchSpy.mockRestore()
  })
})
