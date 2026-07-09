import {
  SOUND_EFFECT_SCORE_STATUS,
  type SoundEffectCueRender,
} from './types'

export type PersistedSoundEffectScoreRecord = {
  readonly status: string | null
  readonly cuesJson?: unknown
  readonly timelineSignature?: string | null
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value)
}

function readString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

function readNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

function parseRecord(value: unknown): Record<string, unknown> | null {
  if (!value) return null
  if (isRecord(value)) return value
  if (typeof value !== 'string' || !value.trim()) return null
  const parsed = JSON.parse(value) as unknown
  return isRecord(parsed) ? parsed : null
}

function parseCue(value: unknown): SoundEffectCueRender | null {
  if (!isRecord(value)) return null
  const cueId = readString(value.cueId)
  const index = readNumber(value.index)
  const startSeconds = readNumber(value.startSeconds)
  const durationSeconds = readNumber(value.durationSeconds)
  const label = readString(value.label)
  const prompt = readString(value.prompt)
  const mediaId = readString(value.mediaId)
  const url = readString(value.url)
  const storageKey = readString(value.storageKey)
  const mimeType = readString(value.mimeType)
  const durationMs = readNumber(value.durationMs)
  if (
    !cueId ||
    index === null ||
    startSeconds === null ||
    durationSeconds === null ||
    !label ||
    !prompt ||
    !mediaId ||
    !url ||
    !storageKey ||
    !mimeType ||
    durationMs === null
  ) {
    return null
  }
  return {
    cueId,
    index,
    startSeconds,
    durationSeconds,
    label,
    prompt,
    sourceClipOrders: Array.isArray(value.sourceClipOrders)
      ? value.sourceClipOrders.filter((item): item is number => typeof item === 'number' && Number.isInteger(item))
      : [],
    shotIds: Array.isArray(value.shotIds)
      ? value.shotIds.filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
      : [],
    shotNumbers: Array.isArray(value.shotNumbers)
      ? value.shotNumbers.filter((item): item is number => typeof item === 'number' && Number.isInteger(item))
      : [],
    mediaId,
    url,
    storageKey,
    mimeType,
    durationMs,
  }
}

export function readSoundEffectScoreStatus(score: PersistedSoundEffectScoreRecord | null | undefined): string | null {
  if (!score) return null
  return readString(score.status) || null
}

export function readSoundEffectScoreTimelineSignature(score: PersistedSoundEffectScoreRecord | null | undefined): string | null {
  if (!score) return null
  return readString(score.timelineSignature) || null
}

export function readCompletedSoundEffectCues(score: PersistedSoundEffectScoreRecord | null | undefined): readonly SoundEffectCueRender[] | null {
  if (!score || score.status !== SOUND_EFFECT_SCORE_STATUS.COMPLETED) return null
  const data = parseRecord(score.cuesJson)
  if (!data) return null
  const cues = Array.isArray(data.cues)
    ? data.cues.map(parseCue).filter((cue): cue is SoundEffectCueRender => cue !== null)
    : []
  return cues
}
