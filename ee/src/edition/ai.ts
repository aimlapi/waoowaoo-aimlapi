import { toonflowProviderManifest } from '@ee/ai-providers/toonflow/manifest'
import type { EditionAiContract } from '@/lib/edition/contracts/ai'

export const editionAi = {
  providerManifests: [toonflowProviderManifest],
  providerManifestExtensions: [],
  apiConfig: {
    featuredProviderKeys: [],
  },
} satisfies EditionAiContract
