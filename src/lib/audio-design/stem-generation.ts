import {
  executeMediaGeneration,
  type AiAudioExecutionOptions,
  type AiMusicExecutionOptions,
  type GenerateResult,
} from '@/lib/ai-exec/engine'
import { resolveDefaultAudioStemModelConfig } from '@/lib/ai-registry/audio-stem-model-config'

type StemGenerationCommonInput = {
  readonly userId: string
  readonly prompt: string
}

export type AmbienceStemGenerationInput = StemGenerationCommonInput & {
  readonly role: 'ambience'
  readonly durationSeconds: number
  readonly promptInfluence: number
  readonly loop: boolean
  readonly outputFormat?: 'mp3' | 'wav'
}

export type BgmStemGenerationInput = StemGenerationCommonInput & {
  readonly role: 'bgm'
  readonly durationSeconds: number
  readonly bpm: number
  readonly outputFormat?: 'mp3' | 'wav'
}

export type AudioStemGenerationInput = AmbienceStemGenerationInput | BgmStemGenerationInput

function requirePrompt(prompt: string): string {
  const trimmed = prompt.trim()
  if (!trimmed) throw new Error('AUDIO_STEM_PROMPT_REQUIRED')
  return trimmed
}

function buildAmbienceOptions(input: AmbienceStemGenerationInput): AiAudioExecutionOptions {
  return {
    generationKind: 'ambience',
    durationSeconds: input.durationSeconds,
    promptInfluence: input.promptInfluence,
    loop: input.loop,
    outputFormat: input.outputFormat,
  }
}

function buildMusicOptions(input: BgmStemGenerationInput): AiMusicExecutionOptions {
  return {
    durationSeconds: input.durationSeconds,
    vocalMode: 'instrumental',
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
    options: buildAmbienceOptions(input),
  })
}
