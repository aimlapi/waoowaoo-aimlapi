import type { TimelineAudioDesign } from '@/lib/audio-design/types'
import {
  BGM_SCORE_STATUS,
  bgmScoreProjectDataSchema,
  type AmbienceAsset,
  type BgmScoreMix,
  type BgmScoreProjectData,
} from './types'

export type EditorProjectDataRecord = Record<string, unknown>

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value)
}

function readString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

function readNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

export function parseEditorProjectData(value: string | null | undefined): EditorProjectDataRecord {
  if (!value?.trim()) return { schemaVersion: 1 }
  const parsed = JSON.parse(value) as unknown
  return isRecord(parsed) ? parsed : { schemaVersion: 1 }
}

export function mergeBgmScoreProjectData(
  existing: EditorProjectDataRecord,
  bgmScore: BgmScoreProjectData,
): EditorProjectDataRecord {
  return {
    ...existing,
    schemaVersion: typeof existing.schemaVersion === 'number' ? existing.schemaVersion : 1,
    bgmScore,
  }
}

export function readCompletedBgmScoreMix(projectDataJson: string | null | undefined): BgmScoreMix | null {
  const data = parseEditorProjectData(projectDataJson)
  const bgmScore = data.bgmScore
  if (!isRecord(bgmScore) || bgmScore.status !== BGM_SCORE_STATUS.COMPLETED) return null
  const mix = bgmScore.mix
  if (!isRecord(mix)) return null

  const mediaId = readString(mix.mediaId)
  const url = readString(mix.url)
  const storageKey = readString(mix.storageKey)
  const mimeType = readString(mix.mimeType)
  const durationMs = readNumber(mix.durationMs)
  if (!mediaId || !url || !storageKey || !mimeType || durationMs === null || durationMs <= 0) return null

  return {
    mediaId,
    url,
    storageKey,
    mimeType,
    durationMs,
  }
}

export function readCompletedBgmScoreProjectData(projectDataJson: string | null | undefined): BgmScoreProjectData | null {
  const data = parseEditorProjectData(projectDataJson)
  const bgmScore = data.bgmScore
  if (!isRecord(bgmScore) || bgmScore.status !== BGM_SCORE_STATUS.COMPLETED) return null
  const parsed = bgmScoreProjectDataSchema.safeParse(bgmScore)
  return parsed.success ? parsed.data : null
}

export function readCompletedBgmScoreTimelineAudio(projectDataJson: string | null | undefined): TimelineAudioDesign | null {
  return readCompletedBgmScoreProjectData(projectDataJson)?.timelineAudio ?? null
}

export function readCompletedAmbienceAssets(projectDataJson: string | null | undefined): readonly AmbienceAsset[] {
  const projectData = readCompletedBgmScoreProjectData(projectDataJson)
  return projectData?.ambienceAssets?.filter((asset) => asset.selected) ?? []
}
