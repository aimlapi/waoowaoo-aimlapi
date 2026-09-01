import type {
  AiProviderManifest,
  AiProviderManifestExtension,
} from '@/lib/ai-providers/manifest'

export interface EditionAiContract {
  readonly providerManifests: readonly AiProviderManifest[]
  readonly providerManifestExtensions: readonly AiProviderManifestExtension[]
  readonly apiConfig: {
    readonly featuredProviderKeys: readonly string[]
  }
}
