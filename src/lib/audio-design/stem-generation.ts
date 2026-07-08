import { executeMediaGeneration, type AiAudioExecutionOptions, type AiMusicExecutionOptions } from '@/lib/ai-exec/engine'
import type { GenerateResult } from '@/lib/ai-providers/runtime-types'
import {
  resolveDefaultAudioStemModelConfig,
  type GenerativeAudioStemRole,
} from './stem-model-config'

type StemGenerationCommonInput = {
  readonly userId: string
  readonly role: GenerativeAudioStemRole
  readonly prompt: string
}

export type DialogueStemGenerationInput = StemGenerationCommonInput & {
  readonly role: 'dialogue'
  readonly voice: string
  readonly language?: string
  readonly outputFormat?: 'mp3' | 'wav'
}

export type SoundStemGenerationInput = StemGenerationCommonInput & {
  readonly role: 'foley' | 'spot_sfx' | 'ambience'
  readonly voice?: string
  readonly outputFormat?: 'mp3' | 'wav'
  readonly audioUrls?: readonly string[]
  readonly imageUrl?: string
  readonly sampleRate?: number
  readonly speed?: number
  readonly volume?: number
  readonly pitch?: number
}

export type BgmStemGenerationInput = StemGenerationCommonInput & {
  readonly role: 'bgm'
  readonly durationSeconds?: number
  readonly genre?: string
  readonly mood?: string
  readonly bpm?: number
  readonly outputFormat?: 'mp3' | 'wav'
}

export type AudioStemGenerationInput =
  | DialogueStemGenerationInput
  | SoundStemGenerationInput
  | BgmStemGenerationInput

function requirePrompt(prompt: string): string {
  const trimmed = prompt.trim()
  if (!trimmed) throw new Error('AUDIO_STEM_PROMPT_REQUIRED')
  return trimmed
}

function normalizeReadonlyStrings(items: readonly string[] | undefined): string[] | undefined {
  if (!items) return undefined
  return items.map((item) => item.trim()).filter((item) => item.length > 0)
}

function buildAudioOptions(input: DialogueStemGenerationInput | SoundStemGenerationInput): AiAudioExecutionOptions {
  const modelConfig = resolveDefaultAudioStemModelConfig(input.role)
  if (!modelConfig) throw new Error(`AUDIO_STEM_MODEL_NOT_CONFIGURED:${input.role}`)

  if (input.role === 'dialogue') {
    const voice = input.voice.trim()
    if (!voice) throw new Error('AUDIO_STEM_DIALOGUE_VOICE_REQUIRED')
    return {
      generationKind: modelConfig.generationKind,
      voice,
      language: input.language,
      outputFormat: input.outputFormat,
    }
  }

  return {
    generationKind: modelConfig.generationKind,
    voice: input.voice,
    outputFormat: input.outputFormat,
    audioUrls: normalizeReadonlyStrings(input.audioUrls),
    imageUrl: input.imageUrl,
    sampleRate: input.sampleRate,
    speed: input.speed,
    volume: input.volume,
    pitch: input.pitch,
  }
}

function buildMusicOptions(input: BgmStemGenerationInput): AiMusicExecutionOptions {
  return {
    durationSeconds: input.durationSeconds,
    vocalMode: 'instrumental',
    genre: input.genre,
    mood: input.mood,
    bpm: input.bpm,
    outputFormat: input.outputFormat,
  }
}

export async function generateAudioStem(input: AudioStemGenerationInput): Promise<GenerateResult> {
  const modelConfig = resolveDefaultAudioStemModelConfig(input.role)
  if (!modelConfig) throw new Error(`AUDIO_STEM_MODEL_NOT_CONFIGURED:${input.role}`)
  const prompt = requirePrompt(input.prompt)

  if (input.role === 'bgm') {
    return await executeMediaGeneration({
      modality: 'music',
      userId: input.userId,
      modelKey: modelConfig.modelKey,
      prompt,
      options: buildMusicOptions(input),
    })
  }

  return await executeMediaGeneration({
    modality: 'audio',
    userId: input.userId,
    modelKey: modelConfig.modelKey,
    prompt,
    options: buildAudioOptions(input),
  })
}
