import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { validateAiOptions } from '@/lib/ai-exec/normalize'
import { ensureAiCatalogsRegistered } from '@/lib/ai-exec/catalog-bootstrap'
import { openRouterAdapter } from '@/lib/ai-providers/openrouter/adapter'
import { executeOpenRouterImageGeneration } from '@/lib/ai-providers/openrouter/image'
import { startScenarioServer } from '../../helpers/fakes/scenario-server'

const getProviderConfigMock = vi.hoisted(() => vi.fn())

vi.mock('@/lib/user-api/runtime-config', () => ({
  getProviderConfig: getProviderConfigMock,
}))

describe('provider contract - openrouter image', () => {
  let server: Awaited<ReturnType<typeof startScenarioServer>> | null = null

  beforeEach(async () => {
    vi.clearAllMocks()
    ensureAiCatalogsRegistered()
    server = await startScenarioServer()
    getProviderConfigMock.mockResolvedValue({
      id: 'openrouter',
      name: 'openrouter',
      apiKey: 'openrouter-key',
      baseUrl: `${server.baseUrl}/openrouter`,
    })
  })

  afterEach(async () => {
    await server?.close()
    server = null
  })

  it('submits GPT Image 2 requests to OpenRouter images without unsupported size fields', async () => {
    server!.defineScenario({
      method: 'POST',
      path: '/openrouter/images',
      mode: 'success',
      submitResponse: {
        status: 200,
        body: {
          data: [{ b64_json: 'IMAGE_BASE64' }],
        },
      },
    })

    const result = await executeOpenRouterImageGeneration({
      userId: 'user-1',
      selection: {
        provider: 'openrouter',
        modelId: 'openai/gpt-image-2',
        modelKey: 'openrouter::openai/gpt-image-2',
        variantSubKind: 'official',
      },
      prompt: 'A cinematic character portrait.',
      options: {
        referenceImages: ['data:image/png;base64,REFERENCE'],
        aspectRatio: '16:9',
        resolution: '2K',
        quality: 'high',
        background: 'opaque',
        outputCompression: 85,
      },
    })

    expect(result).toEqual({
      success: true,
      imageBase64: 'IMAGE_BASE64',
      imageUrl: 'data:image/png;base64,IMAGE_BASE64',
      endpoint: 'images',
    })

    const requests = server!.getRequests('POST', '/openrouter/images')
    expect(requests).toHaveLength(1)
    expect(requests[0]?.headers.authorization).toBe('Bearer openrouter-key')
    expect(JSON.parse(requests[0]?.bodyText || '{}')).toEqual({
      model: 'openai/gpt-image-2',
      prompt: 'A cinematic character portrait.\n\nImage constraints: Use a 16:9 aspect ratio. Target 2K visual detail.',
      quality: 'high',
      background: 'opaque',
      output_compression: 85,
      input_references: [
        { type: 'image_url', image_url: { url: 'data:image/png;base64,REFERENCE' } },
      ],
    })
  })

  it('exposes an option schema for GPT Image 2 image controls', () => {
    const descriptor = openRouterAdapter.image?.describe({
      provider: 'openrouter',
      modelId: 'openai/gpt-image-2',
      modelKey: 'openrouter::openai/gpt-image-2',
      variantSubKind: 'official',
    })
    if (!descriptor) throw new Error('OPENROUTER_IMAGE_DESCRIPTOR_MISSING')

    expect(() => validateAiOptions({
      schema: descriptor.optionSchema,
      options: {
        referenceImages: ['data:image/png;base64,AAAA'],
        aspectRatio: '16:9',
        resolution: '2K',
        quality: 'medium',
        background: 'auto',
        outputCompression: 20,
      },
      context: 'image:openrouter::openai/gpt-image-2',
    })).not.toThrow()

    expect(() => validateAiOptions({
      schema: descriptor.optionSchema,
      options: {
        quality: 'ultra',
      },
      context: 'image:openrouter::openai/gpt-image-2',
    })).toThrow('AI_OPTION_INVALID:image:openrouter::openai/gpt-image-2:quality:unsupported_value=ultra')
  })
})
