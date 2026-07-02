import { Prisma } from '@prisma/client'
import { createProjectLocationBackedAsset } from '@/lib/assets/services/location-backed-assets'
import { PRIMARY_APPEARANCE_INDEX } from '@/lib/constants'
import { encodeImageUrls } from '@/lib/contracts/image-urls-contract'
import { prisma } from '@/lib/prisma'
import type { LongFormAssetSummary, LongFormPlanModelOutput } from './types'

export type CreatedLongFormAsset = {
  readonly id: string
  readonly kind: 'character' | 'location' | 'prop'
}

type ExistingLocationBackedAsset = {
  readonly id: string
  readonly name: string
  readonly assetKind: string
}

type EnsureAssetResult = {
  readonly asset: LongFormAssetSummary
  readonly created: CreatedLongFormAsset | null
}

function normalizeAssetName(value: string): string {
  return value.trim().toLocaleLowerCase()
}

async function ensureProjectCharacterAsset(input: {
  readonly projectId: string
  readonly name: string
  readonly description: string
  readonly aliases: readonly string[]
}): Promise<EnsureAssetResult> {
  const normalizedName = normalizeAssetName(input.name)
  const existing = await prisma.projectCharacter.findMany({
    where: { projectId: input.projectId },
    select: { id: true, name: true },
  })
  const matched = existing.find((item) => normalizeAssetName(item.name) === normalizedName)
  if (matched) return { asset: { id: matched.id, kind: 'character', name: matched.name }, created: null }

  const character = await prisma.projectCharacter.create({
    data: {
      projectId: input.projectId,
      name: input.name,
      aliases: input.aliases.length > 0 ? input.aliases.join('\n') : null,
      introduction: input.description,
      appearances: {
        create: {
          appearanceIndex: PRIMARY_APPEARANCE_INDEX,
          changeReason: 'primary',
          description: input.description,
          descriptions: JSON.stringify([input.description]),
          imageUrls: encodeImageUrls([]),
          previousImageUrls: encodeImageUrls([]),
        },
      },
    },
    select: { id: true, name: true },
  })
  return {
    asset: { id: character.id, kind: 'character', name: character.name },
    created: { id: character.id, kind: 'character' },
  }
}

async function ensureProjectLocationBackedAsset(input: {
  readonly projectId: string
  readonly kind: 'location' | 'prop'
  readonly name: string
  readonly description: string
}): Promise<EnsureAssetResult> {
  const normalizedName = normalizeAssetName(input.name)
  const rows = await prisma.$queryRaw<ExistingLocationBackedAsset[]>(Prisma.sql`
    SELECT id, name, assetKind
    FROM project_locations
    WHERE projectId = ${input.projectId}
      AND assetKind = ${input.kind}
  `)
  const matched = rows.find((item) => normalizeAssetName(item.name) === normalizedName)
  if (matched) return { asset: { id: matched.id, kind: input.kind, name: matched.name }, created: null }

  const created = await createProjectLocationBackedAsset({
    projectId: input.projectId,
    name: input.name,
    summary: input.description,
    initialDescription: input.description,
    kind: input.kind,
  })
  return {
    asset: { id: created.id, kind: input.kind, name: input.name },
    created: { id: created.id, kind: input.kind },
  }
}

export async function ensureLongFormGlobalAssets(input: {
  readonly projectId: string
  readonly assets: LongFormPlanModelOutput['globalAssets']
}): Promise<{
  readonly assets: readonly LongFormAssetSummary[]
  readonly createdAssets: readonly CreatedLongFormAsset[]
}> {
  const assets: LongFormAssetSummary[] = []
  const createdAssets: CreatedLongFormAsset[] = []
  for (const character of input.assets.characters) {
    const ensured = await ensureProjectCharacterAsset({
      projectId: input.projectId,
      name: character.name,
      description: character.description,
      aliases: character.aliases,
    })
    assets.push(ensured.asset)
    if (ensured.created) createdAssets.push(ensured.created)
  }
  for (const location of input.assets.locations) {
    const ensured = await ensureProjectLocationBackedAsset({
      projectId: input.projectId,
      kind: 'location',
      name: location.name,
      description: location.description,
    })
    assets.push(ensured.asset)
    if (ensured.created) createdAssets.push(ensured.created)
  }
  for (const prop of input.assets.props) {
    const ensured = await ensureProjectLocationBackedAsset({
      projectId: input.projectId,
      kind: 'prop',
      name: prop.name,
      description: prop.description,
    })
    assets.push(ensured.asset)
    if (ensured.created) createdAssets.push(ensured.created)
  }
  return { assets, createdAssets }
}

export async function deleteCreatedLongFormAssets(createdAssets: readonly CreatedLongFormAsset[]): Promise<void> {
  for (const asset of [...createdAssets].reverse()) {
    if (asset.kind === 'character') {
      await prisma.projectCharacter.deleteMany({ where: { id: asset.id } })
      continue
    }
    await prisma.projectLocation.deleteMany({ where: { id: asset.id } })
  }
}
