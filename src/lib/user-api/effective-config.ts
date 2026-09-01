import { ApiError } from '@/lib/api-errors'
import type { StoredModel, StoredProvider } from '@/lib/user-api/api-config-types'
import { resolveProviderByIdOrKey } from '@/lib/user-api/api-config-provider-normalization'

export function hasStoredProviderCredential(provider: StoredProvider): boolean {
  return typeof provider.apiKey === 'string' && provider.apiKey.trim().length > 0
}

export function assertEnabledProvidersReady(providers: readonly StoredProvider[]): void {
  for (let index = 0; index < providers.length; index += 1) {
    const provider = providers[index]
    if (!provider.enabled || hasStoredProviderCredential(provider)) continue
    throw new ApiError('INVALID_PARAMS', {
      code: 'PROVIDER_API_KEY_REQUIRED',
      field: `providers[${index}].apiKey`,
      providerId: provider.id,
    })
  }
}

export function isStoredProviderEffective(provider: StoredProvider): boolean {
  return provider.enabled && hasStoredProviderCredential(provider)
}

export function filterEffectiveModels(
  models: readonly StoredModel[],
  providers: readonly StoredProvider[],
): StoredModel[] {
  assertEnabledProvidersReady(providers)
  return models.filter((model) => {
    const provider = resolveProviderByIdOrKey(providers, model.provider)
    if (!provider) {
      throw new ApiError('INVALID_PARAMS', {
        code: 'MODEL_PROVIDER_NOT_FOUND',
        field: 'customModels',
        modelKey: model.modelKey,
      })
    }
    return isStoredProviderEffective(provider)
  })
}

export function listDisabledProviderKeys(
  previousProviders: readonly StoredProvider[],
  nextProviders: readonly StoredProvider[],
): string[] {
  const disabled = new Set<string>()
  for (const previous of previousProviders) {
    if (!previous.enabled) continue
    const next = resolveProviderByIdOrKey(nextProviders, previous.id)
    if (!next?.enabled) disabled.add(previous.id)
  }
  return [...disabled]
}
