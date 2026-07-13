import {
  beforeEach,
  describe,
  ensureAiCatalogsRegistered,
  expect,
  fetchMock,
  it,
  requestUrlOf,
  testProviderConnection,
  vi,
} from './provider-gateway-dispatch.fixture'

describe('provider contract - gateway dispatch (connection tests, session, capabilities)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    ensureAiCatalogsRegistered()
  })

  describe('testProviderConnection routes through provider diagnose testers', () => {
    it('skips text generation when the Ark models probe fails', async () => {
      fetchMock.mockResolvedValueOnce(new Response('nope', { status: 401 }))

      const result = await testProviderConnection({ apiType: 'ark', apiKey: 'sk-ark' })

      expect(result.success).toBe(false)
      expect(result.steps).toEqual([
        { name: 'models', status: 'fail', message: 'Authentication failed - check API Key' },
        {
          name: 'textGen',
          status: 'skip',
          message: 'Skipped because models probe failed',
          model: 'doubao-seed-2-0-lite-260215',
        },
      ])
      const url = requestUrlOf(fetchMock.mock.calls[0] as [RequestInfo | URL, RequestInit?])
      expect(url).toBe('https://ark.cn-beijing.volces.com/api/v3/models')
    })

    it('probes FAL with an OPTIONS credential check and skips paid generation', async () => {
      fetchMock.mockResolvedValueOnce(new Response(null, { status: 200 }))

      const result = await testProviderConnection({ apiType: 'fal', apiKey: 'fal-key' })

      expect(result.success).toBe(true)
      expect(result.steps).toEqual([
        { name: 'models', status: 'pass', message: 'FAL credential accepted for provider probe' },
        { name: 'imageGen', status: 'skip', message: 'Generation probe skipped to avoid spend' },
      ])
      const [input, init] = fetchMock.mock.calls[0] as [RequestInfo | URL, RequestInit]
      expect(String(input)).toBe('https://fal.run/fal-ai/flux/dev')
      expect(init.method).toBe('OPTIONS')
      expect(init.headers).toEqual({ Authorization: 'Key fal-key' })
    })

    it('classifies FAL credential rejections as authentication failures', async () => {
      fetchMock.mockResolvedValueOnce(new Response(null, { status: 403 }))

      const result = await testProviderConnection({ apiType: 'fal', apiKey: 'bad' })

      expect(result.success).toBe(false)
      expect(result.steps).toEqual([
        { name: 'models', status: 'fail', message: 'Authentication failed (403)' },
      ])
    })

    it('reports unsupported providers without a diagnose tester', async () => {
      const elevenlabs = await testProviderConnection({ apiType: 'elevenlabs', apiKey: 'k' })
      expect(elevenlabs).toEqual({
        success: false,
        steps: [{ name: 'models', status: 'fail', message: 'Unsupported API type: elevenlabs' }],
      })

      const unknown = await testProviderConnection({ apiType: 'nope', apiKey: 'k' })
      expect(unknown.steps[0]?.message).toBe('Unsupported API type: nope')
      expect(fetchMock.mock.calls).toEqual([])
    })
  })
})
