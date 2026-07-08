import { z } from 'zod'
import {
  FAL_LYRIA_3_PRO_MODEL_ID,
  FAL_SEED_AUDIO_MODEL_ID,
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
  provider: z.literal('fal'),
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

function createFalModelKey(modelId: string): string {
  return `fal::${modelId}`
}

function falAudioStemConfig(input: {
  readonly role: GenerativeAudioStemRole
  readonly modelId: string
  readonly generationKind: GenerativeAudioStemGenerationKind
}): AudioStemModelConfig {
  return audioStemModelConfigSchema.parse({
    role: input.role,
    provider: 'fal',
    modelId: input.modelId,
    modelKey: createFalModelKey(input.modelId),
    generationKind: input.generationKind,
  })
}

export const DEFAULT_AUDIO_STEM_MODEL_CONFIGS = {
  dialogue: falAudioStemConfig({
    role: 'dialogue',
    modelId: FAL_XAI_TTS_MODEL_ID,
    generationKind: 'dialogue_tts',
  }),
  foley: falAudioStemConfig({
    role: 'foley',
    modelId: FAL_SEED_AUDIO_MODEL_ID,
    generationKind: 'foley',
  }),
  spot_sfx: falAudioStemConfig({
    role: 'spot_sfx',
    modelId: FAL_SEED_AUDIO_MODEL_ID,
    generationKind: 'spot_sfx',
  }),
  ambience: falAudioStemConfig({
    role: 'ambience',
    modelId: FAL_SEED_AUDIO_MODEL_ID,
    generationKind: 'ambience',
  }),
  bgm: falAudioStemConfig({
    role: 'bgm',
    modelId: FAL_LYRIA_3_PRO_MODEL_ID,
    generationKind: 'music',
  }),
} as const satisfies Record<GenerativeAudioStemRole, AudioStemModelConfig>

export function resolveDefaultAudioStemModelConfig(role: AudioStemRole): AudioStemModelConfig | null {
  if (role === 'native_video') return null
  return DEFAULT_AUDIO_STEM_MODEL_CONFIGS[role]
}
