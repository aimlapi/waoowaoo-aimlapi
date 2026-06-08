import type { Job } from 'bullmq'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { LOCATION_IMAGE_RATIO, PROP_IMAGE_RATIO } from '@/lib/constants'
import { TASK_TYPE, type TaskJobData } from '@/lib/task/types'

const utilsMock = vi.hoisted(() => ({
  assertTaskActive: vi.fn(async () => undefined),
  getProjectModels: vi.fn(async () => ({ locationModel: 'location-model-1', analysisModel: 'analysis-model-1' })),
}))

const prismaMock = vi.hoisted(() => ({
  project: {
    findUnique: vi.fn(),
  },
  projectVisualReferenceCase: {
    findFirst: vi.fn(),
  },
  locationImage: {
    findUnique: vi.fn(),
    update: vi.fn(async () => ({})),
  },
  projectLocation: {
    findUnique: vi.fn(),
  },
  projectEditScript: {
    findFirst: vi.fn(),
  },
  projectEditScreenplay: {
    findFirst: vi.fn(),
  },
}))

const sharedMock = vi.hoisted(() => ({
  generateCleanImageToStorage: vi.fn(async () => 'cos/location-generated-1.png'),
}))

const outboundMock = vi.hoisted(() => ({
  normalizeOptionalReferenceImagesForGeneration: vi.fn(async () => [] as string[]),
}))

const spatialProfileServiceMock = vi.hoisted(() => ({
  analyzeAndPersistProjectLocationImageSpatialProfile: vi.fn(async () => ({
    schemaVersion: 1,
    sceneSummary: '街道空间',
    anchors: [{
      id: 'anchor_wall',
      label: '左侧墙面',
      screenArea: '画面左侧',
      depthLayer: '中景',
      spatialRelations: ['墙面右侧是街道'],
    }],
    depthLayout: {
      foreground: '街道前景',
      midground: '墙边和路面',
      background: '远处街灯',
    },
    lightingDirection: '街灯从右后方照入',
  })),
}))

vi.mock('@/lib/workers/utils', () => utilsMock)
vi.mock('@/lib/prisma', () => ({ prisma: prismaMock }))
vi.mock('@/lib/media/outbound-image', () => outboundMock)
vi.mock('@/lib/workers/shared', () => ({ reportTaskProgress: vi.fn(async () => undefined) }))
vi.mock('@/lib/workers/handlers/image-task-handler-shared', async () => {
  const actual = await vi.importActual<typeof import('@/lib/workers/handlers/image-task-handler-shared')>(
    '@/lib/workers/handlers/image-task-handler-shared',
  )
  return {
    ...actual,
    generateCleanImageToStorage: sharedMock.generateCleanImageToStorage,
  }
})
vi.mock('@/lib/location-spatial-profile/service', () => spatialProfileServiceMock)

import { handleLocationImageTask } from '@/lib/workers/handlers/location-image-task-handler'

function buildJob(
  payload: Record<string, unknown>,
  targetId = 'location-image-1',
  episodeId: string | null = null,
): Job<TaskJobData> {
  return {
    data: {
      taskId: 'task-location-image-1',
      type: TASK_TYPE.IMAGE_LOCATION,
      locale: 'zh',
      projectId: 'project-1',
      episodeId,
      targetType: 'LocationImage',
      targetId,
      payload,
      userId: 'user-1',
    },
  } as unknown as Job<TaskJobData>
}

