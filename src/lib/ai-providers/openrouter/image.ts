import { getProviderConfig } from '@/lib/user-api/runtime-config'
import { normalizeToBase64ForGeneration } from '@/lib/media/outbound-image'
import type {
  AiProviderImageExecutionContext,
  GenerateResult,
} from '@/lib/ai-providers/runtime-types'
import { requireSelectedModelId } from '@/lib/ai-providers/shared/model-selection'
import {
  OPENROUTER_GPT_IMAGE_2_MODEL_ID,
  OPENROUTER_IMAGE_MODEL_IDS,
} from './models'

type OpenRouterImageOptions = NonNullable<AiProviderImageExecutionContext['options']>

type OpenRouterImageReference = {
  type: 'image_url'
  image_url: { url: string }
}

type OpenRouterImageRequest = {
  model: string
  prompt: string
  quality?: string
  background?: string
  output_compression?: number
  input_references?: OpenRouterImageReference[]
}

type OpenRouterImageData = {
  b64_json?: unknown
  url?: unknown
}

type OpenRouterImageResponse = {
  data?: unknown
  error?: unknown
  message?: unknown
}

const OPENROUTER_IMAGE_ENDPOINT_PATH = '/images'
const OPENROUTER_GPT_IMAGE_2_QUALITY_OPTIONS = new Set(['auto', 'low', 'medium', 'high'])
const OPENROUTER_GPT_IMAGE_2_BACKGROUND_OPTIONS = new Set(['auto', 'opaque'])

function requireOpenRouterBaseUrl(baseUrl: string | undefined, context: string): string {
  const normalized = typeof baseUrl === 'string' ? baseUrl.trim().replace(/\/+$/, '') : ''
  if (!normalized) {
    throw new Error(`PROVIDER_BASE_URL_MISSING: openrouter (${context})`)
  }
  return normalized
}

function buildOpenRouterUrl(baseUrl: string, path: string): string {
  const normalizedBaseUrl = baseUrl.trim().replace(/\/+$/, '')
  return `${normalizedBaseUrl}${path.startsWith('/') ? path : `/${path}`}`
}

async function readJson(response: Response): Promise<unknown> {
  const text = await response.text()
  if (!text.trim()) return null
  return JSON.parse(text) as unknown
}

async function readErrorText(response: Response): Promise<string> {
  const text = await response.text()
  return text.trim() || response.statusText || 'empty response'
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null
}

function readProviderError(data: unknown): string | null {
  const record = asRecord(data)
  if (!record) return null

  const error = record.error
  if (typeof error === 'string' && error.trim()) return error.trim()

  const errorRecord = asRecord(error)
  if (typeof errorRecord?.message === 'string' && errorRecord.message.trim()) {
    return errorRecord.message.trim()
  }

  const message = record.message
  if (typeof message === 'string' && message.trim()) return message.trim()

  return null
}

function assertAllowedOpenRouterImageOptions(options: OpenRouterImageOptions) {
  const allowedOptionKeys = new Set([
    'provider',
    'modelId',
    'modelKey',
    'referenceImages',
    'aspectRatio',
    'resolution',
    'quality',
    'background',
    'outputCompression',
  ])

  for (const [key, value] of Object.entries(options)) {
    if (value === undefined) continue
    if (!allowedOptionKeys.has(key)) {
      throw new Error(`OPENROUTER_IMAGE_OPTION_UNSUPPORTED: ${key}`)
    }
  }
}

function assertGptImage2Options(options: OpenRouterImageOptions) {
  if (options.quality !== undefined && !OPENROUTER_GPT_IMAGE_2_QUALITY_OPTIONS.has(options.quality)) {
    throw new Error(`OPENROUTER_IMAGE_OPTION_VALUE_UNSUPPORTED: quality=${options.quality}`)
  }
  if (options.background !== undefined && !OPENROUTER_GPT_IMAGE_2_BACKGROUND_OPTIONS.has(options.background)) {
    throw new Error(`OPENROUTER_IMAGE_OPTION_VALUE_UNSUPPORTED: background=${options.background}`)
  }
  if (options.outputCompression !== undefined) {
    if (!Number.isInteger(options.outputCompression) || options.outputCompression < 0 || options.outputCompression > 100) {
      throw new Error(`OPENROUTER_IMAGE_OPTION_VALUE_UNSUPPORTED: outputCompression=${options.outputCompression}`)
    }
  }
}

function buildPrompt(input: { prompt: string; aspectRatio?: string; resolution?: string }): string {
  const prompt = input.prompt.trim()
  if (!prompt) throw new Error('OPENROUTER_IMAGE_PROMPT_REQUIRED')

  const constraints: string[] = []
  if (input.aspectRatio?.trim()) {
    constraints.push(`Use a ${input.aspectRatio.trim()} aspect ratio.`)
  }
  if (input.resolution?.trim()) {
    constraints.push(`Target ${input.resolution.trim()} visual detail.`)
  }
  if (constraints.length === 0) return prompt

  return `${prompt}\n\nImage constraints: ${constraints.join(' ')}`
}

