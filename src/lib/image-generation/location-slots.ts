import { prisma } from '@/lib/prisma'
import type { Locale } from '@/i18n/routing'
import { resolveLocationSceneBoardView } from '@/lib/asset-generation/location-scene-board-prompts'

type LocationSlotDescriptionMode = 'copy' | 'scene-board'

function buildLocationImageSlotDescription(input: {
  readonly fallbackDescription: string
  readonly imageIndex: number
  readonly locale: Locale
  readonly mode: LocationSlotDescriptionMode
}): string {
  if (input.mode !== 'scene-board') return input.fallbackDescription

  const view = resolveLocationSceneBoardView(input.imageIndex)
  if (input.locale === 'en') {
    return [
      input.fallbackDescription,
      '',
      `Scene-board slot: ${view.enLabel}.`,
      view.enCoverage,
      'This slot must be visually distinct from the other spatial-board views while preserving the same physical location identity.',
    ].join('\n')
  }

  return [
    input.fallbackDescription,
    '',
    `场景空间板槽位：${view.zhLabel}。`,
    view.zhCoverage,
    '这个槽位必须与其他空间板视角形成明确视觉差异，同时保持同一个真实地点的身份和空间锚点。',
  ].join('\n')
}

export async function ensureProjectLocationImageSlots(input: {
  locationId: string
  count: number
  fallbackDescription: string
  locale: Locale
  descriptionMode?: LocationSlotDescriptionMode
}) {
  const existing = await prisma.locationImage.findMany({
    where: { locationId: input.locationId },
    select: { imageIndex: true, description: true },
    orderBy: { imageIndex: 'asc' },
  })
  const existingIndexes = new Set(existing.map((item) => item.imageIndex))
  const toCreate: Array<{ locationId: string; imageIndex: number; description: string }> = []
  const descriptionMode = input.descriptionMode ?? 'copy'

  for (let imageIndex = 0; imageIndex < input.count; imageIndex += 1) {
    const description = buildLocationImageSlotDescription({
      fallbackDescription: input.fallbackDescription,
      imageIndex,
      locale: input.locale,
      mode: descriptionMode,
    })
    if (existingIndexes.has(imageIndex)) {
      if (descriptionMode === 'scene-board') {
        await prisma.locationImage.updateMany({
          where: { locationId: input.locationId, imageIndex },
          data: { description },
        })
      }
      continue
    }
    toCreate.push({
      locationId: input.locationId,
      imageIndex,
      description,
    })
  }

  if (toCreate.length > 0) {
    await prisma.locationImage.createMany({ data: toCreate })
  }
}

export async function ensureGlobalLocationImageSlots(input: {
  locationId: string
  count: number
  fallbackDescription: string
  locale: Locale
  descriptionMode?: LocationSlotDescriptionMode
}) {
  const existing = await prisma.globalLocationImage.findMany({
    where: { locationId: input.locationId },
    select: { imageIndex: true, description: true },
    orderBy: { imageIndex: 'asc' },
  })
  const existingIndexes = new Set(existing.map((item) => item.imageIndex))
  const toCreate: Array<{ locationId: string; imageIndex: number; description: string }> = []
  const descriptionMode = input.descriptionMode ?? 'copy'

  for (let imageIndex = 0; imageIndex < input.count; imageIndex += 1) {
    const description = buildLocationImageSlotDescription({
      fallbackDescription: input.fallbackDescription,
      imageIndex,
      locale: input.locale,
      mode: descriptionMode,
    })
    if (existingIndexes.has(imageIndex)) {
      if (descriptionMode === 'scene-board') {
        await prisma.globalLocationImage.updateMany({
          where: { locationId: input.locationId, imageIndex },
          data: { description },
        })
      }
      continue
    }
    toCreate.push({
      locationId: input.locationId,
      imageIndex,
      description,
    })
  }

  if (toCreate.length > 0) {
    await prisma.globalLocationImage.createMany({ data: toCreate })
  }
}
