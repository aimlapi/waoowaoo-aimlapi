import type { CustomModel, Provider } from '../api-config/types'
import { getProviderKey } from '../api-config/types'

type ApiConfigProviderModelType = Extract<CustomModel['type'], 'llm' | 'image' | 'video' | 'music' | 'audio'>

export interface EnabledModelOption extends CustomModel {
  providerName: string
}

const PROVIDER_MODEL_TYPES: readonly ApiConfigProviderModelType[] = ['llm', 'image', 'video', 'music', 'audio']

function isProviderModelType(type: CustomModel['type']): type is ApiConfigProviderModelType {
  return PROVIDER_MODEL_TYPES.includes(type as ApiConfigProviderModelType)
}

function hasProviderApiKey(provider: Provider | undefined): boolean {
  if (!provider) return false
  if (provider.hasApiKey === true) return true
  const apiKey = typeof provider.apiKey === 'string' ? provider.apiKey.trim() : ''
  return apiKey.length > 0
}

export function deriveApiConfigModelProviderKeys(models: CustomModel[]): Set<string> {
  const keys = new Set<string>()
  for (const model of models) {
    if (isProviderModelType(model.type)) {
      keys.add(getProviderKey(model.provider))
    }
  }
  return keys
}

export function shouldExposeModelForProvider(provider: Provider | undefined, model: CustomModel): boolean {
  return !!provider && isProviderModelType(model.type)
}

export function filterApiConfigModelProviders(providers: Provider[], models: CustomModel[]): Provider[] {
  const modelProviderKeys = deriveApiConfigModelProviderKeys(models)
  return providers.filter((provider) => modelProviderKeys.has(getProviderKey(provider.id)))
}

export function groupEnabledApiConfigModelsByType(
  providers: Provider[],
  models: CustomModel[],
): Record<ApiConfigProviderModelType, EnabledModelOption[]> {
  const grouped: Record<ApiConfigProviderModelType, EnabledModelOption[]> = {
    llm: [],
    image: [],
    video: [],
    music: [],
    audio: [],
  }
  const providersById = new Map(providers.map((provider) => [provider.id, provider] as const))

  for (const model of models) {
    if (!model.enabled) continue
    if (!isProviderModelType(model.type)) continue
    const provider = providersById.get(model.provider)
    if (!provider) continue
    if (!hasProviderApiKey(provider)) continue
    if (!shouldExposeModelForProvider(provider, model)) continue

    grouped[model.type].push({
      ...model,
      providerName: provider.name || model.provider,
    })
  }

  return grouped
}
