import { getProviderConfig } from '@/lib/user-api/runtime-config'
import type { AiProviderAudioExecutionContext, GenerateResult } from '@/lib/ai-providers/runtime-types'
import { requireSelectedModelId } from '@/lib/ai-providers/shared/model-selection'
import { buildFalQueueUrl } from '@/lib/ai-providers/fal/base-url'
import {
  FAL_SEED_AUDIO_MODEL_ID,
  FAL_XAI_TTS_MODEL_ID,
} from '@/lib/ai-providers/fal/models'

type FalAudioOptions = NonNullable<AiProviderAudioExecutionContext['options']>

interface FalAudioSubmitResponse {
  request_id?: unknown
}

interface FalAudioStatusResponse {
  status?: unknown
  response_url?: unknown
  error?: unknown
}

interface FalAudioFile {
  url?: unknown
  content_type?: unknown
}

interface FalAudioResultResponse {
  audio?: unknown
}

const FAL_AUDIO_DEFAULT_TIMEOUT_MS = 10 * 60 * 1000
const FAL_AUDIO_DEFAULT_POLL_MS = 3_000

function readTrimmedString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

function readEnvPositiveInteger(name: string, fallback: number): number {
  const raw = process.env[name]?.trim()
  if (!raw) return fallback
  const parsed = Number(raw)
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`FAL_AUDIO_ENV_INVALID:${name}=${raw}`)
  }
  return parsed
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function addString(payload: Record<string, unknown>, key: string, value: unknown) {
  const text = readTrimmedString(value)
  if (text) payload[key] = text
}

function addNumber(payload: Record<string, unknown>, key: string, value: unknown) {
  if (typeof value === 'number' && Number.isFinite(value)) payload[key] = value
}

function readStringArray(value: unknown): string[] | null {
  if (!Array.isArray(value)) return null
  const items = value.map(readTrimmedString).filter((item) => item.length > 0)
  if (items.length !== value.length) {
    throw new Error('FAL_AUDIO_AUDIO_URLS_INVALID')
  }
  return items
}

function buildFalXaiTtsPayload(prompt: string, options: FalAudioOptions): Record<string, unknown> {
  const text = prompt.trim()
  if (!text) throw new Error('FAL_AUDIO_PROMPT_REQUIRED')
  const voice = readTrimmedString(options.voice)
  if (!voice) throw new Error('FAL_AUDIO_TTS_VOICE_REQUIRED')

  const payload: Record<string, unknown> = {
    text,
    voice,
  }
  addString(payload, 'language', options.language)
  addString(payload, 'output_format', options.outputFormat)
  return payload
}

function buildFalSeedAudioPayload(prompt: string, options: FalAudioOptions): Record<string, unknown> {
  const text = prompt.trim()
  if (!text) throw new Error('FAL_AUDIO_PROMPT_REQUIRED')

  const payload: Record<string, unknown> = {
    prompt: text,
  }
  addString(payload, 'voice', options.voice)
  addString(payload, 'image_url', options.imageUrl)
  addString(payload, 'output_format', options.outputFormat)
  addNumber(payload, 'sample_rate', options.sampleRate)
  addNumber(payload, 'speed', options.speed)
  addNumber(payload, 'volume', options.volume)
  addNumber(payload, 'pitch', options.pitch)

  const audioUrls = readStringArray(options.audioUrls)
  if (audioUrls && audioUrls.length > 0) payload.audio_urls = audioUrls
  return payload
}

function buildFalAudioPayload(modelId: string, prompt: string, options: FalAudioOptions): Record<string, unknown> {
  if (modelId === FAL_XAI_TTS_MODEL_ID) return buildFalXaiTtsPayload(prompt, options)
  if (modelId === FAL_SEED_AUDIO_MODEL_ID) return buildFalSeedAudioPayload(prompt, options)
  throw new Error(`FAL_AUDIO_MODEL_UNSUPPORTED:${modelId}`)
}

