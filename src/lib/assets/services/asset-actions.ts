import { prisma } from '@/lib/prisma'
import type { Prisma } from '@prisma/client'
import { NextRequest } from 'next/server'
import { ApiError, getRequestId } from '@/lib/api-errors'
import { resolveRequiredTaskLocale } from '@/lib/task/resolve-locale'
import { submitTask } from '@/lib/task/submitter'
import { TASK_TYPE } from '@/lib/task/types'
import {
  getProjectModelConfig,
  buildImageBillingPayload,
} from '@/lib/config-service'
import { withTaskUiPayload } from '@/lib/task/ui-payload'
import { normalizeImageGenerationCount } from '@/lib/image-generation/count'
import { ensureProjectLocationImageSlots } from '@/lib/image-generation/location-slots'
import { CHARACTER_CANDIDATE_PROMPT_COUNT } from '@/lib/asset-generation/character-candidate-prompts'
import { LOCATION_CANDIDATE_PROMPT_COUNT } from '@/lib/asset-generation/location-candidate-prompts'
import {
  hasCharacterAppearanceOutput,
  hasLocationImageOutput,
} from '@/lib/task/has-output'
import { sanitizeImageInputsForTaskPayload } from '@/lib/media/outbound-image'
import {
  CHARACTER_ASSET_IMAGE_RATIO,
  LOCATION_IMAGE_RATIO,
  PROP_IMAGE_RATIO,
  removeLocationPromptSuffix,
  removePropPromptSuffix,
} from '@/lib/constants'
import { decodeImageUrlsFromDb, encodeImageUrls } from '@/lib/contracts/image-urls-contract'
import { resolveEditScriptStyleBibleSignatureForTask } from '@/lib/edit-script/style-bible-prompt'
import type { AssetKind } from '@/lib/assets/contracts'
import { createPlannedTask, requirePlannedTaskBillingInfo, type PlannedTask } from '@/lib/operations/planning'
import {
  createProjectLocationBackedAsset,
  deleteProjectLocationBackedAsset,
  type LocationBackedAssetKind,
} from '@/lib/assets/services/location-backed-assets'
import { resolvePropVisualDescription } from '@/lib/assets/prop-description'
import { confirmProjectLocationBackedSelection } from '@/lib/assets/services/project-location-backed-selection'
import {
  requireAssetBodyVariantOwnership,
  requireAssetProjectId,
  requireOwnedAssetProject,
  requireOwnedAssetTarget,
  requireOwnedAssetVariant,
  type AssetOwnershipClient,
  type AssetWriteAccess,
} from '@/lib/assets/services/project-asset-ownership'

type AssetActionTarget = {
  kind: Extract<AssetKind, 'character' | 'location' | 'prop'>
  assetId: string
}

export type AssetGenerateInput = AssetActionTarget & {
  request: NextRequest
  body: Record<string, unknown>
  access: AssetWriteAccess
  episodeId?: string | null
}

type PlannedAssetTask = {
  userId: string
  projectId: string
  task: PlannedTask
}

type AssetModifyInput = AssetActionTarget & {
  request: NextRequest
  body: Record<string, unknown>
  access: AssetWriteAccess
}

type AssetSelectInput = AssetActionTarget & {
  body: Record<string, unknown>
  access: AssetWriteAccess
}

type AssetRevertInput = AssetActionTarget & {
  body: Record<string, unknown>
  access: AssetWriteAccess
}

type AssetUpdateInput = {
  kind: AssetKind
  assetId: string
  body: Record<string, unknown>
  access: AssetWriteAccess
}

type AssetVariantUpdateInput = {
  kind: Extract<AssetKind, 'character' | 'location' | 'prop'>
  assetId: string
  variantId: string
  body: Record<string, unknown>
  access: AssetWriteAccess
}

type AssetCreateInput = {
  kind: Extract<AssetKind, 'location' | 'prop'>
  body: Record<string, unknown>
  access: AssetWriteAccess
}

type AssetRemoveInput = {
  kind: Extract<AssetKind, 'location' | 'prop'>
  assetId: string
  access: AssetWriteAccess
}