async function buildInputReferences(referenceImages: readonly string[] | undefined): Promise<OpenRouterImageReference[]> {
  if (!Array.isArray(referenceImages)) return []
  const normalizedReferences: OpenRouterImageReference[] = []
  for (const source of referenceImages.slice(0, 16)) {
    const trimmed = source.trim()
    if (!trimmed) continue
    const normalizedUrl = await normalizeToBase64ForGeneration(trimmed)
    normalizedReferences.push({
      type: 'image_url',
      image_url: { url: normalizedUrl },
    })
  }
  return normalizedReferences
}

async function buildGptImage2Payload(input: {
  modelId: string
  prompt: string
  options: OpenRouterImageOptions
}): Promise<OpenRouterImageRequest> {
  const inputReferences = await buildInputReferences(input.options.referenceImages)
  return {
    model: input.modelId,
    prompt: buildPrompt({
      prompt: input.prompt,
      aspectRatio: input.options.aspectRatio,
      resolution: input.options.resolution,
    }),
    ...(input.options.quality ? { quality: input.options.quality } : {}),
    ...(input.options.background ? { background: input.options.background } : {}),
    ...(typeof input.options.outputCompression === 'number'
      ? { output_compression: input.options.outputCompression }
      : {}),
    ...(inputReferences.length > 0 ? { input_references: inputReferences } : {}),
  }
}

function readFirstImage(data: unknown): { imageBase64?: string; imageUrl: string } {
  const response = data as OpenRouterImageResponse | null
  const images = Array.isArray(response?.data) ? response.data : []
  const first = images.map((item) => item as OpenRouterImageData).find((item) => item)
  if (!first) {
    throw new Error(readProviderError(data) || 'OPENROUTER_IMAGE_RESPONSE_EMPTY')
  }

  if (typeof first.b64_json === 'string' && first.b64_json.trim()) {
    const imageBase64 = first.b64_json.trim()
    return {
      imageBase64,
      imageUrl: `data:image/png;base64,${imageBase64}`,
    }
  }

  if (typeof first.url === 'string' && first.url.trim()) {
    return { imageUrl: first.url.trim() }
  }

  throw new Error(readProviderError(data) || 'OPENROUTER_IMAGE_RESPONSE_MISSING_IMAGE')
}

async function submitOpenRouterImageRequest(input: {
  baseUrl: string
  apiKey: string
  payload: OpenRouterImageRequest
}): Promise<GenerateResult> {
  if (!input.apiKey) {
    throw new Error('请配置 OpenRouter API Key')
  }

  const response = await fetch(buildOpenRouterUrl(input.baseUrl, OPENROUTER_IMAGE_ENDPOINT_PATH), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${input.apiKey}`,
    },
    body: JSON.stringify(input.payload),
    cache: 'no-store',
  })

  const data = response.ok ? await readJson(response) : null
  if (!response.ok) {
    const errorText = data ? readProviderError(data) || JSON.stringify(data) : await readErrorText(response)
    throw new Error(`OPENROUTER_IMAGE_SUBMIT_FAILED (${response.status}): ${errorText}`)
  }

  const image = readFirstImage(data)
  return {
    success: true,
    ...image,
    endpoint: 'images',
  }
}

export async function executeOpenRouterImageGeneration(input: AiProviderImageExecutionContext): Promise<GenerateResult> {
  const { apiKey, baseUrl } = await getProviderConfig(input.userId, input.selection.provider)
  const normalizedBaseUrl = requireOpenRouterBaseUrl(baseUrl, 'image')
  const modelId = requireSelectedModelId(input.selection, 'openrouter:image')
  if (!OPENROUTER_IMAGE_MODEL_IDS.has(modelId)) {
    throw new Error(`OPENROUTER_IMAGE_MODEL_UNSUPPORTED: ${modelId}`)
  }
  if (modelId !== OPENROUTER_GPT_IMAGE_2_MODEL_ID) {
    throw new Error(`OPENROUTER_IMAGE_MODEL_UNSUPPORTED: ${modelId}`)
  }

  const options: OpenRouterImageOptions = input.options ?? {}
  assertAllowedOpenRouterImageOptions(options)
  assertGptImage2Options(options)

  const payload = await buildGptImage2Payload({
    modelId,
    prompt: input.prompt,
    options,
  })

  return await submitOpenRouterImageRequest({
    baseUrl: normalizedBaseUrl,
    apiKey,
    payload,
  })
}
