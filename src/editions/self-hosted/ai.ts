import type { EditionAiContract } from '@/lib/edition/contracts/ai'

export const editionAi = {
  providerManifests: [],
  providerManifestExtensions: [],
  apiConfig: {
    featuredProviderKeys: ['openrouter', 'ark'],
  },
} satisfies EditionAiContract
