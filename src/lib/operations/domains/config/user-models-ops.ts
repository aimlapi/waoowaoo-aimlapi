import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { getDeploymentConfig, isPlatformProviderCredentialMode } from '@/lib/deployment/config'
import { getPlatformDefaultModelCatalog } from '@/lib/platform-models/catalog'
import {
  type CapabilityValue,
  type ModelCapabilities,
  type UnifiedModelType,
} from '@/lib/ai-registry/types'
import { ensureAiCatalogsRegistered } from '@/lib/ai-exec/catalog-bootstrap'
import { findBuiltinCapabilities } from '@/lib/ai-registry/capabilities-catalog'
import { findBuiltinPricingCatalogEntry } from '@/lib/ai-registry/pricing-catalog'
import { type VideoPricingTier } from '@/lib/ai-registry/video-capabilities'
import type { ProjectAgentOperationRegistryDraft } from '@/lib/operations/types'
import { projectEffectiveMediaCapabilities } from '@/lib/ai-exec/media-input-transport'
import type { StoredModel, StoredProvider } from '@/lib/user-api/api-config-types'
import { parseStoredModels } from '@/lib/user-api/api-config-model-normalization'
import { parseStoredProviders } from '@/lib/user-api/api-config-provider-normalization'
import { filterEffectiveModels, isStoredProviderEffective } from '@/lib/user-api/effective-config'

interface UserModelOption {
  value: string
  label: string
  provider?: string
  providerName?: string
  capabilities?: ModelCapabilities
  videoPricingTiers?: VideoPricingTier[]
}

interface UserModelsPayload {
  llm: UserModelOption[]
  image: UserModelOption[]
  video: UserModelOption[]
  music: UserModelOption[]
}

type SelectableUserModelType = Exclude<UnifiedModelType, 'voice'>

function isSelectableUserModelType(type: unknown): type is SelectableUserModelType {
  return (
    type === 'llm'
    || type === 'image'
    || type === 'video'
    || type === 'music'
  )
}

function toModelKey(model: StoredModel): string {
  return model.modelKey
}

function toProvider(model: StoredModel): string | undefined {
  return model.provider
}

function toModelId(model: StoredModel): string {
  return model.modelId
}

function toDisplayLabel(model: StoredModel, fallbackModelId: string): string {
  if (typeof model.name === 'string' && model.name.trim()) return model.name.trim()
  return fallbackModelId
}

function dedupeByModelKey(items: UserModelOption[]): UserModelOption[] {
  const seen = new Set<string>()
  return items.filter((item) => {
    if (seen.has(item.value)) return false
    seen.add(item.value)
    return true
  })
}

function cloneVideoPricingTiers(rawTiers: Array<{ when: Record<string, CapabilityValue> }>): VideoPricingTier[] {
  return rawTiers.map((tier) => ({
    when: { ...tier.when },
  }))
}

async function resolveModelSource(userId: string): Promise<{
  deploymentMode: 'platform-key' | 'user-key'
  models: StoredModel[]
  providers: StoredProvider[]
}> {
  const deployment = getDeploymentConfig()
  if (isPlatformProviderCredentialMode(deployment)) {
    return {
      deploymentMode: 'platform-key',
      models: getPlatformDefaultModelCatalog(),
      providers: [],
    }
  }

  const pref = await prisma.userPreference.findUnique({
    where: { userId },
    select: { customModels: true, customProviders: true },
  })

  const providers = parseStoredProviders(pref?.customProviders)
  return {
    deploymentMode: 'user-key',
    models: filterEffectiveModels(parseStoredModels(pref?.customModels), providers),
    providers: providers.filter(isStoredProviderEffective),
  }
}

export function createUserModelsOperations(): ProjectAgentOperationRegistryDraft {
  ensureAiCatalogsRegistered()
  return {
    list_user_models: {
      id: 'list_user_models',
      summary: 'List runtime-enabled models for config dropdowns.',
      intent: 'query',
      effects: {
        writes: false,
        billable: false,
        destructive: false,
        overwrite: false,
        bulk: false,
        externalSideEffects: false,
        longRunning: false,
      },
      inputSchema: z.object({}).passthrough(),
      outputSchema: z.unknown(),
      execute: async (ctx) => {
        const modelSource = await resolveModelSource(ctx.userId)
        const providerNameMap = new Map<string, string>()
        const providerIdsWithApiKey = new Set<string>()
        modelSource.providers.forEach((provider) => {
          const providerId = typeof provider?.id === 'string' ? provider.id.trim() : ''
          if (!providerId) return

          if (provider?.name && typeof provider.name === 'string') {
            providerNameMap.set(providerId, provider.name)
          }
          if (isStoredProviderEffective(provider)) providerIdsWithApiKey.add(providerId)
        })

        const grouped: UserModelsPayload = {
          llm: [],
          image: [],
          video: [],
          music: [],
        }

        for (const model of modelSource.models) {
          if (!isSelectableUserModelType(model.type)) continue

          const modelType = model.type
          const modelKey = toModelKey(model)
          if (!modelKey) continue

          const provider = toProvider(model)
          if (!provider) continue
          if (modelSource.deploymentMode !== 'platform-key' && !providerIdsWithApiKey.has(provider)) continue
          const modelId = toModelId(model)
          const option: UserModelOption = {
            value: modelKey,
            label: toDisplayLabel(model, modelId || modelKey),
            provider,
            providerName: provider ? providerNameMap.get(provider) : undefined,
          }

          if (provider && modelId) {
            const capabilities = findBuiltinCapabilities(modelType, provider, modelId)
            if (capabilities) {
              option.capabilities = projectEffectiveMediaCapabilities(
                modelType,
                modelKey,
                capabilities,
              )
            }

            if (modelType === 'video') {
              const pricingEntry = findBuiltinPricingCatalogEntry('video', provider, modelId)
              if (pricingEntry?.retail.mode === 'capability' && Array.isArray(pricingEntry.retail.tiers)) {
                option.videoPricingTiers = cloneVideoPricingTiers(pricingEntry.retail.tiers)
              }
            }
          }

          grouped[modelType].push(option)
        }

        return {
          llm: dedupeByModelKey(grouped.llm),
          image: dedupeByModelKey(grouped.image),
          video: dedupeByModelKey(grouped.video),
          music: dedupeByModelKey(grouped.music),
        } satisfies UserModelsPayload
      },
    },
  }
}
