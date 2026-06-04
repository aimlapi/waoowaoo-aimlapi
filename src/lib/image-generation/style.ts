import { getArtStylePrompt, isArtStyleValue, type ArtStyleValue } from '@/lib/constants'
import { resolveProjectVisualStylePreset, resolveVisualStylePreset } from '@/lib/style-preset'
import { resolveSelectedVisualReferenceStyle } from '@/lib/visual-reference-cases/selected-style'

export interface ResolvedImageStyleForTask {
  prompt: string
  signature: string
  source: 'project' | 'override'
  presetSource: 'system' | 'user'
  presetId: string
}

function normalizeArtStyleOverride(value: unknown, errorMessage: string): ArtStyleValue | undefined {
  if (value === undefined || value === null) return undefined
  if (typeof value !== 'string') {
    throw new Error(errorMessage)
  }
  const parsed = value.trim()
  if (!parsed) return undefined
  if (!isArtStyleValue(parsed)) {
    throw new Error(errorMessage)
  }
  return parsed
}

export function resolveSystemImageStylePrompt(params: {
  artStyle: unknown
  locale: 'zh' | 'en'
  errorMessage: string
}): string {
  const artStyle = normalizeArtStyleOverride(params.artStyle, params.errorMessage)
  return artStyle ? getArtStylePrompt(artStyle, params.locale) : ''
}

export async function resolveProjectImageStyleForTask(params: {
  projectId: string
  userId: string
  locale: 'zh' | 'en'
  episodeId?: string | null
  artStyleOverride?: unknown
  invalidOverrideMessage: string
}): Promise<ResolvedImageStyleForTask> {
  const override = normalizeArtStyleOverride(params.artStyleOverride, params.invalidOverrideMessage)
  if (override) {
    const resolved = await resolveVisualStylePreset({
      userId: params.userId,
      presetSource: 'system',
      presetId: override,
      locale: params.locale,
    })
    return {
      prompt: resolved.prompt,
      signature: `override:system:${override}`,
      source: 'override',
      presetSource: 'system',
      presetId: override,
    }
  }

  const selectedStyle = await resolveSelectedVisualReferenceStyle({
    projectId: params.projectId,
    episodeId: params.episodeId,
  })
  if (selectedStyle) {
    return {
      prompt: selectedStyle.prompt,
      signature: `project:selected-visual-reference:${selectedStyle.id}`,
      source: 'project',
      presetSource: 'user',
      presetId: selectedStyle.id,
    }
  }

  const resolved = await resolveProjectVisualStylePreset({
    projectId: params.projectId,
    userId: params.userId,
    locale: params.locale,
  })
  return {
    prompt: resolved.prompt,
    signature: `project:${resolved.source}:${resolved.presetId}`,
    source: 'project',
    presetSource: resolved.source,
    presetId: resolved.presetId,
  }
}

export async function resolveProjectImageStyleSignatureForTask(params: {
  projectId: string
  userId: string
  locale: 'zh' | 'en'
  episodeId?: string | null
  artStyleOverride?: unknown
  invalidOverrideMessage: string
}): Promise<string> {
  return (await resolveProjectImageStyleForTask(params)).signature
}
