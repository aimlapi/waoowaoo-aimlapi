import { z } from 'zod'
import {
  ELEVENLABS_TEXT_TO_SOUND_V2_MODEL_ID,
} from '@/lib/ai-providers/elevenlabs/models'
import {
  FAL_LYRIA_3_PRO_MODEL_ID,
  FAL_XAI_TTS_MODEL_ID,
} from '@/lib/ai-providers/fal/models'
import {
  audioStemGenerationKindSchema,
  type AudioStemRole,
} from './types'

export const generativeAudioStemRoleSchema = z.enum([
  'dialogue',
  'foley',
  'spot_sfx',
  'ambience',
  'bgm',
])

export const audioStemModelConfigSchema = z.object({
  role: generativeAudioStemRoleSchema,
  provider: z.enum(['fal', 'elevenlabs']),
  modelId: z.string().trim().min(1),
  modelKey: z.string().trim().min(1),
  generationKind: audioStemGenerationKindSchema.exclude(['native_reference']),
})

export type GenerativeAudioStemRole = z.infer<typeof generativeAudioStemRoleSchema>
export type GenerativeAudioStemGenerationKind = Exclude<
  z.infer<typeof audioStemGenerationKindSchema>,
  'native_reference'
>
export type AudioStemModelConfig = z.infer<typeof audioStemModelConfigSchema>

function createProviderModelKey(provider: AudioStemModelConfig['provider'], modelId: string): string {
  return `${provider}::${modelId}`
}

function audioStemConfig(input: {
  readonly role: GenerativeAudioStemRole
  readonly provider: AudioStemModelConfig['provider']
  readonly modelId: string
  readonly generationKind: GenerativeAudioStemGenerationKind
}): AudioStemModelConfig {
  return audioStemModelConfigSchema.parse({
    role: input.role,
    provider: input.provider,
    modelId: input.modelId,
    modelKey: createProviderModelKey(input.provider, input.modelId),
    generationKind: input.generationKind,
  })
}

export const DEFAULT_AUDIO_STEM_MODEL_CONFIGS = {
  dialogue: audioStemConfig({
    role: 'dialogue',
    provider: 'fal',
    modelId: FAL_XAI_TTS_MODEL_ID,
    generationKind: 'dialogue_tts',
  }),
  foley: audioStemConfig({
    role: 'foley',
    provider: 'elevenlabs',
    modelId: ELEVENLABS_TEXT_TO_SOUND_V2_MODEL_ID,
    generationKind: 'foley',
  }),
  spot_sfx: audioStemConfig({
    role: 'spot_sfx',
    provider: 'elevenlabs',
    modelId: ELEVENLABS_TEXT_TO_SOUND_V2_MODEL_ID,
    generationKind: 'spot_sfx',
  }),
  ambience: audioStemConfig({
    role: 'ambience',
    provider: 'elevenlabs',
    modelId: ELEVENLABS_TEXT_TO_SOUND_V2_MODEL_ID,
    generationKind: 'ambience',
  }),
  bgm: audioStemConfig({
    role: 'bgm',
    provider: 'fal',
    modelId: FAL_LYRIA_3_PRO_MODEL_ID,
    generationKind: 'music',
  }),
} as const satisfies Record<GenerativeAudioStemRole, AudioStemModelConfig>

export function resolveDefaultAudioStemModelConfig(role: AudioStemRole): AudioStemModelConfig | null {
  if (role === 'native_video') return null
  return DEFAULT_AUDIO_STEM_MODEL_CONFIGS[role]
}
