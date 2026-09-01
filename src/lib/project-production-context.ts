import { createHash } from 'node:crypto'
import { resolveEffectiveCapabilitiesByModelKey } from '@/lib/ai-exec/media-input-transport'
import { getProjectModelConfig, type ProjectModelConfig } from '@/lib/config-service'
import { prisma } from '@/lib/prisma'
import { CREATIVE_VIDEO_SEGMENT_DURATION_CEILING_SECONDS } from '@/lib/workspace-resource/generation-contract'
import type { VideoInputMode } from '@/lib/ai-registry/types'
import {
  getUserModels,
  hasEffectiveProviderConfiguration,
} from '@/lib/user-api/runtime-config'
import { PLATFORM_VOICE_DESIGN_MODEL_KEY } from '@/lib/ai-registry/voice-design-contract'

export const PROJECT_PRODUCTION_OPERATION_IDS = [
  'create_image',
  'create_video',
  'create_audio',
  'generate_voice',
] as const

export type ProjectProductionOperationId = typeof PROJECT_PRODUCTION_OPERATION_IDS[number]

export type ProjectProductionCapabilities = {
  readonly image: {
    readonly characterModelKey: string | null
    readonly locationModelKey: string | null
    readonly editModelKey: string | null
  } | null
  readonly video: {
    readonly modelKey: string
    readonly aspectRatio: string
    readonly allowedSegmentDurationsSeconds: readonly number[]
    readonly minSegmentDurationSeconds: number
    readonly maxSegmentDurationSeconds: number
    readonly maxReferenceImages: number
    readonly maxReferenceAudios: number
    readonly maxReferenceVideos: number
    readonly maxReferenceFiles: number
    readonly referenceAudioRequiresVisual: boolean
    readonly minReferenceAudioDurationMs: number | null
    readonly maxTotalReferenceAudioDurationMs: number | null
    readonly supportedInputModes: readonly VideoInputMode[]
  } | null
  readonly music: {
    readonly modelKey: string
    readonly generationMode: 'composition_plan'
    readonly maxChunks: number
    readonly minChunkDurationMs: number
    readonly maxChunkDurationMs: number
    readonly minPlanDurationMs: number
    readonly maxPlanDurationMs: number
    readonly maxPositiveStyles: number
    readonly maxNegativeStyles: number
    readonly contextAdherenceOptions: readonly ('low' | 'medium' | 'high')[]
  } | null
  readonly voice: {
    readonly modelKey: string
  } | null
}

export type ProjectProductionContext = {
  readonly schemaVersion: 5
  readonly version: string
  readonly project: {
    readonly projectId: string
    readonly name: string
    readonly description: string | null
    readonly videoRatio: string | null
    readonly videoResolution: string
    readonly imageResolution: string
  }
  readonly productionCapabilities: ProjectProductionCapabilities
  readonly availableOperations: readonly ProjectProductionOperationId[]
}

export class ProjectProductionContextError extends Error {
  constructor() {
    super('PROJECT_PRODUCTION_CONTEXT_NOT_OWNED')
    this.name = 'ProjectProductionContextError'
  }
}

function effectiveModelKey(
  modelKey: string | null,
  effectiveModelKeys: ReadonlySet<string>,
): string | null {
  return modelKey && effectiveModelKeys.has(modelKey) ? modelKey : null
}

