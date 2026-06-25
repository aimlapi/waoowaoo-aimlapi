import { type Job } from 'bullmq'
import { prisma } from '@/lib/prisma'
import { addLocationPromptSuffix, addPropPromptSuffix } from '@/lib/constants'
import { normalizeImageGenerationCount } from '@/lib/image-generation/count'
import { TASK_EVENT_TYPE, type TaskJobData } from '@/lib/task/types'
import { publishTaskEvent } from '@/lib/task/publisher'
import { executeAiTextStep } from '@/lib/ai-exec/engine'
import { safeParseJsonObject } from '@/lib/json-repair'
import {
  appendLocationSceneBoardViewRule,
  buildLocationSceneBoardLayoutPlan,
  buildLocationSceneBoardView,
  parseLocationSceneBoardLayoutPlan,
  parseLocationSceneBoardPrompt,
  resolveLocationSceneBoardView,
  stripLocationSceneBoardSlotDescription,
  type LocationSceneBoardView,
} from '@/lib/asset-generation/location-scene-board-prompts'
import { reportTaskProgress } from '../shared'
import {
  assertTaskActive,
  getProjectModels,
} from '../utils'
import {
  AnyObj,
  buildImageProviderRuntimeOptions,
  generateCleanImageToStorage,
  pickFirstString,
} from './image-task-handler-shared'
import { buildLocationImagePromptCore } from '@/lib/location-image-prompt'
import { buildPropImagePromptCore } from '@/lib/prop-image-prompt'
import {
  appendStyleBiblePromptBlock,
  resolveEditScriptStyleBibleForTask,
} from '@/lib/edit-script/style-bible-prompt'
import { analyzeAndPersistProjectLocationImageSpatialProfile } from '@/lib/location-spatial-profile/service'
import { markEditAssetRequirementsCompletedForTargets } from '@/lib/edit-script/asset-requirement-status'

interface LocationImageRecord {
  id: string
  locationId: string
  description: string | null
  imageIndex: number
  location?: { name: string } | null
}

interface LocationWithImages {
  id: string
  name: string
  images?: LocationImageRecord[]
}

interface LocationImageTaskDb {
  locationImage: {
    findUnique(args: Record<string, unknown>): Promise<LocationImageRecord | null>
    updateMany(args: Record<string, unknown>): Promise<unknown>
    update(args: Record<string, unknown>): Promise<unknown>
  }
  projectLocation: {
    findUnique(args: Record<string, unknown>): Promise<LocationWithImages | null>
    update(args: Record<string, unknown>): Promise<unknown>
  }
}

function resolveRequestedLocationCount(payload: AnyObj): number | null {
  if (!Object.prototype.hasOwnProperty.call(payload, 'count')) return null
  return normalizeImageGenerationCount('location', payload.count)
}

async function generateLocationSceneBoardPrompt(input: {
  readonly userId: string
  readonly projectId: string
  readonly analysisModel: string
  readonly view: LocationSceneBoardView
}): Promise<string> {
  const completion = await executeAiTextStep({
    userId: input.userId,
    model: input.analysisModel,
    messages: [{ role: 'user', content: input.view.draftInstruction }],
    temperature: 0.72,
    projectId: input.projectId,
    action: 'location_scene_board_prompt',
    meta: {
      stepId: `location_scene_board_prompt:${input.view.id}`,
      stepTitle: input.view.label,
      stepIndex: 1,
      stepTotal: 1,
    },
  })
  return parseLocationSceneBoardPrompt(safeParseJsonObject(completion.text))
}

async function generateLocationSceneBoardLayoutPlan(input: {
  readonly userId: string
  readonly projectId: string
  readonly analysisModel: string
  readonly draftInstruction: string
}): Promise<string> {
  const completion = await executeAiTextStep({
    userId: input.userId,
    model: input.analysisModel,
    messages: [{ role: 'user', content: input.draftInstruction }],
    temperature: 0.35,
    projectId: input.projectId,
    action: 'location_scene_board_layout_plan',
    meta: {
      stepId: 'location_scene_board_layout_plan',
      stepTitle: 'Location spatial layout plan',
      stepIndex: 1,
      stepTotal: 1,
    },
  })
  return parseLocationSceneBoardLayoutPlan(safeParseJsonObject(completion.text))
}

