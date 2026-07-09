import { fetchWithProviderProxy } from '@/lib/http/outbound-proxy'
import { ELEVENLABS_SOUND_EFFECT_MODEL } from '@/lib/sound-effects/types'
import { getProviderConfig } from '@/lib/user-api/runtime-config'

export interface ElevenLabsSoundEffectResult {
  readonly buffer: Buffer
  readonly mimeType: string
  readonly modelId: string
}

function readString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

export async function generateElevenLabsSoundEffect(input: {
  readonly userId: string
  readonly text: string
  readonly durationSeconds: number
}): Promise<ElevenLabsSoundEffectResult> {
  const userId = readString(input.userId)
  if (!userId) throw new Error('ELEVENLABS_USER_REQUIRED')
  const text = readString(input.text)
  if (!text) throw new Error('ELEVENLABS_SOUND_EFFECT_TEXT_REQUIRED')
  if (!Number.isFinite(input.durationSeconds) || input.durationSeconds <= 0) {
    throw new Error('ELEVENLABS_SOUND_EFFECT_DURATION_INVALID')
  }

  const { apiKey } = await getProviderConfig(userId, 'elevenlabs')
  const response = await fetchWithProviderProxy('https://api.elevenlabs.io/v1/sound-generation', {
    method: 'POST',
    headers: {
      'xi-api-key': apiKey,
      'Content-Type': 'application/json',
      Accept: 'audio/mpeg',
    },
    body: JSON.stringify({
      text,
      duration_seconds: input.durationSeconds,
      prompt_influence: 0.45,
      model_id: ELEVENLABS_SOUND_EFFECT_MODEL,
    }),
  })
  if (!response.ok) {
    const body = await response.text()
    throw new Error(`ELEVENLABS_SOUND_EFFECT_FAILED:${response.status}:${body.slice(0, 240)}`)
  }
  const contentType = response.headers.get('content-type') || 'audio/mpeg'
  if (!contentType.startsWith('audio/')) {
    throw new Error(`ELEVENLABS_SOUND_EFFECT_CONTENT_TYPE_INVALID:${contentType}`)
  }
  return {
    buffer: Buffer.from(await response.arrayBuffer()),
    mimeType: contentType,
    modelId: ELEVENLABS_SOUND_EFFECT_MODEL,
  }
}
