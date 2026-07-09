'use client'

import { useMemo } from 'react'
import type { CustomModel, Provider } from '../../api-config'
import {
  filterApiConfigModelProviders,
  groupEnabledApiConfigModelsByType,
  shouldExposeModelForProvider,
} from '../api-config-provider-filters'

interface UseApiConfigFiltersParams {
  providers: Provider[]
  models: CustomModel[]
}

export function useApiConfigFilters({
  providers,
  models,
}: UseApiConfigFiltersParams) {
  const modelProviders = useMemo(() => {
    return filterApiConfigModelProviders(providers, models)
  }, [models, providers])

  const enabledModelsByType = useMemo(() => {
    return groupEnabledApiConfigModelsByType(providers, models)
  }, [models, providers])

  const providersById = useMemo(() => new Map(providers.map((provider) => [provider.id, provider] as const)), [providers])

  return {
    modelProviders,
    getModelsForProvider: (providerId: string) =>
      models.filter((model) => model.provider === providerId && shouldExposeModelForProvider(providersById.get(providerId), model)),
    getEnabledModelsByType: (type: 'llm' | 'image' | 'video' | 'music' | 'audio') => enabledModelsByType[type],
  }
}
