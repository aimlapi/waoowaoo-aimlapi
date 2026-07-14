import {
  createIdleTaskState,
  type AssetRenderSummary,
  type AssetSummary,
  type AssetTaskRef,
  type AssetVariantSummary,
  type CharacterAssetSummary,
  type LocationAssetSummary,
  type PropAssetSummary,
} from '@/lib/assets/contracts'
import { getAssetKindRegistration } from '@/lib/assets/kinds/registry'
import type { MediaRef } from '@/types/project'
import type { LocationSpatialProfileStatus } from '@/lib/location-spatial-profile/types'

type CharacterAppearanceRecord = {
  id: string
  appearanceIndex: number
  changeReason: string
  description: string | null
  imageUrl: string | null
  media?: MediaRef | null
  imageUrls: string[]
  imageMedias?: MediaRef[]
  selectedIndex: number | null
  previousImageUrl: string | null
  previousMedia?: MediaRef | null
  previousImageUrls?: string[]
  previousImageMedias?: MediaRef[]
}

type ProjectCharacterRecord = {
  id: string
  name: string
  introduction?: string | null
  profileData?: string | null
  profileConfirmed?: boolean | null
  appearances: CharacterAppearanceRecord[]
}

type LocationImageRecord = {
  id: string
  imageIndex: number
  description: string | null
  imageUrl: string | null
  spatialProfileJson?: unknown | null
  spatialProfileStatus?: LocationSpatialProfileStatus | null
  spatialProfileError?: string | null
  spatialProfileAnalyzedAt?: string | Date | null
  spatialProfileModel?: string | null
  media?: MediaRef | null
  previousImageUrl: string | null
  previousMedia?: MediaRef | null
  isSelected: boolean
}

type ProjectLocationRecord = {
  id: string
  name: string
  summary: string | null
  images: LocationImageRecord[]
}

type ProjectPropRecord = {
  id: string
  name: string
  summary: string | null
  images: LocationImageRecord[]
}

function createRender(params: {
  id: string
  index: number
  imageUrl: string | null
  spatialProfileJson?: unknown | null
  spatialProfileStatus?: LocationSpatialProfileStatus | null
  spatialProfileError?: string | null
  spatialProfileAnalyzedAt?: string | Date | null
  spatialProfileModel?: string | null
  media: MediaRef | null
  isSelected: boolean
  previousImageUrl: string | null
  previousMedia: MediaRef | null
  taskRefs: AssetTaskRef[]
}): AssetRenderSummary {
  return {
    ...params,
    taskState: createIdleTaskState(),
  }
}

function createVariant(params: {
  id: string
  index: number
  label: string
  description: string | null
  selectedRenderIndex: number | null
  renders: AssetRenderSummary[]
  taskRefs: AssetTaskRef[]
}): AssetVariantSummary {
  return {
    id: params.id,
    index: params.index,
    label: params.label,
    description: params.description,
    renders: params.renders,
    selectionState: {
      selectedRenderIndex: params.selectedRenderIndex,
    },
    taskRefs: params.taskRefs,
    taskState: createIdleTaskState(),
  }
}

export function mapProjectCharacterToAsset(character: ProjectCharacterRecord): CharacterAssetSummary {
  const registration = getAssetKindRegistration('character')
  const variants = character.appearances.map((appearance) => {
    const imageMedias = appearance.imageMedias ?? []
    const previousImageMedias = appearance.previousImageMedias ?? []
    const renders = appearance.imageUrls.map((imageUrl, renderIndex) =>
      createRender({
        id: `${appearance.id}:${renderIndex}`,
        index: renderIndex,
        imageUrl,
        media: imageMedias[renderIndex] ?? null,
        isSelected: appearance.selectedIndex === renderIndex,
        previousImageUrl: appearance.previousImageUrls?.[renderIndex] ?? appearance.previousImageUrl ?? null,
        previousMedia: previousImageMedias[renderIndex] ?? appearance.previousMedia ?? null,
        taskRefs: [],
      }),
    )
    return createVariant({
      id: appearance.id,
      index: appearance.appearanceIndex,
      label: appearance.changeReason,
      description: appearance.description,
      selectedRenderIndex: appearance.selectedIndex,
      renders,
      taskRefs: [
        {
          targetType: 'CharacterAppearance',
          targetId: appearance.id,
          types: ['image_character', 'modify_asset_image', 'regenerate_group'],
        },
      ],
    })
  })

  return {
    id: character.id,
    kind: 'character',
    family: 'visual',
    name: character.name,
    capabilities: registration.capabilities,
    taskRefs: [
      {
        targetType: 'CharacterAppearance',
        targetId: character.id,
        types: ['image_character', 'modify_asset_image', 'regenerate_group'],
      },
    ],
    taskState: createIdleTaskState(),
    variants,
    introduction: character.introduction ?? null,
    profileData: character.profileData ?? null,
    profileConfirmed: character.profileConfirmed ?? null,
  }
}

function buildLocationVariants(
  images: LocationImageRecord[],
): AssetVariantSummary[] {
  return images.map((image) => {
    return createVariant({
      id: image.id,
      index: image.imageIndex,
      label: `Image ${image.imageIndex + 1}`,
      description: image.description,
      selectedRenderIndex: image.isSelected ? 0 : null,
      renders: [
        createRender({
          id: image.id,
          index: 0,
          imageUrl: image.imageUrl,
          spatialProfileJson: image.spatialProfileJson ?? null,
          spatialProfileStatus: image.spatialProfileStatus ?? null,
          spatialProfileError: image.spatialProfileError ?? null,
          spatialProfileAnalyzedAt: image.spatialProfileAnalyzedAt ?? null,
          spatialProfileModel: image.spatialProfileModel ?? null,
          media: image.media ?? null,
          isSelected: image.isSelected,
          previousImageUrl: image.previousImageUrl,
          previousMedia: image.previousMedia ?? null,
          taskRefs: [],
        }),
      ],
      taskRefs: [
        {
          targetType: 'LocationImage',
          targetId: image.id,
          types: ['image_location', 'modify_asset_image', 'regenerate_group'],
        },
      ],
    })
  })
}

function mapLocationLikeProjectAsset(
  kind: 'location' | 'prop',
  asset: ProjectLocationRecord | ProjectPropRecord,
): LocationAssetSummary | PropAssetSummary {
  const registration = getAssetKindRegistration(kind)
  const variants = buildLocationVariants(asset.images)
  const selectedVariant = variants.find((variant) => variant.renders[0]?.isSelected)
  const base = {
    id: asset.id,
    kind,
    family: 'visual' as const,
    name: asset.name,
    capabilities: registration.capabilities,
    taskRefs: [
      {
        targetType: 'LocationImage',
        targetId: asset.id,
        types: ['image_location', 'modify_asset_image', 'regenerate_group'],
      },
    ],
    taskState: createIdleTaskState(),
    variants,
    summary: asset.summary,
    selectedVariantId: selectedVariant?.id ?? null,
  }
  return base
}

export function mapProjectLocationToAsset(location: ProjectLocationRecord): LocationAssetSummary {
  return mapLocationLikeProjectAsset('location', location) as LocationAssetSummary
}

export function mapProjectPropToAsset(prop: ProjectPropRecord): PropAssetSummary {
  return mapLocationLikeProjectAsset('prop', prop) as PropAssetSummary
}

export function filterAssetsByKind(
  assets: AssetSummary[],
  kind: AssetSummary['kind'] | null | undefined,
): AssetSummary[] {
  if (!kind) return assets
  return assets.filter((asset) => asset.kind === kind)
}
