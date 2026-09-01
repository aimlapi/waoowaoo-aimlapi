'use client'

import { useMemo } from 'react'
import type { CustomModel, Provider } from '../../api-config'

interface UseApiConfigFiltersParams {
  providers: Provider[]
  models: CustomModel[]
}

interface EnabledModelOption extends CustomModel {
  providerName: string
}

const PROVIDER_MODEL_TYPES: Array<'llm' | 'image' | 'video' | 'music'> = ['llm', 'image', 'video', 'music']

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
  return isProviderModelType(model.type)
}

export function useApiConfigFilters({
  providers,
  models,
}: UseApiConfigFiltersParams) {
  const modelProviders = useMemo(() => {
    const modelProviderIds = new Set(models
      .filter((model) => isProviderModelType(model.type))
      .map((model) => model.provider))
    return providers.filter((provider) => modelProviderIds.has(provider.id))
  }, [models, providers])

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
      if (!provider?.enabled) continue
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
