import { describe, expect, it } from 'vitest'
import { ApiError } from '@/lib/api-errors'
import type { StoredModel, StoredProvider } from '@/lib/user-api/api-config-types'
import {
  filterEffectiveModels,
  listDisabledProviderKeys,
} from '@/lib/user-api/effective-config'

function provider(input: Partial<StoredProvider> & Pick<StoredProvider, 'id' | 'enabled'>): StoredProvider {
  return {
    id: input.id,
    name: input.name ?? input.id,
    enabled: input.enabled,
    ...(input.apiKey ? { apiKey: input.apiKey } : {}),
  }
}

function model(providerId: string, modelId: string): StoredModel {
  return {
    provider: providerId,
    modelId,
    modelKey: `${providerId}::${modelId}`,
    name: modelId,
    type: 'llm',
    price: 0,
  }
}

describe('effective user AI configuration', () => {
  it('exposes models only when the provider is explicitly enabled and credential-ready', () => {
    const models = [model('openrouter', 'alpha'), model('ark', 'beta')]
    const providers = [
      provider({ id: 'openrouter', enabled: true, apiKey: 'encrypted-key' }),
      provider({ id: 'ark', enabled: false }),
    ]

    expect(filterEffectiveModels(models, providers).map((entry) => entry.modelKey))
      .toEqual(['openrouter::alpha'])
  })

  it('rejects an enabled provider without a stored credential', () => {
    expect(() => filterEffectiveModels(
      [model('ark', 'beta')],
      [provider({ id: 'ark', enabled: true })],
    )).toThrowError(ApiError)

    try {
      filterEffectiveModels(
        [model('ark', 'beta')],
        [provider({ id: 'ark', enabled: true })],
      )
      throw new Error('EXPECTED_PROVIDER_API_KEY_REQUIRED')
    } catch (error: unknown) {
      expect(error).toBeInstanceOf(ApiError)
      expect((error as ApiError).details).toMatchObject({
        code: 'PROVIDER_API_KEY_REQUIRED',
        providerId: 'ark',
      })
    }
  })

  it('identifies only enabled-to-disabled transitions for in-use validation', () => {
    expect(listDisabledProviderKeys(
      [
        provider({ id: 'openrouter', enabled: true, apiKey: 'encrypted-key' }),
        provider({ id: 'ark', enabled: false }),
      ],
      [
        provider({ id: 'openrouter', enabled: false, apiKey: 'encrypted-key' }),
        provider({ id: 'ark', enabled: false }),
      ],
    )).toEqual(['openrouter'])
  })
})