function normalizeString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

function toObject(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {}
  return value as Record<string, unknown>
}

function toNumber(value: unknown): number | null {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

function assertNoLegacyArtStyle(body: Record<string, unknown>) {
  if (!Object.prototype.hasOwnProperty.call(body, 'artStyle')) return
  throw new ApiError('INVALID_PARAMS', {
    code: 'LEGACY_ART_STYLE_REMOVED',
    field: 'artStyle',
    message: 'artStyle is no longer supported; use the AI-generated Style Bible workflow.',
  })
}

function resolveGroupedCharacterGenerateCount(value: unknown): number {
  const normalized = normalizeImageGenerationCount('character', value, CHARACTER_CANDIDATE_PROMPT_COUNT)
  return normalized === 1 ? 1 : CHARACTER_CANDIDATE_PROMPT_COUNT
}

function resolveGroupedLocationGenerateCount(value: unknown): number {
  return normalizeImageGenerationCount('location', value, LOCATION_CANDIDATE_PROMPT_COUNT)
}

function normalizeLocationBackedKind(kind: AssetKind): 'character' | 'location' {
  return kind === 'character' ? 'character' : 'location'
}

function resolveAssetGenerationAspectRatio(kind: AssetKind): string {
  if (kind === 'character') return CHARACTER_ASSET_IMAGE_RATIO
  if (kind === 'prop') return PROP_IMAGE_RATIO
  return LOCATION_IMAGE_RATIO
}

function resolveAssetModifyAspectRatio(kind: AssetKind): string {
  if (kind === 'character') return CHARACTER_ASSET_IMAGE_RATIO
  if (kind === 'prop') return PROP_IMAGE_RATIO
  if (kind === 'location') return LOCATION_IMAGE_RATIO
  return CHARACTER_ASSET_IMAGE_RATIO
}

function requireLocationBackedKind(kind: AssetKind): LocationBackedAssetKind {
  if (kind !== 'location' && kind !== 'prop') {
    throw new ApiError('INVALID_PARAMS')
  }
  return kind
}

async function submitAssetPlannedTask(input: PlannedAssetTask, request: NextRequest) {
  return await submitTask({
    userId: input.userId,
    locale: input.task.locale,
    requestId: getRequestId(request),
    projectId: input.projectId,
    episodeId: input.task.episodeId ?? null,
    type: input.task.taskType,
    targetType: input.task.target.targetType,
    targetId: input.task.target.targetId,
    payload: input.task.payload,
    dedupeKey: input.task.dedupeKey ?? null,
    priority: input.task.priority,
    billingInfo: input.task.billingInfo,
    billingInfoSource: 'planned',
  })
}

export async function submitAssetGenerateTask(input: AssetGenerateInput) {
  const planned = await planAssetGenerateTask(input)
  await ensureAssetGenerateCommitReady(input)
  return await submitAssetPlannedTask(planned, input.request)
}

export async function ensureAssetGenerateCommitReady(
  input: AssetGenerateInput,
  client: AssetOwnershipClient = prisma,
): Promise<void> {
  await requireAssetBodyVariantOwnership(input, client)
  const normalizedKind = normalizeLocationBackedKind(input.kind)
  if (normalizedKind !== 'location') return

  const imageIndex = toNumber(input.body.imageIndex)
  if (imageIndex !== null) return

  const count = resolveGroupedLocationGenerateCount(input.body.count)
  const projectId = requireAssetProjectId(input.access)
  const location = await client.projectLocation.findFirst({
    where: {
      id: input.assetId,
      projectId,
    },
    select: {
      name: true,
      summary: true,
      assetKind: true,
      images: {
        orderBy: { imageIndex: 'asc' },
        take: 1,
        select: { description: true },
      },
    },
  })
  if (!location) {
    throw new ApiError('NOT_FOUND')
  }
  await ensureProjectLocationImageSlots(
    {
      locationId: input.assetId,
      count,
      fallbackDescription:
        location.assetKind === 'prop'
          ? resolvePropVisualDescription({
              name: location.name,
              summary: location.summary,
              description: location.images[0]?.description ?? null,
            })
          : location.summary || location.name,
    },
    client,
  )
}

export async function planAssetGenerateTask(input: AssetGenerateInput): Promise<PlannedAssetTask> {
  await requireAssetBodyVariantOwnership(input)
  assertNoLegacyArtStyle(input.body)
  const projectId = requireAssetProjectId(input.access)
  const locale = resolveRequiredTaskLocale(input.request, input.body)
  const normalizedKind = normalizeLocationBackedKind(input.kind)
  const appearanceId = normalizeString(input.body.appearanceId)
  const imageIndex = toNumber(input.body.imageIndex)
  const count =
    normalizedKind === 'character'
      ? imageIndex === null
        ? resolveGroupedCharacterGenerateCount(input.body.count)
        : normalizeImageGenerationCount('character', input.body.count)
      : imageIndex === null
        ? resolveGroupedLocationGenerateCount(input.body.count)
        : normalizeImageGenerationCount('location', input.body.count)

  const taskType = normalizedKind === 'character' ? TASK_TYPE.IMAGE_CHARACTER : TASK_TYPE.IMAGE_LOCATION
  const targetType = normalizedKind === 'character' ? 'CharacterAppearance' : 'LocationImage'
  const targetId = normalizedKind === 'character' ? appearanceId || input.assetId : input.assetId
  if (!targetId) {
    throw new ApiError('INVALID_PARAMS')
  }
  const hasOutputAtStart =
    normalizedKind === 'character'
      ? await hasCharacterAppearanceOutput({
          appearanceId: targetId,
          characterId: input.assetId,
          appearanceIndex: toNumber(input.body.appearanceIndex),
        })
      : await hasLocationImageOutput({
          locationId: input.assetId,
          imageIndex,
        })

  const projectModelConfig = await getProjectModelConfig(projectId, input.access.userId)
  const imageModel = normalizedKind === 'character' ? projectModelConfig.characterModel : projectModelConfig.locationModel
  const payloadBase = {
    ...input.body,
    type: input.kind,
    id: input.assetId,
    count,
  }
  const styleBibleSignature = await resolveEditScriptStyleBibleSignatureForTask({
    projectId,
    episodeId: input.episodeId ?? null,
  })

  let billingPayload: Record<string, unknown>
  try {
    billingPayload = await buildImageBillingPayload({
      projectId,
      userId: input.access.userId,
      imageModel,
      basePayload: payloadBase,
      aspectRatio: resolveAssetGenerationAspectRatio(input.kind),
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Image model capability not configured'
    throw new ApiError('INVALID_PARAMS', {
      code: 'IMAGE_MODEL_CAPABILITY_NOT_CONFIGURED',
      message,
    })
  }

  return {
    userId: input.access.userId,
    projectId,
    task: createPlannedTask({
      id: `${taskType}:${targetType}:${targetId}`,
      taskType,
      targetType,
      targetId,
      payload: withTaskUiPayload(billingPayload, { hasOutputAtStart }),
      locale,
      episodeId: input.episodeId ?? null,
      dedupeKey: `${taskType}:${targetId}:${imageIndex === null ? count : `single:${imageIndex}`}:${styleBibleSignature}`,
      billingInfo: requirePlannedTaskBillingInfo({
        taskType,
        payload: billingPayload,
        allowedApiTypes: ['image'],
      }),
    }),
  }
}

export async function submitAssetModifyTask(input: AssetModifyInput) {
  const planned = await planAssetModifyTask(input)
  return await submitAssetPlannedTask(planned, input.request)
}

export async function planAssetModifyTask(input: AssetModifyInput): Promise<PlannedAssetTask> {
  await requireAssetBodyVariantOwnership(input)
  const projectId = requireAssetProjectId(input.access)
  const locale = resolveRequiredTaskLocale(input.request, input.body)
  const modifyPrompt = normalizeString(input.body.modifyPrompt)
  if (!modifyPrompt) {
    throw new ApiError('INVALID_PARAMS')
  }
  const normalizedKind = normalizeLocationBackedKind(input.kind)
  const targetType = normalizedKind === 'character' ? 'CharacterAppearance' : 'LocationImage'
  const targetId =
    normalizedKind === 'character'
      ? normalizeString(input.body.appearanceId) || input.assetId
      : normalizeString(input.body.locationImageId) || input.assetId
  if (!targetId) {
    throw new ApiError('INVALID_PARAMS')
  }
  const hasOutputAtStart =
    normalizedKind === 'character'
      ? await hasCharacterAppearanceOutput({
          appearanceId: normalizeString(input.body.appearanceId) || null,
          characterId: input.assetId,
          appearanceIndex: toNumber(input.body.appearanceIndex),
        })
      : await hasLocationImageOutput({
          imageId: normalizeString(input.body.locationImageId) || null,
          locationId: input.assetId,
          imageIndex: toNumber(input.body.imageIndex),
        })
  const extraImageAudit = sanitizeImageInputsForTaskPayload(Array.isArray(input.body.extraImageUrls) ? input.body.extraImageUrls : [])
  if (extraImageAudit.issues.some((issue) => issue.reason === 'relative_path_rejected')) {
    throw new ApiError('INVALID_PARAMS')
  }
  const payload = {
    ...input.body,
    type: input.kind,
    characterId: normalizedKind === 'character' ? input.assetId : undefined,
    locationId: normalizedKind === 'location' ? input.assetId : undefined,
    extraImageUrls: extraImageAudit.normalized,
    meta: {
      ...toObject(input.body.meta),
      outboundImageInputAudit: {
        extraImageUrls: extraImageAudit.issues,
      },
    },
  }
  const projectModelConfig = await getProjectModelConfig(projectId, input.access.userId)
  let billingPayload: Record<string, unknown>
  try {
    billingPayload = await buildImageBillingPayload({
      projectId,
      userId: input.access.userId,
      imageModel: projectModelConfig.editModel,
      basePayload: payload,
      aspectRatio: resolveAssetModifyAspectRatio(input.kind),
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Image model capability not configured'
    throw new ApiError('INVALID_PARAMS', {
      code: 'IMAGE_MODEL_CAPABILITY_NOT_CONFIGURED',
      message,
    })
  }
  return {
    userId: input.access.userId,
    projectId,
    task: createPlannedTask({
      id: `${TASK_TYPE.MODIFY_ASSET_IMAGE}:${targetType}:${targetId}`,
      taskType: TASK_TYPE.MODIFY_ASSET_IMAGE,
      targetType,
      targetId,
      payload: withTaskUiPayload(billingPayload, {
        intent: 'modify',
        hasOutputAtStart,
      }),
      locale,
      dedupeKey: `modify_asset_image:${targetType}:${targetId}:${input.body.imageIndex ?? 'na'}`,
      billingInfo: requirePlannedTaskBillingInfo({
        taskType: TASK_TYPE.MODIFY_ASSET_IMAGE,
        payload: billingPayload,
        allowedApiTypes: ['image'],
      }),
    }),
  }
}

export async function selectAssetRender(
  input: AssetSelectInput,
  client: Prisma.TransactionClient,
) {
  await requireAssetBodyVariantOwnership(input, client)
  if (input.kind === 'character') {
    const appearanceId = normalizeString(input.body.appearanceId) || normalizeString(input.body.variantId)
    const selectedIndex = toNumber(input.body.selectedIndex ?? input.body.imageIndex)
    if (!appearanceId) throw new ApiError('INVALID_PARAMS')
    const appearance = await client.characterAppearance.findUnique({
      where: { id: appearanceId },
      include: { character: true },
    })
    if (!appearance) throw new ApiError('NOT_FOUND')
    const imageUrls = decodeImageUrlsFromDb(appearance.imageUrls, 'characterAppearance.imageUrls')
    if (selectedIndex !== null && (selectedIndex < 0 || selectedIndex >= imageUrls.length || !imageUrls[selectedIndex])) {
      throw new ApiError('INVALID_PARAMS')
    }
    const selectedImageKey = selectedIndex !== null ? imageUrls[selectedIndex] : null
    await client.characterAppearance.update({
      where: { id: appearance.id },
      data: { selectedIndex, imageUrl: selectedImageKey },
    })
    return { success: true }
  }
  const selectedIndex = toNumber(input.body.selectedIndex ?? input.body.imageIndex)
  const confirm = input.body.confirm === true
  if (confirm) {
    return confirmProjectLocationBackedSelection(input.assetId, selectedIndex, client)
  }
  const location = await client.projectLocation.findUnique({
    where: { id: input.assetId },
    include: { images: { orderBy: { imageIndex: 'asc' } } },
  })
  if (!location) throw new ApiError('NOT_FOUND')

  if (selectedIndex !== null) {
    const targetImage = location.images.find((image) => image.imageIndex === selectedIndex)
    if (!targetImage || !targetImage.imageUrl) {
      throw new ApiError('INVALID_PARAMS')
    }
  }
  await client.locationImage.updateMany({
    where: { locationId: input.assetId },
    data: { isSelected: false },
  })
  if (selectedIndex !== null) {
    const updated = await client.locationImage.update({
      where: {
        locationId_imageIndex: {
          locationId: input.assetId,
          imageIndex: selectedIndex,
        },
      },
      data: { isSelected: true },
    })
    await client.projectLocation.update({
      where: { id: input.assetId },
      data: { selectedImageId: updated.id },
    })
  } else {
    await client.projectLocation.update({
      where: { id: input.assetId },
      data: { selectedImageId: null },
    })
  }
  return { success: true }
}

export async function revertAssetRender(
  input: AssetRevertInput,
  client: Prisma.TransactionClient,
) {
  await requireAssetBodyVariantOwnership(input, client)
  if (input.kind === 'character') {
    const appearanceId = normalizeString(input.body.appearanceId) || normalizeString(input.body.variantId)
    if (!appearanceId) throw new ApiError('INVALID_PARAMS')
    const appearance = await client.characterAppearance.findUnique({
      where: { id: appearanceId },
    })
    if (!appearance) throw new ApiError('NOT_FOUND')
    const previousImageUrls = decodeImageUrlsFromDb(appearance.previousImageUrls, 'characterAppearance.previousImageUrls')
    if (!appearance.previousImageUrl && previousImageUrls.length === 0) throw new ApiError('INVALID_PARAMS')
    const restoredImageUrls =
      previousImageUrls.length > 0 ? previousImageUrls : appearance.previousImageUrl ? [appearance.previousImageUrl] : []
    await client.characterAppearance.update({
      where: { id: appearance.id },
      data: {
        imageUrl: appearance.previousImageUrl || restoredImageUrls[0] || null,
        imageUrls: encodeImageUrls(restoredImageUrls),
        previousImageUrl: null,
        previousImageUrls: encodeImageUrls([]),
        selectedIndex: null,
        description: appearance.previousDescription ?? appearance.description,
        descriptions: appearance.previousDescriptions ?? appearance.descriptions,
        previousDescription: null,
        previousDescriptions: null,
      },
    })
    return { success: true }
  }
  const location = await client.projectLocation.findUnique({
    where: { id: input.assetId },
    include: { images: { orderBy: { imageIndex: 'asc' } } },
  })
  if (!location) throw new ApiError('NOT_FOUND')
  for (const image of location.images) {
    if (image.previousImageUrl) {
      await client.locationImage.update({
        where: { id: image.id },
        data: {
          imageUrl: image.previousImageUrl,
          previousImageUrl: null,
          spatialProfileStatus: 'stale',
          spatialProfileError: null,
          description: image.previousDescription ?? image.description,
          previousDescription: null,
        },
      })
    }
  }
  return { success: true }
}

export async function updateAsset(input: AssetUpdateInput, transaction: Prisma.TransactionClient) {
  await requireOwnedAssetTarget(input, transaction)
  if (input.kind === 'character') {
    const updateData: Record<string, unknown> = {}
    if (input.body.name !== undefined) updateData.name = normalizeString(input.body.name)
    if (input.body.introduction !== undefined) updateData.introduction = normalizeString(input.body.introduction)
    if (input.body.profileConfirmed !== undefined) updateData.profileConfirmed = input.body.profileConfirmed
    const character = await transaction.projectCharacter.update({
      where: { id: input.assetId },
      data: updateData,
    })
    return { success: true, character }
  }
  if (input.kind === 'location') {
    const updateData: Record<string, unknown> = {}
    if (input.body.name !== undefined) updateData.name = normalizeString(input.body.name)
    if (input.body.summary !== undefined) updateData.summary = normalizeString(input.body.summary) || null
    const location = await transaction.projectLocation.update({
      where: { id: input.assetId },
      data: updateData,
    })
    return { success: true, location }
  }
  if (input.kind === 'prop') {
    const updateData: Record<string, unknown> = {}
    if (input.body.name !== undefined) updateData.name = normalizeString(input.body.name)
    if (input.body.summary !== undefined) updateData.summary = normalizeString(input.body.summary) || null
    const prop = await transaction.projectLocation.update({
      where: { id: input.assetId },
      data: updateData,
    })
    return { success: true, prop }
  }
  throw new ApiError('INVALID_PARAMS')
}

export async function updateAssetVariant(input: AssetVariantUpdateInput, transaction: Prisma.TransactionClient) {
  await requireOwnedAssetVariant(input, transaction)
  if (input.kind === 'character') {
    const appearance = await transaction.characterAppearance.findUnique({
      where: { id: input.variantId },
    })
    if (!appearance) throw new ApiError('NOT_FOUND')
    const trimmedDescription = normalizeString(input.body.description)
    if (!trimmedDescription) throw new ApiError('INVALID_PARAMS')
    let descriptions: string[] = []
    try {
      descriptions = appearance.descriptions ? (JSON.parse(appearance.descriptions) as string[]) : []
    } catch {
      descriptions = []
    }
    const descriptionIndex = toNumber(input.body.descriptionIndex) ?? 0
    if (descriptionIndex >= 0 && descriptionIndex < descriptions.length) descriptions[descriptionIndex] = trimmedDescription
    else descriptions.push(trimmedDescription)
    await transaction.characterAppearance.update({
      where: { id: input.variantId },
      data: {
        description: trimmedDescription,
        descriptions: JSON.stringify(descriptions),
      },
    })
    return { success: true }
  }
  if (input.kind === 'prop') {
    const trimmedDescription = normalizeString(input.body.description)
    if (!trimmedDescription) throw new ApiError('INVALID_PARAMS')
    const cleanDescription = removePropPromptSuffix(trimmedDescription)
    const image = await transaction.locationImage.update({
      where: { id: input.variantId },
      data: { description: cleanDescription },
    })
    return { success: true, image }
  }
  const trimmedDescription = normalizeString(input.body.description)
  if (!trimmedDescription) throw new ApiError('INVALID_PARAMS')
  const cleanDescription = removeLocationPromptSuffix(trimmedDescription)
  const image = await transaction.locationImage.update({
    where: { id: input.variantId },
    data: { description: cleanDescription },
  })
  return { success: true, image }
}

export async function createAsset(input: AssetCreateInput, transaction: Prisma.TransactionClient) {
  assertNoLegacyArtStyle(input.body)
  const name = normalizeString(input.body.name)
  const kind = requireLocationBackedKind(input.kind)
  const summary = normalizeString(input.body.summary || input.body.description)
  const description = kind === 'prop' ? normalizeString(input.body.description) : summary
  if (!name || !summary || !description) {
    throw new ApiError('INVALID_PARAMS')
  }

  const created = await createProjectLocationBackedAsset({
    projectId: await requireOwnedAssetProject(input.access, transaction),
    name,
    summary,
    initialDescription: description,
    kind,
  }, transaction)
  return { success: true, assetId: created.id }
}

export async function removeAsset(input: AssetRemoveInput, transaction: Prisma.TransactionClient) {
  requireLocationBackedKind(input.kind)
  await requireOwnedAssetTarget(input, transaction)
  await deleteProjectLocationBackedAsset(input.assetId, transaction)
  return { success: true }
}
