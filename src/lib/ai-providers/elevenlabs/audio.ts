import { getProviderConfig } from '@/lib/user-api/runtime-config'
import type { AiProviderAudioExecutionContext, GenerateResult } from '@/lib/ai-providers/runtime-types'
import { requireSelectedModelId } from '@/lib/ai-providers/shared/model-selection'
import { ELEVENLABS_TEXT_TO_SOUND_V2_MODEL_ID } from './models'

type ElevenLabsAudioOptions = NonNullable<AiProviderAudioExecutionContext['options']>

function readTrimmedString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

function resolveBaseUrl(value: string | undefined): string {
  const baseUrl = readTrimmedString(value) || 'https://api.elevenlabs.io'
  return baseUrl.replace(/\/+$/, '')
}

function addNumber(payload: Record<string, unknown>, key: string, value: unknown) {
  if (typeof value === 'number' && Number.isFinite(value)) payload[key] = value
}

function addBoolean(payload: Record<string, unknown>, key: string, value: unknown) {
  if (typeof value === 'boolean') payload[key] = value
}

function buildElevenLabsSoundPayload(
  modelId: string,
  prompt: string,
  options: ElevenLabsAudioOptions,
): Record<string, unknown> {
  if (modelId !== ELEVENLABS_TEXT_TO_SOUND_V2_MODEL_ID) {
    throw new Error(`ELEVENLABS_AUDIO_MODEL_UNSUPPORTED:${modelId}`)
  }
  if (options.generationKind && options.generationKind !== 'spot_sfx') {
    throw new Error(`ELEVENLABS_AUDIO_GENERATION_KIND_UNSUPPORTED:${options.generationKind}`)
  }

  const text = prompt.trim()
  if (!text) throw new Error('ELEVENLABS_AUDIO_PROMPT_REQUIRED')

  const payload: Record<string, unknown> = {
    text,
    model_id: modelId,
  }
  addNumber(payload, 'duration_seconds', options.durationSeconds)
  addNumber(payload, 'prompt_influence', options.promptInfluence)
  addBoolean(payload, 'loop', options.loop)
  return payload
}

export async function executeElevenLabsAudioGeneration(input: AiProviderAudioExecutionContext): Promise<GenerateResult> {
  const options = input.options ?? {}
  const providerConfig = await getProviderConfig(input.userId, input.selection.provider)
  const modelId = requireSelectedModelId(input.selection, 'elevenlabs:audio')
  const payload = buildElevenLabsSoundPayload(modelId, input.prompt, options)
  const response = await fetch(`${resolveBaseUrl(providerConfig.baseUrl)}/v1/sound-generation`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'audio/mpeg',
      'xi-api-key': providerConfig.apiKey,
    },
    body: JSON.stringify(payload),
    cache: 'no-store',
  })

  if (!response.ok) {
    const errorText = await response.text()
    throw new Error(`ELEVENLABS_AUDIO_GENERATION_FAILED (${response.status}): ${errorText}`)
  }

  const audioMimeType = readTrimmedString(response.headers.get('content-type')) || 'audio/mpeg'
  const audioBase64 = Buffer.from(await response.arrayBuffer()).toString('base64')
  if (!audioBase64) throw new Error('ELEVENLABS_AUDIO_EMPTY_RESPONSE')

  return {
    success: true,
    audioBase64,
    audioMimeType,
    audioUrl: `data:${audioMimeType};base64,${audioBase64}`,
    metadata: {
      model: modelId,
    },
  }
}
