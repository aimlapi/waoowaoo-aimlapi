import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Mock } from 'vitest'
import type { EditAssetRequirement } from '@/lib/edit-script/types'
import { buildAssetSnapshots } from '@/lib/edit-script/storyboard-consistency/source-snapshot'
import { prisma } from '@/lib/prisma'

vi.mock('@/lib/prisma', () => ({
  prisma: {
    projectCharacter: {
      findUnique: vi.fn(),
    },
    projectLocation: {
      findUnique: vi.fn(),
    },
    projectEditAssetRequirement: {
      updateMany: vi.fn(),
    },
  },
}))

interface PrismaMock {
  readonly projectCharacter: {
    readonly findUnique: Mock
  }
  readonly projectLocation: {
    readonly findUnique: Mock
  }
  readonly projectEditAssetRequirement: {
    readonly updateMany: Mock
  }
}

const prismaMock = prisma as unknown as PrismaMock

const readySpatialProfile = {
  schemaVersion: 1,
  sceneSummary: 'Ready location interior.',
  anchors: [{
    id: 'anchor-1',
    label: 'main counter',
    screenArea: 'right side',
    depthLayer: 'midground',
    spatialRelations: ['doorway is in front of the counter'],
  }],
  depthLayout: {
    foreground: 'doorway',
    midground: 'counter',
    background: 'rear window',
  },
  lightingDirection: 'from the rear window',
}

function requirement(overrides: Partial<EditAssetRequirement>): EditAssetRequirement {
  return {
    id: 'requirement-1',
    kind: 'character',
    name: 'Character',
    description: 'Character description',
    shotNumbers: [1],
    status: 'generating',
    targetId: 'asset-1',
    errorMessage: null,
    ...overrides,
  }
}

describe('storyboard consistency source snapshot assets', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('reconciles stale generating requirements when target assets already have preview images', async () => {
    prismaMock.projectCharacter.findUnique.mockResolvedValueOnce({
      appearances: [{
        imageUrl: 'images/character-ready.jpg',
        imageUrls: '[]',
      }],
    })
    prismaMock.projectLocation.findUnique.mockResolvedValueOnce({
      images: [{
        id: 'location-image-1',
        imageUrl: 'images/location-ready.jpg',
        isSelected: true,
        spatialProfileJson: readySpatialProfile,
        spatialProfileStatus: 'ready',
      }],
    })

    const snapshots = await buildAssetSnapshots([
      requirement({
        id: 'req-character',
        kind: 'character',
        name: 'Ready character',
        targetId: 'character-1',
        status: 'generating',
      }),
      requirement({
        id: 'req-location',
        kind: 'location',
        name: 'Ready location',
        targetId: 'location-1',
        status: 'pending',
      }),
    ])

    expect(snapshots).toEqual([
      expect.objectContaining({
        requirementId: 'req-character',
        targetId: 'character-1',
        previewImageUrl: 'images/character-ready.jpg',
      }),
      expect.objectContaining({
        requirementId: 'req-location',
        targetId: 'location-1',
        previewImageUrl: 'images/location-ready.jpg',
        spatialProfile: readySpatialProfile,
      }),
    ])
    expect(prismaMock.projectEditAssetRequirement.updateMany).toHaveBeenCalledWith({
      where: { id: { in: ['req-character', 'req-location'] } },
      data: { status: 'completed', errorMessage: null },
    })
  })

  it('does not require spatial profiles for prop assets with selected images', async () => {
    prismaMock.projectLocation.findUnique.mockResolvedValueOnce({
      selectedImageId: 'prop-image-1',
      images: [{
        id: 'prop-image-1',
        imageUrl: 'images/prop-ready.jpg',
        isSelected: true,
        spatialProfileJson: null,
        spatialProfileStatus: 'pending',
      }],
    })

    const snapshots = await buildAssetSnapshots([
      requirement({
        id: 'req-prop',
        kind: 'prop',
        name: 'Ready prop',
        targetId: 'prop-1',
        status: 'generating',
      }),
    ])

    expect(snapshots).toEqual([
      expect.objectContaining({
        requirementId: 'req-prop',
        kind: 'prop',
        targetId: 'prop-1',
        previewImageUrl: 'images/prop-ready.jpg',
        spatialProfile: null,
      }),
    ])
    expect(prismaMock.projectEditAssetRequirement.updateMany).toHaveBeenCalledWith({
      where: { id: { in: ['req-prop'] } },
      data: { status: 'completed', errorMessage: null },
    })
  })
})
