import { getProviderConfig } from '@/lib/user-api/runtime-config'
import type { AiProviderMusicExecutionContext, GenerateResult } from '@/lib/ai-providers/runtime-types'
import { requireSelectedModelId } from '@/lib/ai-providers/shared/model-selection'
import { buildFalQueueUrl } from '@/lib/ai-providers/fal/base-url'
import { FAL_LYRIA_3_PRO_MODEL_ID } from '@/lib/ai-providers/fal/models'

type FalMusicOptions = NonNullable<AiProviderMusicExecutionContext['options']>

interface FalMusicSubmitResponse {
  request_id?: unknown
  status_url?: unknown
  response_url?: unknown
}

interface FalMusicStatusResponse {
  status?: unknown
  response_url?: unknown
  error?: unknown
}

interface FalMusicResultResponse {
  audio?: unknown
  lyrics?: unknown
}

interface FalMusicFile {
  url?: unknown
  content_type?: unknown
}

interface FalMusicQueueRequest {
  readonly requestId: string
  readonly statusUrl: string
  readonly responseUrl: string
}

const FAL_MUSIC_DEFAULT_TIMEOUT_MS = 10 * 60 * 1000
const FAL_MUSIC_DEFAULT_POLL_MS = 3_000

function readTrimmedString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

function readEnvPositiveInteger(name: string, fallback: number): number {
  const raw = process.env[name]?.trim()
  if (!raw) return fallback
  const parsed = Number(raw)
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`FAL_MUSIC_ENV_INVALID:${name}=${raw}`)
  }
  return parsed
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function buildFalLyriaPrompt(prompt: string, options: FalMusicOptions): string {
  const lines = [prompt.trim()]
  const genre = readTrimmedString(options.genre)
  const mood = readTrimmedString(options.mood)

  if (genre) lines.push(`Genre: ${genre}`)
  if (mood) lines.push(`Mood: ${mood}`)
  if (typeof options.durationSeconds === 'number') lines.push(`Target duration: ${options.durationSeconds} seconds`)
  if (typeof options.bpm === 'number') lines.push(`BPM: ${options.bpm}`)
  if (options.vocalMode === 'instrumental') lines.push('Instrumental only. Do not include vocals or lyrics.')
  if (options.vocalMode === 'vocal') lines.push('Vocals are allowed when musically appropriate.')
  if (options.outputFormat) lines.push(`Output format: ${options.outputFormat}`)

  return lines.join('\n')
}

function readFalMusicResultAudio(response: FalMusicResultResponse): {
  audioUrl: string
  audioMimeType?: string
} {
  if (typeof response.audio === 'string') {
    const audioUrl = response.audio.trim()
    if (audioUrl) return { audioUrl }
  }

  const audio = response.audio && typeof response.audio === 'object'
    ? response.audio as FalMusicFile
    : null
  const audioUrl = readTrimmedString(audio?.url)
  if (!audioUrl) {
    throw new Error('FAL_MUSIC_RESULT_AUDIO_MISSING')
  }

  const audioMimeType = readTrimmedString(audio?.content_type)
  return {
    audioUrl,
    ...(audioMimeType ? { audioMimeType } : {}),
  }
}

async function submitFalMusic(endpoint: string, apiKey: string, payload: Record<string, unknown>): Promise<FalMusicQueueRequest> {
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
    throw new Error(`FAL_MUSIC_SUBMIT_FAILED (${response.status}): ${errorText}`)
  }

  const data = await response.json() as FalMusicSubmitResponse
  const requestId = readTrimmedString(data.request_id)
  if (!requestId) throw new Error('FAL_MUSIC_REQUEST_ID_MISSING')
  const statusUrl = readTrimmedString(data.status_url)
  if (!statusUrl) throw new Error('FAL_MUSIC_STATUS_URL_MISSING')
  const responseUrl = readTrimmedString(data.response_url)
  if (!responseUrl) throw new Error('FAL_MUSIC_RESPONSE_URL_MISSING')
  return { requestId, statusUrl, responseUrl }
}

async function fetchFalMusicResult(endpoint: string, request: FalMusicQueueRequest, apiKey: string): Promise<GenerateResult> {
  const response = await fetch(request.responseUrl, {
    method: 'GET',
    headers: {
      Authorization: `Key ${apiKey}`,
      Accept: 'application/json',
    },
    cache: 'no-store',
  })

  if (!response.ok) {
    const errorText = await response.text()
    throw new Error(`FAL_MUSIC_RESULT_FAILED (${response.status}): ${errorText}`)
  }

  const data = await response.json() as FalMusicResultResponse
  const audio = readFalMusicResultAudio(data)
  const lyrics = readTrimmedString(data.lyrics)

  return {
    success: true,
    audioUrl: audio.audioUrl,
    audioMimeType: audio.audioMimeType || 'audio/mpeg',
    metadata: {
      model: endpoint,
      requestId: request.requestId,
      ...(lyrics ? { lyrics } : {}),
    },
  }
}

async function waitForFalMusicResult(endpoint: string, request: FalMusicQueueRequest, apiKey: string): Promise<GenerateResult> {
  const timeoutMs = readEnvPositiveInteger('FAL_MUSIC_TIMEOUT_MS', FAL_MUSIC_DEFAULT_TIMEOUT_MS)
  const intervalMs = readEnvPositiveInteger('FAL_MUSIC_POLL_MS', FAL_MUSIC_DEFAULT_POLL_MS)
  const startAt = Date.now()

  while (Date.now() - startAt <= timeoutMs) {
    const statusResponse = await fetch(request.statusUrl, {
      method: 'GET',
      headers: {
        Authorization: `Key ${apiKey}`,
        Accept: 'application/json',
      },
      cache: 'no-store',
    })

    if (!statusResponse.ok) {
      const errorText = await statusResponse.text()
      throw new Error(`FAL_MUSIC_STATUS_FAILED (${statusResponse.status}): ${errorText}`)
    }
    const data = await statusResponse.json() as FalMusicStatusResponse
    const status = data.status
    if (status === 'COMPLETED') {
      return await fetchFalMusicResult(endpoint, request, apiKey)
    }
    if (status === 'FAILED') {
      const error = readTrimmedString(data.error) || 'FAL music task failed'
      throw new Error(`FAL_MUSIC_FAILED:${error}`)
    }

    await sleep(intervalMs)
  }

  throw new Error(`FAL_MUSIC_TIMEOUT:${request.requestId}`)
}

export async function executeFalMusicGeneration(input: AiProviderMusicExecutionContext): Promise<GenerateResult> {
  const options = input.options ?? {}
  const { apiKey } = await getProviderConfig(input.userId, input.selection.provider)
  const modelId = requireSelectedModelId(input.selection, 'fal:music')
  if (modelId !== FAL_LYRIA_3_PRO_MODEL_ID) {
    throw new Error(`FAL_MUSIC_MODEL_UNSUPPORTED:${modelId}`)
  }

  const prompt = buildFalLyriaPrompt(input.prompt, options)
  if (!prompt.trim()) throw new Error('FAL_MUSIC_PROMPT_REQUIRED')
  const negativePrompt = readTrimmedString(options.negativePrompt)

  const request = await submitFalMusic(modelId, apiKey, {
    prompt,
    ...(negativePrompt ? { negative_prompt: negativePrompt } : {}),
  })
  return await waitForFalMusicResult(modelId, request, apiKey)
}
