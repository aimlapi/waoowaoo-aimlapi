import { randomUUID } from 'crypto'
import { Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import type { LocationSpatialProfileStatus } from '@/lib/location-spatial-profile/types'

export type LocationBackedAssetKind = 'location' | 'prop'

type ProjectLocationBackedAssetRow = {
  id: string
  projectId: string
  name: string
  summary: string | null
  selectedImageId: string | null
  assetKind: LocationBackedAssetKind
}

type LocationBackedImageRow = {
  id: string
  imageIndex: number
  description: string | null
  imageUrl: string | null
  spatialProfileJson: unknown | null
  spatialProfileStatus: LocationSpatialProfileStatus | null
  spatialProfileError: string | null
  spatialProfileAnalyzedAt: Date | null
  spatialProfileModel: string | null
  imageMediaId: string | null
  previousImageUrl: string | null
  previousImageMediaId: string | null
  previousDescription: string | null
  isSelected: boolean
  locationId: string
}

export type ProjectLocationBackedAssetRecord = ProjectLocationBackedAssetRow & {
  images: LocationBackedImageRow[]
}

function buildImageGroups(
  images: LocationBackedImageRow[],
): Map<string, LocationBackedImageRow[]> {
  const groups = new Map<string, LocationBackedImageRow[]>()
  for (const image of images) {
    const current = groups.get(image.locationId)
    if (current) {
      current.push(image)
      continue
    }
    groups.set(image.locationId, [image])
  }
  for (const groupedImages of groups.values()) {
    groupedImages.sort((left, right) => left.imageIndex - right.imageIndex)
  }
  return groups
}

function normalizeSeedDescriptions(input: {
  descriptions?: string[]
  fallbackDescription: string
}): string[] {
  const normalized = (input.descriptions ?? [])
    .map((description) => description.trim())
    .filter((description) => description.length > 0)

  if (normalized.length > 0) {
    return normalized
  }

  const fallbackDescription = input.fallbackDescription.trim()
  return fallbackDescription.length > 0 ? [fallbackDescription] : []
}

async function readProjectLocationBackedImages(locationIds: string[]): Promise<Map<string, LocationBackedImageRow[]>> {
  if (locationIds.length === 0) {
    return new Map()
  }
  const rows = await prisma.$queryRaw<LocationBackedImageRow[]>(Prisma.sql`
    SELECT
      id,
      imageIndex,
      description,
      imageUrl,
      spatialProfileJson,
      spatialProfileStatus,
      spatialProfileError,
      spatialProfileAnalyzedAt,
      spatialProfileModel,
      imageMediaId,
      previousImageUrl,
      NULL AS previousImageMediaId,
      previousDescription,
      isSelected,
      locationId
    FROM location_images
    WHERE locationId IN (${Prisma.join(locationIds)})
    ORDER BY locationId ASC, imageIndex ASC
  `)
  return buildImageGroups(rows)
}

export async function listProjectLocationBackedAssets(
  projectId: string,
  kind: LocationBackedAssetKind,
): Promise<ProjectLocationBackedAssetRecord[]> {
  const rows = await prisma.$queryRaw<ProjectLocationBackedAssetRow[]>(Prisma.sql`
    SELECT
      id,
      projectId,
      name,
      summary,
      selectedImageId,
      assetKind
    FROM project_locations
    WHERE projectId = ${projectId}
      AND assetKind = ${kind}
    ORDER BY createdAt ASC
  `)
  const imagesByLocationId = await readProjectLocationBackedImages(rows.map((row) => row.id))
  return rows.map((row) => ({
    ...row,
    images: imagesByLocationId.get(row.id) ?? [],
  }))
}

export async function createProjectLocationBackedAsset(input: {
  projectId: string
  name: string
  summary: string
  initialDescription?: string
  kind: LocationBackedAssetKind
}, transaction: Prisma.TransactionClient): Promise<{ id: string }> {
  const id = randomUUID()
  await transaction.$executeRaw(Prisma.sql`
    INSERT INTO project_locations (
      id,
      projectId,
      name,
      summary,
      selectedImageId,
      assetKind,
      createdAt,
      updatedAt
    ) VALUES (
      ${id},
      ${input.projectId},
      ${input.name},
      ${input.summary},
      NULL,
      ${input.kind},
      NOW(),
      NOW()
    )
  `)
  await seedProjectLocationBackedImageSlots({
    locationId: id,
    fallbackDescription: input.initialDescription ?? input.summary,
    descriptions: [input.initialDescription ?? input.summary],
    locationImageModel: transaction.locationImage,
  })
  return { id }
}

export async function seedProjectLocationBackedImageSlots(input: {
  locationId: string
  fallbackDescription: string
  descriptions?: string[]
  locationImageModel?: {
    createMany: (args: {
      data: Array<{
        locationId: string
        imageIndex: number
        description: string
      }>
    }) => Promise<unknown>
  }
}): Promise<void> {
  const descriptions = normalizeSeedDescriptions(input)
  if (descriptions.length === 0) {
    return
  }

  const locationImageModel = input.locationImageModel ?? prisma.locationImage
  await locationImageModel.createMany({
    data: descriptions.map((description, imageIndex) => ({
      locationId: input.locationId,
      imageIndex,
      description,
    })),
  })
}

export async function deleteProjectLocationBackedAsset(
  assetId: string,
  transaction: Prisma.TransactionClient,
): Promise<void> {
  await transaction.$executeRaw(Prisma.sql`DELETE FROM location_images WHERE locationId = ${assetId}`)
  await transaction.$executeRaw(Prisma.sql`DELETE FROM project_locations WHERE id = ${assetId}`)
}
