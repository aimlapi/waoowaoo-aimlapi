import type { AiProviderAdapter } from '@/lib/ai-providers/runtime-types'
import { describeMediaVariantBase } from '@/lib/ai-providers/shared/media-adapter'
import { executeElevenLabsAudioGeneration } from './audio'
import { resolveElevenLabsOptionSchema } from './models'

export const elevenLabsAdapter: AiProviderAdapter = {
  providerKey: 'elevenlabs',
  audio: {
    describe: (selection) => describeMediaVariantBase({
      modality: 'audio',
      selection,
      executionMode: 'sync',
      optionSchema: resolveElevenLabsOptionSchema(selection.modelId),
    }),
    execute: executeElevenLabsAudioGeneration,
  },
}
