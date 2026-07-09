'use client'

import { useMemo } from 'react'
import type { CustomModel, Provider } from '../../api-config'
import { getProviderKey } from '../../api-config'

interface UseApiConfigFiltersParams {
  providers: Provider[]
  models: CustomModel[]
}

interface EnabledModelOption extends CustomModel {
  providerName: string
}

const ALWAYS_SHOW_PROVIDERS: string[] = ['elevenlabs']
const ALLOWED_PROVIDER_KEYS = new Set(['ark', 'openrouter', 'fal', 'google', 'elevenlabs'])
const PROVIDER_MODEL_TYPES: Array<'llm' | 'image' | 'video' | 'music'> = ['llm', 'image', 'video', 'music']
const MODEL_PROVIDER_KEYS = [
  'ark',
  'google',
  'openrouter',
  'fal',
]

function isProviderModelType(type: CustomModel['type']): type is 'llm' | 'image' | 'video' | 'music' {
  return PROVIDER_MODEL_TYPES.includes(type as 'llm' | 'image' | 'video' | 'music')
}

function isDefaultModelType(type: CustomModel['type']): type is 'llm' | 'image' | 'video' | 'music' {
  return type === 'llm' || type === 'image' || type === 'video' || type === 'music'
}

function hasProviderApiKey(provider: Provider | undefined): boolean {
  if (!provider) return false
  if (provider.hasApiKey === true) return true
  const apiKey = typeof provider.apiKey === 'string' ? provider.apiKey.trim() : ''
  return apiKey.length > 0
}

function shouldExposeModelForProvider(provider: Provider | undefined, model: CustomModel): boolean {
  if (!provider) return false
  return ALLOWED_PROVIDER_KEYS.has(getProviderKey(provider.id)) && isProviderModelType(model.type)
}

function isPresetProvider(providerId: string) {
  return !providerId.includes(':')
}

export function filterModelProviders(input: {
  providers: Provider[]
  modelProviderKeys: ReadonlySet<string>
}): Provider[] {
  return input.providers.filter((provider) => {
    const providerKey = getProviderKey(provider.id)
    if (!ALLOWED_PROVIDER_KEYS.has(providerKey)) return false
    const isCustomProvider = !isPresetProvider(provider.id)

    return (
      (isCustomProvider && input.modelProviderKeys.has(providerKey)) ||
      input.modelProviderKeys.has(providerKey) ||
      ALWAYS_SHOW_PROVIDERS.includes(providerKey)
    )
  })
}

export function useApiConfigFilters({
  providers,
  models,
}: UseApiConfigFiltersParams) {
  const modelProviderKeys = useMemo(() => {
    const keys = new Set<string>(MODEL_PROVIDER_KEYS)
    models.forEach((model) => {
      if (!isProviderModelType(model.type)) return
      keys.add(getProviderKey(model.provider))
    })
    return keys
  }, [models])

  const modelProviders = useMemo(() => {
    return filterModelProviders({ providers, modelProviderKeys })
  }, [modelProviderKeys, providers])

  const enabledModelsByType = useMemo(() => {
    const grouped: Record<'llm' | 'image' | 'video' | 'music', EnabledModelOption[]> = {
      llm: [],
      image: [],
      video: [],
      music: [],
    }

    const providersById = new Map(providers.map((provider) => [provider.id, provider] as const))

    for (const model of models) {
      if (!model.enabled) continue
      if (!isDefaultModelType(model.type)) continue
      const provider = providersById.get(model.provider)
      if (!hasProviderApiKey(provider)) continue
      if (!shouldExposeModelForProvider(provider, model)) continue

      const option: EnabledModelOption = {
        ...model,
        providerName: provider?.name || model.provider,
      }

      grouped[model.type].push(option)
    }

    return grouped
  }, [models, providers])

  const providersById = useMemo(() => new Map(providers.map((provider) => [provider.id, provider] as const)), [providers])

  return {
    modelProviders,
    getModelsForProvider: (providerId: string) =>
      models.filter((model) => model.provider === providerId && shouldExposeModelForProvider(providersById.get(providerId), model)),
    getEnabledModelsByType: (type: 'llm' | 'image' | 'video' | 'music') => enabledModelsByType[type],
  }
}