function readFalAudioResultAudio(response: FalAudioResultResponse): {
  audioUrl: string
  audioMimeType?: string
} {
  if (typeof response.audio === 'string') {
    const audioUrl = response.audio.trim()
    if (audioUrl) return { audioUrl }
  }

  const audio = response.audio && typeof response.audio === 'object'
    ? response.audio as FalAudioFile
    : null
  const audioUrl = readTrimmedString(audio?.url)
  if (!audioUrl) throw new Error('FAL_AUDIO_RESULT_AUDIO_MISSING')

  const audioMimeType = readTrimmedString(audio?.content_type)
  return {
    audioUrl,
    ...(audioMimeType ? { audioMimeType } : {}),
  }
}

async function submitFalAudio(endpoint: string, apiKey: string, payload: Record<string, unknown>): Promise<string> {
  const response = await fetch(buildFalQueueUrl(endpoint), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Key ${apiKey}`,
    },
    body: JSON.stringify(payload),
    cache: 'no-store',
  })

  if (!response.ok) {
    const errorText = await response.text()
    throw new Error(`FAL_AUDIO_SUBMIT_FAILED (${response.status}): ${errorText}`)
  }

  const data = await response.json() as FalAudioSubmitResponse
  const requestId = readTrimmedString(data.request_id)
  if (!requestId) throw new Error('FAL_AUDIO_REQUEST_ID_MISSING')
  return requestId
}

async function fetchFalAudioResult(endpoint: string, requestId: string, apiKey: string, resultUrl?: string): Promise<GenerateResult> {
  const response = await fetch(resultUrl || buildFalQueueUrl(`${endpoint}/requests/${requestId}`), {
    method: 'GET',
    headers: {
      Authorization: `Key ${apiKey}`,
      Accept: 'application/json',
    },
    cache: 'no-store',
  })

  if (!response.ok) {
    const errorText = await response.text()
    throw new Error(`FAL_AUDIO_RESULT_FAILED (${response.status}): ${errorText}`)
  }

  const data = await response.json() as FalAudioResultResponse
  const audio = readFalAudioResultAudio(data)
  return {
    success: true,
    audioUrl: audio.audioUrl,
    audioMimeType: audio.audioMimeType || 'audio/mpeg',
    metadata: {
      model: endpoint,
      requestId,
    },
  }
}

async function waitForFalAudioResult(endpoint: string, requestId: string, apiKey: string): Promise<GenerateResult> {
  const timeoutMs = readEnvPositiveInteger('FAL_AUDIO_TIMEOUT_MS', FAL_AUDIO_DEFAULT_TIMEOUT_MS)
  const intervalMs = readEnvPositiveInteger('FAL_AUDIO_POLL_MS', FAL_AUDIO_DEFAULT_POLL_MS)
  const startAt = Date.now()

  while (Date.now() - startAt <= timeoutMs) {
    const statusResponse = await fetch(buildFalQueueUrl(`${endpoint}/requests/${requestId}/status?logs=0`), {
      method: 'GET',
      headers: {
        Authorization: `Key ${apiKey}`,
        Accept: 'application/json',
      },
      cache: 'no-store',
    })

    if (statusResponse.ok) {
      const data = await statusResponse.json() as FalAudioStatusResponse
      const status = data.status
      if (status === 'COMPLETED') {
        const resultUrl = readTrimmedString(data.response_url)
        return await fetchFalAudioResult(endpoint, requestId, apiKey, resultUrl || undefined)
      }
      if (status === 'FAILED') {
        const error = readTrimmedString(data.error) || 'FAL audio task failed'
        throw new Error(`FAL_AUDIO_FAILED:${error}`)
      }
    }

    await sleep(intervalMs)
  }

  throw new Error(`FAL_AUDIO_TIMEOUT:${requestId}`)
}

export async function executeFalAudioGeneration(input: AiProviderAudioExecutionContext): Promise<GenerateResult> {
  const options = input.options ?? {}
  const { apiKey } = await getProviderConfig(input.userId, input.selection.provider)
  const modelId = requireSelectedModelId(input.selection, 'fal:audio')
  const payload = buildFalAudioPayload(modelId, input.prompt, options)
  const requestId = await submitFalAudio(modelId, apiKey, payload)
  return await waitForFalAudioResult(modelId, requestId, apiKey)
}
