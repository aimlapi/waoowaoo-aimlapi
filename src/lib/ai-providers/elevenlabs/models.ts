import type { AiOptionSchema } from '@/lib/ai-registry/types'
import type { PlatformModelPreset } from '@/lib/platform-models/types'
import {
  buildMediaOptionSchema,
  booleanValidator,
  enumValidator,
  numberRangeValidator,
} from '@/lib/ai-providers/shared/option-schema'

export const ELEVENLABS_TEXT_TO_SOUND_V2_MODEL_ID = 'eleven_text_to_sound_v2'
export const ELEVENLABS_TEXT_TO_SOUND_V2_GENERATION_KINDS = ['ambience'] as const

export const ELEVENLABS_PLATFORM_MODEL_PRESETS = [
  {
    provider: 'elevenlabs',
    modelId: ELEVENLABS_TEXT_TO_SOUND_V2_MODEL_ID,
    name: 'ElevenLabs Text to Sound v2',
    type: 'audio',
  },
] as const satisfies ReadonlyArray<PlatformModelPreset>

export const ELEVENLABS_BUILTIN_CAPABILITY_CATALOG_ENTRIES = [
  {
    modelType: 'audio',
    provider: 'elevenlabs',
    modelId: ELEVENLABS_TEXT_TO_SOUND_V2_MODEL_ID,
    capabilities: {
      audio: {
        generationKindOptions: ELEVENLABS_TEXT_TO_SOUND_V2_GENERATION_KINDS,
        outputFormatOptions: ['mp3'],
      },
    },
  },
] as const

export const ELEVENLABS_BUILTIN_PRICING_CATALOG_ENTRIES = [] as const

export const ELEVENLABS_API_CONFIG_CATALOG_MODELS = [
  {
    modelId: ELEVENLABS_TEXT_TO_SOUND_V2_MODEL_ID,
    name: 'ElevenLabs Text to Sound v2',
    type: 'audio',
    provider: 'elevenlabs',
  },
] as const

export function resolveElevenLabsOptionSchema(modelId: string): AiOptionSchema {
  if (modelId !== ELEVENLABS_TEXT_TO_SOUND_V2_MODEL_ID) {
    throw new Error(`ELEVENLABS_AUDIO_MODEL_UNSUPPORTED:${modelId}`)
  }
  return buildMediaOptionSchema('audio', {
    validators: {
      generationKind: enumValidator(ELEVENLABS_TEXT_TO_SOUND_V2_GENERATION_KINDS),
      outputFormat: enumValidator(['mp3']),
      durationSeconds: numberRangeValidator({ min: 0.5, max: 22 }),
      promptInfluence: numberRangeValidator({ min: 0, max: 1 }),
      loop: booleanValidator(),
    },
  })
}
