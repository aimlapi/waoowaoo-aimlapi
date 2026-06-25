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
})
