import { afterEach, describe, expect, it, vi } from 'vitest'

const prismaMock = vi.hoisted(() => ({
  userPreference: {
    findUnique: vi.fn(),
    upsert: vi.fn(),
  },
}))

const getBillingModeMock = vi.hoisted(() => vi.fn(async () => 'OFF'))

vi.mock('@/lib/prisma', () => ({
  prisma: prismaMock,
}))

vi.mock('@/lib/crypto-utils', () => ({
  encryptApiKey: (value: string) => `enc:${value}`,
  decryptApiKey: (value: string) => value.replace(/^enc:/, ''),
}))

vi.mock('@/lib/billing/mode', () => ({
  getBillingMode: getBillingModeMock,
}))

function resetEnv() {
  delete process.env.DEPLOYMENT_EDITION
  delete process.env.PROVIDER_CREDENTIAL_MODE
}

function readStoredProviders(): Array<Record<string, unknown>> {
  const firstCall = prismaMock.userPreference.upsert.mock.calls[0]
  if (!firstCall) throw new Error('expected userPreference.upsert to be called')
  const payload = firstCall[0] as { update?: { customProviders?: unknown } }
  if (typeof payload.update?.customProviders !== 'string') {
    throw new Error('expected update.customProviders to be a JSON string')
  }
  const parsed = JSON.parse(payload.update.customProviders) as unknown
  if (!Array.isArray(parsed)) throw new Error('expected customProviders to parse as an array')
  return parsed as Array<Record<string, unknown>>
}

describe('ElevenLabs API config', () => {
  afterEach(() => {
    vi.clearAllMocks()
    resetEnv()
  })

  it('saves ElevenLabs provider config and reads it through the runtime provider resolver', async () => {
    resetEnv()
    prismaMock.userPreference.findUnique.mockResolvedValueOnce({
      customProviders: null,
      customModels: null,
    })
    prismaMock.userPreference.upsert.mockResolvedValue({ id: 'pref-1' })

    const { putUserApiConfig } = await import('@/lib/user-api/api-config-service')
    const { getProviderConfig } = await import('@/lib/user-api/runtime-config')

    await expect(putUserApiConfig('user-1', {
      providers: [{
        id: 'elevenlabs',
        name: 'ElevenLabs',
        apiKey: 'sk-elevenlabs',
      }],
    })).resolves.toEqual({ success: true })

    const storedProviders = readStoredProviders()
    expect(storedProviders).toEqual([{
      id: 'elevenlabs',
      name: 'ElevenLabs',
      hidden: false,
      apiKey: 'enc:sk-elevenlabs',
    }])

    prismaMock.userPreference.findUnique.mockResolvedValueOnce({
      customProviders: JSON.stringify(storedProviders),
      customModels: null,
    })

    await expect(getProviderConfig('user-1', 'elevenlabs')).resolves.toEqual({
      id: 'elevenlabs',
      name: 'ElevenLabs',
      apiKey: 'sk-elevenlabs',
    })
  })
})
