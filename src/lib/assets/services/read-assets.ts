import { prisma } from '@/lib/prisma'
import { attachMediaFieldsToProject } from '@/lib/media/attach'
import {
  filterAssetsByKind as filterMappedAssetsByKind,
  mapProjectCharacterToAsset,
  mapProjectLocationToAsset,
  mapProjectPropToAsset,
} from '@/lib/assets/mappers'
import type { AssetKind, AssetQueryInput, AssetSummary } from '@/lib/assets/contracts'
import { listProjectLocationBackedAssets } from '@/lib/assets/services/location-backed-assets'

async function readProjectAssets(projectId: string): Promise<AssetSummary[]> {
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: {
      characters: {
        include: {
          appearances: {
            orderBy: { appearanceIndex: 'asc' },
          },
        },
        orderBy: { createdAt: 'asc' },
      },
    },
  })
  if (!project) {
    return []
  }

  const [locations, props] = await Promise.all([
    listProjectLocationBackedAssets(projectId, 'location'),
    listProjectLocationBackedAssets(projectId, 'prop'),
  ])

  const withMedia = await attachMediaFieldsToProject({
    characters: project.characters,
    locations: [...locations, ...props],
  })
  const projectCharacters = (withMedia.characters as unknown as Parameters<typeof mapProjectCharacterToAsset>[0][])
    .map(mapProjectCharacterToAsset)
  const locationLikeAssets = withMedia.locations as Array<Record<string, unknown> & { assetKind?: string }>
  const projectLocations = locationLikeAssets
    .filter((asset) => asset.assetKind === 'location')
    .map((asset) => mapProjectLocationToAsset(asset as Parameters<typeof mapProjectLocationToAsset>[0]))
  const projectProps = locationLikeAssets
    .filter((asset) => asset.assetKind === 'prop')
    .map((asset) => mapProjectPropToAsset(asset as Parameters<typeof mapProjectPropToAsset>[0]))
  return [...projectCharacters, ...projectLocations, ...projectProps]
}

export async function readAssets(
  input: AssetQueryInput,
): Promise<AssetSummary[]> {
  const assets = await readProjectAssets(input.projectId)
  return filterMappedAssetsByKind(assets, input.kind as AssetKind | null | undefined)
}