export async function handleLocationImageTask(job: Job<TaskJobData>) {
  const payload = (job.data.payload || {}) as AnyObj
  const projectId = job.data.projectId
  const userId = job.data.userId
  const db = prisma as unknown as LocationImageTaskDb
  const models = await getProjectModels(projectId, userId)
  const modelId = models.locationModel
  if (!modelId) throw new Error('Location model not configured')
  const assetType = payload.type === 'prop' ? 'prop' : 'location'
  const spatialProfileModel = models.analysisModel
  if (assetType === 'location' && !spatialProfileModel) throw new Error('LOCATION_SPATIAL_PROFILE_MODEL_REQUIRED')
  if (Object.prototype.hasOwnProperty.call(payload, 'artStyle')) {
    throw new Error('LEGACY_ART_STYLE_REMOVED')
  }
  const requestedCount = resolveRequestedLocationCount(payload)

  const styleBible = await resolveEditScriptStyleBibleForTask({
    projectId,
    episodeId: job.data.episodeId,
  })
  // targetId may be locationId (group) or locationImageId (single)
  const maybeLocationImage = await db.locationImage.findUnique({
    where: { id: job.data.targetId },
    include: { location: true },
  })

  let locationImages: LocationImageRecord[] = []

  if (maybeLocationImage) {
    if (payload.imageIndex !== undefined) {
      locationImages = [maybeLocationImage]
    } else {
      const location = await db.projectLocation.findUnique({
        where: { id: maybeLocationImage.locationId },
        include: { images: { orderBy: { imageIndex: 'asc' } } },
      })
      const orderedImages = location?.images || [maybeLocationImage]
      locationImages = requestedCount === null ? orderedImages : orderedImages.slice(0, requestedCount)
    }
  } else {
    const locationId = pickFirstString(payload.id, payload.locationId, job.data.targetId)
    if (!locationId) throw new Error('Location id missing')

    const location = await db.projectLocation.findUnique({
      where: { id: locationId },
      include: { images: { orderBy: { imageIndex: 'asc' } } },
    })

    if (!location || !location.images?.length) {
      throw new Error('Location images not found')
    }

    if (payload.imageIndex !== undefined) {
      const image = location.images.find((it) => it.imageIndex === Number(payload.imageIndex))
      if (!image) throw new Error(`Location image not found for imageIndex=${payload.imageIndex}`)
      locationImages = [image]
    } else {
      locationImages = requestedCount === null ? location.images : location.images.slice(0, requestedCount)
    }
  }

  const locationIds = Array.from(new Set(locationImages.map((it) => it.locationId)))
  const completedLocationIds = new Set<string>()
  const selectedLocationImageIds = new Map<string, string>()
  const groupedLocationDescription = assetType === 'location'
    ? stripLocationSceneBoardSlotDescription(locationImages.find((it) => typeof it.description === 'string' && it.description.trim())?.description?.trim() || '')
    : ''
  const locale = job.data.locale === 'en' ? 'en' : 'zh'
  const locationLayoutPlan = await (async () => {
    if (assetType !== 'location') return null
    const profileModel = spatialProfileModel
    if (!profileModel) throw new Error('LOCATION_SPATIAL_PROFILE_MODEL_REQUIRED')
    const layoutSourceDescription = groupedLocationDescription
      || stripLocationSceneBoardSlotDescription(locationImages[0]?.description || '')
    if (!layoutSourceDescription) return null
    await reportTaskProgress(job, 10, {
      stage: 'generate_location_scene_board_layout_plan',
    })
    const layoutView = buildLocationSceneBoardLayoutPlan({
      description: layoutSourceDescription,
      locale,
      styleBible,
    })
    const layoutPlan = await generateLocationSceneBoardLayoutPlan({
      userId,
      projectId,
      analysisModel: profileModel,
      draftInstruction: layoutView.draftInstruction,
    })
    await publishTaskEvent({
      taskId: job.data.taskId,
      projectId,
      userId,
      type: TASK_EVENT_TYPE.PROGRESS,
      taskType: job.data.type,
      targetType: job.data.targetType,
      targetId: job.data.targetId,
      episodeId: job.data.episodeId || null,
      persist: true,
      payload: {
        stage: 'persist_location_scene_board_layout_plan',
        layoutPlan,
      },
    })
    return layoutPlan
  })()

  for (let i = 0; i < locationImages.length; i++) {
    const item = locationImages[i]
    const promptBody = item.description || ''
    if (!promptBody) continue
    const promptCore = await (async () => {
      if (assetType === 'prop') {
        return buildPropImagePromptCore({
          description: promptBody,
        })
      }
      const sourceDescription = payload.imageIndex !== undefined
        ? stripLocationSceneBoardSlotDescription(promptBody)
        : groupedLocationDescription || stripLocationSceneBoardSlotDescription(promptBody)
      const view = buildLocationSceneBoardView({
        description: sourceDescription,
        locale,
        styleBible,
        imageIndex: item.imageIndex,
        layoutPlan: locationLayoutPlan || sourceDescription,
      })
      const profileModel = spatialProfileModel
      if (!profileModel) throw new Error('LOCATION_SPATIAL_PROFILE_MODEL_REQUIRED')
      await reportTaskProgress(job, 12 + Math.floor((i / Math.max(locationImages.length, 1)) * 8), {
        stage: 'generate_location_scene_board_prompt',
        imageId: item.id,
        view: view.id,
      })
      const candidatePrompt = await generateLocationSceneBoardPrompt({
        userId,
        projectId,
        analysisModel: profileModel,
        view,
      })
      return buildLocationImagePromptCore({
        description: appendLocationSceneBoardViewRule({
          prompt: candidatePrompt,
          locale,
          imageIndex: item.imageIndex,
          layoutPlan: locationLayoutPlan || sourceDescription,
        }),
        locale,
      })
    })()

    const promptWithSuffix = assetType === 'prop'
      ? addPropPromptSuffix(promptCore)
      : addLocationPromptSuffix(promptCore)
    const promptBase = promptWithSuffix
    const prompt = appendStyleBiblePromptBlock({
      prompt: promptBase,
      styleBible,
      usage: 'assetImage',
      locale: job.data.locale,
    })
    const promptView = assetType === 'location'
      ? resolveLocationSceneBoardView(item.imageIndex)
      : null
    await publishTaskEvent({
      taskId: job.data.taskId,
      projectId,
      userId,
      type: TASK_EVENT_TYPE.PROGRESS,
      taskType: job.data.type,
      targetType: job.data.targetType,
      targetId: job.data.targetId,
      episodeId: job.data.episodeId || null,
      persist: true,
      payload: {
        stage: 'persist_location_image_prompt',
        imageId: item.id,
        imageIndex: item.imageIndex,
        view: promptView?.id ?? null,
        finalPrompt: prompt,
        modelId,
        generationOptions: payload.generationOptions ?? null,
      },
    })
    await reportTaskProgress(job, 20 + Math.floor((i / Math.max(locationImages.length, 1)) * 55), {
      stage: 'generate_location_image',
      imageId: item.id,
    })

    const imageKey = await generateCleanImageToStorage({
      job,
      userId,
      modelId,
      prompt,
      targetId: item.id,
      keyPrefix: 'location',
      options: buildImageProviderRuntimeOptions({
        generationOptions: payload.generationOptions,
        context: assetType === 'prop' ? 'prop_image' : 'location_image',
      }),
    })

    await assertTaskActive(job, 'persist_location_image')
    await db.locationImage.update({
      where: { id: item.id },
      data: {
        imageUrl: imageKey,
        ...(assetType === 'location'
          ? {
            spatialProfileStatus: 'stale',
            spatialProfileError: null,
          }
          : {}),
      },
    })
    if (assetType === 'location') {
      const profileModel = spatialProfileModel
      if (!profileModel) throw new Error('LOCATION_SPATIAL_PROFILE_MODEL_REQUIRED')
      await assertTaskActive(job, 'analyze_location_spatial_profile')
      await reportTaskProgress(job, 78 + Math.floor((i / Math.max(locationImages.length, 1)) * 15), {
        stage: 'analyze_location_spatial_profile',
        imageId: item.id,
      })
      await analyzeAndPersistProjectLocationImageSpatialProfile({
        imageId: item.id,
        userId,
        projectId,
        model: profileModel,
        locale: job.data.locale === 'en' ? 'en' : 'zh',
      })
      if (!selectedLocationImageIds.has(item.locationId)) {
        selectedLocationImageIds.set(item.locationId, item.id)
      }
    }
    completedLocationIds.add(item.locationId)
  }
  for (const [locationId, imageId] of selectedLocationImageIds) {
    await assertTaskActive(job, 'select_location_image')
    await db.locationImage.updateMany({
      where: { locationId },
      data: { isSelected: false },
    })
    await db.locationImage.update({
      where: { id: imageId },
      data: { isSelected: true },
    })
    await db.projectLocation.update({
      where: { id: locationId },
      data: { selectedImageId: imageId },
    })
  }
  await markEditAssetRequirementsCompletedForTargets({
    projectId,
    kind: assetType,
    targetIds: [...completedLocationIds],
  })

  return {
    updated: locationImages.length,
    locationIds,
  }
}