function resolveProductionCapabilities(
  config: ProjectModelConfig,
  effectiveModelKeys: ReadonlySet<string>,
  voiceAvailable: boolean,
): ProjectProductionCapabilities {
  const characterModelKey = effectiveModelKey(config.characterModel, effectiveModelKeys)
  const locationModelKey = effectiveModelKey(config.locationModel, effectiveModelKeys)
  const editModelKey = effectiveModelKey(config.editModel, effectiveModelKeys)
  const imageCapabilities = characterModelKey || locationModelKey || editModelKey
    ? { characterModelKey, locationModelKey, editModelKey }
    : null
  const videoModelKey = effectiveModelKey(config.videoModel, effectiveModelKeys)
  const video = videoModelKey
    ? resolveEffectiveCapabilitiesByModelKey('video', videoModelKey)?.video
    : undefined
  const allowedSegmentDurationsSeconds = Array.from(new Set(
    (video?.durationOptions ?? []).filter((duration): duration is number => (
      Number.isInteger(duration)
      && duration > 0
      && duration <= CREATIVE_VIDEO_SEGMENT_DURATION_CEILING_SECONDS
    )),
  )).sort((left, right) => left - right)
  const minSegmentDurationSeconds = allowedSegmentDurationsSeconds[0]
  const maxSegmentDurationSeconds = allowedSegmentDurationsSeconds.at(-1)
  const videoCapabilities = videoModelKey
    && config.videoRatio
    && video
    && minSegmentDurationSeconds !== undefined
    && maxSegmentDurationSeconds !== undefined
    ? {
        modelKey: videoModelKey,
        aspectRatio: config.videoRatio,
        allowedSegmentDurationsSeconds,
        minSegmentDurationSeconds,
        maxSegmentDurationSeconds,
        maxReferenceImages: video.maxReferenceImages ?? 1,
        maxReferenceAudios: video.maxReferenceAudios ?? 0,
        maxReferenceVideos: video.maxReferenceVideos ?? 0,
        maxReferenceFiles: video.maxReferenceFiles ?? 0,
        referenceAudioRequiresVisual: video.referenceAudioRequiresVisual === true,
        minReferenceAudioDurationMs: video.minReferenceAudioDurationMs ?? null,
        maxTotalReferenceAudioDurationMs: video.maxTotalReferenceAudioDurationMs ?? null,
        supportedInputModes: video.supportedInputModes ?? [],
      }
    : null

  const musicModelKey = effectiveModelKey(config.musicModel, effectiveModelKeys)
  const music = musicModelKey
    ? resolveEffectiveCapabilitiesByModelKey('music', musicModelKey)?.music
    : undefined
  const compositionPlan = music?.compositionPlan
  const musicCapabilities = musicModelKey
    && music?.generationModes?.includes('composition_plan')
    && compositionPlan
      ? {
        modelKey: musicModelKey,
        generationMode: 'composition_plan' as const,
        maxChunks: compositionPlan.maxChunks,
        minChunkDurationMs: compositionPlan.minChunkDurationMs,
        maxChunkDurationMs: compositionPlan.maxChunkDurationMs,
        minPlanDurationMs: compositionPlan.minPlanDurationMs,
        maxPlanDurationMs: compositionPlan.maxPlanDurationMs,
        maxPositiveStyles: compositionPlan.maxPositiveStyles,
        maxNegativeStyles: compositionPlan.maxNegativeStyles,
        contextAdherenceOptions: compositionPlan.contextAdherenceOptions,
      }
    : null

  return {
    image: imageCapabilities,
    video: videoCapabilities,
    music: musicCapabilities,
    voice: voiceAvailable ? { modelKey: PLATFORM_VOICE_DESIGN_MODEL_KEY } : null,
  }
}

export function listAvailableProjectProductionOperations(
  capabilities: ProjectProductionCapabilities,
): readonly ProjectProductionOperationId[] {
  return [
    ...(capabilities.image ? ['create_image' as const] : []),
    ...(capabilities.video ? ['create_video' as const] : []),
    ...(capabilities.music ? ['create_audio' as const] : []),
    ...(capabilities.voice ? ['generate_voice' as const] : []),
  ]
}

function contextVersion(value: Omit<ProjectProductionContext, 'version'>): string {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex')
}

export async function readProjectProductionContext(input: {
  readonly projectId: string
  readonly userId: string
}): Promise<ProjectProductionContext> {
  const [project, modelConfig, effectiveModels, voiceAvailable] = await Promise.all([
    prisma.project.findFirst({
      where: { id: input.projectId, userId: input.userId },
      select: {
        id: true,
        name: true,
        description: true,
        videoResolution: true,
        imageResolution: true,
      },
    }),
    getProjectModelConfig(input.projectId, input.userId),
    getUserModels(input.userId),
    hasEffectiveProviderConfiguration(input.userId, 'fal'),
  ])
  if (!project) throw new ProjectProductionContextError()
  const productionCapabilities = resolveProductionCapabilities(
    modelConfig,
    new Set(effectiveModels.map((model) => model.modelKey)),
    voiceAvailable,
  )
  const value: Omit<ProjectProductionContext, 'version'> = {
    schemaVersion: 5,
    project: {
      projectId: project.id,
      name: project.name,
      description: project.description,
      videoRatio: modelConfig.videoRatio,
      videoResolution: project.videoResolution,
      imageResolution: project.imageResolution,
    },
    productionCapabilities,
    availableOperations: listAvailableProjectProductionOperations(productionCapabilities),
  }
  return { ...value, version: contextVersion(value) }
}

export function formatProjectProductionContext(context: ProjectProductionContext): string {
  return JSON.stringify(context, null, 2)
}