describe('worker location-image-task-handler behavior', () => {
  beforeEach(() => {
    vi.clearAllMocks()

    prismaMock.project.findUnique.mockResolvedValue({
      visualStylePresetSource: 'system',
      visualStylePresetId: 'japanese-anime',
    })
    prismaMock.projectVisualReferenceCase.findFirst.mockResolvedValue({
      id: 'style-case-default',
      title: '真人向｜雨夜写实',
      description: '真人向；低饱和雨夜写实；共享场景为故事主场景。',
      prompt: 'Shared scene: story location at night. Chosen dimensions: live-action realism, muted palette. Style treatment: restrained photorealistic reference.',
      imageUrl: '/m/style-case-default',
      imageMedia: null,
    })
    outboundMock.normalizeOptionalReferenceImagesForGeneration.mockResolvedValue([])

    prismaMock.locationImage.findUnique.mockResolvedValue({
      id: 'location-image-1',
      locationId: 'location-1',
      imageIndex: 0,
      description: '雨夜街道',
      availableSlots: JSON.stringify([
        '街道左侧靠墙的留白位置',
      ]),
      location: { name: 'Old Town' },
    })

    prismaMock.projectLocation.findUnique.mockResolvedValue({
      id: 'location-1',
      name: 'Old Town',
      images: [
        {
          id: 'location-image-1',
          locationId: 'location-1',
          imageIndex: 0,
          description: '雨夜街道',
          availableSlots: JSON.stringify([
            '街道左侧靠墙的留白位置',
          ]),
        },
      ],
    })
    prismaMock.projectEditScript.findFirst.mockResolvedValue(null)
    prismaMock.projectEditScreenplay.findFirst.mockResolvedValue(null)
  })

  it('locationModel missing -> explicit error', async () => {
    utilsMock.getProjectModels.mockResolvedValueOnce({ locationModel: '', analysisModel: 'analysis-model-1' })
    await expect(handleLocationImageTask(buildJob({}))).rejects.toThrow('Location model not configured')
  })

  it('analysis model missing for location -> explicit spatial profile error', async () => {
    utilsMock.getProjectModels.mockResolvedValueOnce({ locationModel: 'location-model-1', analysisModel: '' })
    await expect(handleLocationImageTask(buildJob({ imageIndex: 0 }))).rejects.toThrow('LOCATION_SPATIAL_PROFILE_MODEL_REQUIRED')
  })

  it('success path -> generates and persists concrete location image url', async () => {
    const result = await handleLocationImageTask(buildJob({ imageIndex: 0 }))

    expect(result).toEqual({
      updated: 1,
      locationIds: ['location-1'],
    })

    expect(sharedMock.generateCleanImageToStorage).toHaveBeenCalledWith(
      expect.objectContaining({
        prompt: expect.stringContaining('雨夜街道'),
        targetId: 'location-image-1',
        options: expect.objectContaining({ aspectRatio: LOCATION_IMAGE_RATIO }),
      }),
    )
    expect(sharedMock.generateCleanImageToStorage).toHaveBeenCalledWith(
      expect.objectContaining({
        prompt: expect.stringContaining('自然保留这些落位区域对应的锚物和周边空白'),
      }),
    )
    expect(sharedMock.generateCleanImageToStorage).toHaveBeenCalledWith(
      expect.objectContaining({
        prompt: expect.stringContaining('街道左侧靠墙的留白位置'),
      }),
    )
    expect(sharedMock.generateCleanImageToStorage).toHaveBeenCalledWith(
      expect.objectContaining({
        prompt: expect.stringContaining('必须使用宽广完整的场景全景构图'),
      }),
    )
    const generationCall = sharedMock.generateCleanImageToStorage.mock.calls[0] as unknown as [{ prompt: string }] | undefined
    expect(generationCall).toBeTruthy()
    if (!generationCall) throw new Error('expected generateCleanImageToStorage call')
    const generationInput = generationCall[0]
    expect(generationInput.prompt).not.toContain('可站位置：')
    expect(generationInput.prompt).not.toContain('现代日系动漫风格')

    expect(prismaMock.locationImage.update).toHaveBeenCalledWith({
      where: { id: 'location-image-1' },
      data: {
        imageUrl: 'cos/location-generated-1.png',
        spatialProfileStatus: 'stale',
        spatialProfileError: null,
      },
    })
    expect(spatialProfileServiceMock.analyzeAndPersistProjectLocationImageSpatialProfile).toHaveBeenCalledWith({
      imageId: 'location-image-1',
      userId: 'user-1',
      projectId: 'project-1',
      model: 'analysis-model-1',
      locale: 'zh',
    })
  })

  it('ignores legacy payload artStyle in prompt', async () => {
    await handleLocationImageTask(buildJob({ imageIndex: 0, artStyle: 'realistic' }))

    expect(sharedMock.generateCleanImageToStorage).toHaveBeenCalledWith(
      expect.objectContaining({
        prompt: expect.not.stringContaining('真实电影级画面质感'),
      }),
    )
  })

  it('selected visual reference style overrides project anime style for location assets', async () => {
    prismaMock.projectVisualReferenceCase.findFirst.mockResolvedValueOnce({
      id: 'style-case-1',
      title: '雨夜写实',
      description: '真实摄影质感的雨夜街区，低饱和冷光。',
      prompt: 'photorealistic rainy night street, muted blue-gray palette, practical lighting',
      imageUrl: '/m/style-case-1',
      imageMedia: null,
    })
    outboundMock.normalizeOptionalReferenceImagesForGeneration.mockResolvedValueOnce(['normalized-style-ref'])

    await handleLocationImageTask(buildJob({ imageIndex: 0 }, 'location-image-1', 'episode-1'))

    const generationCalls = sharedMock.generateCleanImageToStorage.mock.calls as unknown[][]
    const generationInput = generationCalls[0]?.[0] as {
      prompt: string
      options?: { referenceImages?: string[]; aspectRatio?: string }
    }
    expect(generationInput.prompt).toContain('选中的视觉风格案例（最高优先级）：')
    expect(generationInput.prompt).toContain('雨夜写实')
    expect(generationInput.prompt).toContain('选中案例的媒介类别具有约束力')
    expect(generationInput.prompt).not.toContain('现代日系动漫风格')
    expect(generationInput.options).toEqual({
      aspectRatio: LOCATION_IMAGE_RATIO,
      referenceImages: ['normalized-style-ref'],
    })
  })

  it('uses the selected visual reference case as the only style source in location image prompt', async () => {
    await handleLocationImageTask(buildJob({ imageIndex: 0 }, 'location-image-1', 'episode-1'))

    expect(sharedMock.generateCleanImageToStorage).toHaveBeenCalledWith(
      expect.objectContaining({
        prompt: expect.stringContaining('选中的视觉风格案例（最高优先级）：'),
      }),
    )
    expect(sharedMock.generateCleanImageToStorage).toHaveBeenCalledWith(
      expect.objectContaining({
        prompt: expect.stringContaining('真人向｜雨夜写实'),
      }),
    )
    const generationCalls = sharedMock.generateCleanImageToStorage.mock.calls as unknown as Array<[{ prompt: string }]>
    const generationInput = generationCalls[0]?.[0]
    expect(generationInput).toBeDefined()
    expect(generationInput.prompt).not.toContain('Style Bible')
  })

  it('ignores invalid legacy payload artStyle', async () => {
    await expect(handleLocationImageTask(buildJob({ imageIndex: 0, artStyle: 'anime' }))).resolves.toEqual(expect.objectContaining({
      updated: 1,
    }))
  })

  it('honors requested count when location already has more slots', async () => {
    prismaMock.locationImage.findUnique.mockResolvedValueOnce(null)
    prismaMock.projectLocation.findUnique.mockResolvedValueOnce({
      id: 'location-1',
      name: 'Old Town',
      images: [
        { id: 'location-image-1', locationId: 'location-1', imageIndex: 0, description: '雨夜街道 A' },
        { id: 'location-image-2', locationId: 'location-1', imageIndex: 1, description: '雨夜街道 B' },
        { id: 'location-image-3', locationId: 'location-1', imageIndex: 2, description: '雨夜街道 C' },
      ],
    })

    const result = await handleLocationImageTask(buildJob({ locationId: 'location-1', count: 1 }, 'location-1'))

    expect(result).toEqual({
      updated: 1,
      locationIds: ['location-1'],
    })
    expect(sharedMock.generateCleanImageToStorage).toHaveBeenCalledTimes(1)
    expect(prismaMock.locationImage.update).toHaveBeenCalledTimes(1)
    expect(prismaMock.locationImage.update).toHaveBeenCalledWith({
      where: { id: 'location-image-1' },
      data: {
        imageUrl: 'cos/location-generated-1.png',
        spatialProfileStatus: 'stale',
        spatialProfileError: null,
      },
    })
  })

  it('uses the same aspect ratio as character generation for prop images', async () => {
    await handleLocationImageTask(buildJob({ type: 'prop', imageIndex: 0 }))

    expect(sharedMock.generateCleanImageToStorage).toHaveBeenCalledWith(
      expect.objectContaining({
        options: expect.objectContaining({ aspectRatio: PROP_IMAGE_RATIO }),
      }),
    )
    expect(spatialProfileServiceMock.analyzeAndPersistProjectLocationImageSpatialProfile).not.toHaveBeenCalled()
  })
})
