import { toonflowAdapter } from '@ee/ai-providers/toonflow/adapter'
import { toonflowAsyncTaskProvider } from '@ee/ai-providers/toonflow/async-task'
import {
  TOONFLOW_API_CONFIG_CATALOG_MODELS,
  TOONFLOW_BUILTIN_CAPABILITY_CATALOG_ENTRIES,
  TOONFLOW_BUILTIN_PRICING_CATALOG_ENTRIES,
  TOONFLOW_PLATFORM_MODEL_PRESETS,
} from '@ee/ai-providers/toonflow/models'
import { defineAiProviderManifest } from '@/lib/ai-providers/manifest'

const PUBLIC_HTTPS_ONLY = ['public-https'] as const

export const toonflowProviderManifest = defineAiProviderManifest({
  providerKey: 'toonflow',
  adapter: toonflowAdapter,
  apiConfig: {
    name: 'Toonflow',
    baseUrl: 'https://api.toonflow.net/v1',
  },
  platformCredentials: { envPrefix: 'PLATFORM_TOONFLOW' },
  asyncTasks: [toonflowAsyncTaskProvider],
  catalogs: {
    capabilities: TOONFLOW_BUILTIN_CAPABILITY_CATALOG_ENTRIES,
    pricing: TOONFLOW_BUILTIN_PRICING_CATALOG_ENTRIES,
    apiConfigModels: TOONFLOW_API_CONFIG_CATALOG_MODELS,
    platformModels: TOONFLOW_PLATFORM_MODEL_PRESETS,
  },
  mediaInputs: [
    {
      modality: 'video',
      transports: {
        image: PUBLIC_HTTPS_ONLY,
        audio: PUBLIC_HTTPS_ONLY,
        video: PUBLIC_HTTPS_ONLY,
      },
    },
  ],
})
