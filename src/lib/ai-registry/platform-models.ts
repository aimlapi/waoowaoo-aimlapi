import type { DefaultModelsPayload } from '@/lib/user-api/api-config-types'
import type { PlatformModelPreset } from '@/lib/platform-models/types'
import { AI_PROVIDER_MANIFESTS } from '@/lib/ai-providers/manifests'

export type PlatformDefaultModelField = keyof Required<DefaultModelsPayload>

export function listPlatformModelInputs(): readonly PlatformModelPreset[] {
  return AI_PROVIDER_MANIFESTS.flatMap((manifest) => (
    manifest.catalogs.platformModels.map((model) => ({ ...model }))
  ))
}
