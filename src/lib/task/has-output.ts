import { prisma } from '@/lib/prisma'

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0
}

function parseJsonStringArray(raw: string | null | undefined): string[] {
  if (!raw || typeof raw !== 'string') return []
  try {
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed.filter((item): item is string => isNonEmptyString(item))
  } catch {
    return []
  }
}

function hasUrlList(raw: string | null | undefined) {
  return parseJsonStringArray(raw).length > 0
}

export async function hasCharacterAppearanceOutput(params: {
  appearanceId?: string | null
  characterId?: string | null
  appearanceIndex?: number | null
}) {
  if (isNonEmptyString(params.appearanceId)) {
    const row = await prisma.characterAppearance.findUnique({
      where: { id: params.appearanceId },
      select: {
        imageUrl: true,
        imageUrls: true,
        imageMediaId: true,
      },
    })
    if (!row) return false
    return isNonEmptyString(row.imageUrl) || !!row.imageMediaId || hasUrlList(row.imageUrls)
  }

  if (!isNonEmptyString(params.characterId)) return false
  const row = await prisma.characterAppearance.findFirst({
    where: {
      characterId: params.characterId,
      ...(typeof params.appearanceIndex === 'number'
        ? { appearanceIndex: params.appearanceIndex }
        : {}),
    },
    select: {
      imageUrl: true,
      imageUrls: true,
      imageMediaId: true,
    },
  })
  if (!row) return false
  return isNonEmptyString(row.imageUrl) || !!row.imageMediaId || hasUrlList(row.imageUrls)
}

export async function hasLocationImageOutput(params: {
  imageId?: string | null
  locationId?: string | null
  imageIndex?: number | null
}) {
  if (isNonEmptyString(params.imageId)) {
    const row = await prisma.locationImage.findUnique({
      where: { id: params.imageId },
      select: {
        imageUrl: true,
        imageMediaId: true,
      },
    })
    if (!row) return false
    return isNonEmptyString(row.imageUrl) || !!row.imageMediaId
  }

  if (!isNonEmptyString(params.locationId)) return false
  const row = await prisma.locationImage.findFirst({
    where: {
      locationId: params.locationId,
      ...(typeof params.imageIndex === 'number' ? { imageIndex: params.imageIndex } : {}),
    },
    select: {
      imageUrl: true,
      imageMediaId: true,
    },
  })
  if (!row) return false
  return isNonEmptyString(row.imageUrl) || !!row.imageMediaId
}

export async function hasPanelImageOutput(panelId: string | null | undefined) {
  if (!isNonEmptyString(panelId)) return false
  const panel = await prisma.projectPanel.findUnique({
    where: { id: panelId },
    select: {
      imageUrl: true,
      imageMediaId: true,
    },
  })
  if (!panel) return false
  return isNonEmptyString(panel.imageUrl) || !!panel.imageMediaId
}

export async function hasPanelVideoOutput(panelId: string | null | undefined) {
  if (!isNonEmptyString(panelId)) return false
  const panel = await prisma.projectPanel.findUnique({
    where: { id: panelId },
    select: {
      videoUrl: true,
      videoMediaId: true,
    },
  })
  if (!panel) return false
  return isNonEmptyString(panel.videoUrl) || !!panel.videoMediaId
}

export async function hasVideoGroupOutput(groupId: string | null | undefined) {
  if (!isNonEmptyString(groupId)) return false
  const group = await prisma.projectVideoGroup.findUnique({
    where: { id: groupId },
    select: {
      videoUrl: true,
      videoMediaId: true,
    },
  })
  if (!group) return false
  return isNonEmptyString(group.videoUrl) || !!group.videoMediaId
}
