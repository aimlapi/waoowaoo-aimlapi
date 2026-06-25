import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { NextRequest } from 'next/server'
import { TASK_TYPE } from '@/lib/task/types'

const prismaMock = vi.hoisted(() => ({
  globalCharacterAppearance: {
    findFirst: vi.fn(),
  },
  globalLocation: {
    findFirst: vi.fn(),
  },
  projectLocation: {
    findUnique: vi.fn(),
  },
}))

const submitTaskMock = vi.hoisted(() => vi.fn(async () => ({
  success: true,
  async: true,
  taskId: 'task-1',
  status: 'queued',
  runId: null,
  deduped: false,
})))

const configMock = vi.hoisted(() => ({
  getUserModelConfig: vi.fn(async () => ({
    characterModel: 'character-model-1',
    locationModel: 'location-model-1',
  })),
  getProjectModelConfig: vi.fn(async () => ({
    characterModel: 'project-character-model-1',
    locationModel: 'project-location-model-1',
  })),
  buildImageBillingPayload: vi.fn(async ({ basePayload }: { basePayload: Record<string, unknown> }) => basePayload),
  buildImageBillingPayloadFromUserConfig: vi.fn(({ basePayload }: { basePayload: Record<string, unknown> }) => basePayload),
}))

const hasOutputMock = vi.hoisted(() => ({
  hasCharacterAppearanceOutput: vi.fn(async () => false),
  hasGlobalCharacterAppearanceOutput: vi.fn(async () => false),
  hasGlobalLocationImageOutput: vi.fn(async () => false),
  hasGlobalLocationOutput: vi.fn(async () => false),
  hasLocationImageOutput: vi.fn(async () => false),
}))

const locationSlotsMock = vi.hoisted(() => ({
  ensureGlobalLocationImageSlots: vi.fn(async () => undefined),
  ensureProjectLocationImageSlots: vi.fn(async () => undefined),
}))

vi.mock('@/lib/prisma', () => ({ prisma: prismaMock }))
vi.mock('@/lib/task/submitter', () => ({ submitTask: submitTaskMock }))
vi.mock('@/lib/config-service', () => configMock)
vi.mock('@/lib/task/has-output', () => hasOutputMock)
vi.mock('@/lib/image-generation/location-slots', () => locationSlotsMock)
vi.mock('@/lib/edit-script/style-bible-prompt', () => ({
  resolveEditScriptStyleBibleSignatureForTask: vi.fn(async () => 'style-signature-1'),
}))

describe('global character generate task target', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    prismaMock.globalCharacterAppearance.findFirst.mockResolvedValue({ id: 'appearance-1' })
    prismaMock.globalLocation.findFirst.mockResolvedValue({
      name: 'Old Town',
      summary: '雨夜街道',
      assetKind: 'location',
      images: [{ description: '雨夜街道' }],
    })
    prismaMock.projectLocation.findUnique.mockResolvedValue({
      name: 'Project Diner',
      summary: '雨夜西餐厅',
      assetKind: 'location',
      images: [{ description: '雨夜西餐厅' }],
    })
  })

  it('uses the global character appearance as the task target', async () => {
    const { submitAssetGenerateTask } = await import('@/lib/assets/services/asset-actions')

    await submitAssetGenerateTask({
      request: new Request('http://localhost/api/assets/character-1/generate') as unknown as NextRequest,
      kind: 'character',
      assetId: 'character-1',
      body: {
        scope: 'global',
        kind: 'character',
        appearanceIndex: 0,
        count: 2,
        meta: { locale: 'zh' },
      },
      access: {
        scope: 'global',
        userId: 'user-1',
      },
    })

    expect(prismaMock.globalCharacterAppearance.findFirst).toHaveBeenCalledWith({
      where: {
        characterId: 'character-1',
        appearanceIndex: 0,
        character: {
          userId: 'user-1',
        },
      },
      select: { id: true },
    })

    expect(submitTaskMock).toHaveBeenCalledWith(expect.objectContaining({
      type: TASK_TYPE.ASSET_HUB_IMAGE,
      projectId: 'global-asset-hub',
      targetType: 'GlobalCharacterAppearance',
      targetId: 'appearance-1',
      payload: expect.objectContaining({
        id: 'character-1',
        type: 'character',
        appearanceId: 'appearance-1',
        appearanceIndex: 0,
      }),
    }))
  })

  it('uses one quad-grid spatial-board slot for global location generation', async () => {
    const { submitAssetGenerateTask } = await import('@/lib/assets/services/asset-actions')

    await submitAssetGenerateTask({
      request: new Request('http://localhost/api/assets/location-1/generate') as unknown as NextRequest,
      kind: 'location',
      assetId: 'location-1',
      body: {
        scope: 'global',
        kind: 'location',
        count: 2,
        meta: { locale: 'zh' },
      },
      access: {
        scope: 'global',
        userId: 'user-1',
      },
    })

    expect(locationSlotsMock.ensureGlobalLocationImageSlots).toHaveBeenCalledWith({
      locationId: 'location-1',
      count: 1,
      fallbackDescription: '雨夜街道',
      locale: 'zh',
      descriptionMode: 'scene-board',
    })
    expect(submitTaskMock).toHaveBeenCalledWith(expect.objectContaining({
      type: TASK_TYPE.ASSET_HUB_IMAGE,
      targetType: 'GlobalLocation',
      targetId: 'location-1',
      payload: expect.objectContaining({
        id: 'location-1',
        type: 'location',
        count: 1,
      }),
    }))
  })

  it('submits one quad-grid task for project location spatial-board generation', async () => {
    const { submitAssetGenerateTask } = await import('@/lib/assets/services/asset-actions')

    const result = await submitAssetGenerateTask({
      request: new Request('http://localhost/api/assets/location-1/generate') as unknown as NextRequest,
      kind: 'location',
      assetId: 'location-1',
      body: {
        scope: 'project',
        kind: 'location',
        count: 2,
        meta: { locale: 'zh' },
      },
      access: {
        scope: 'project',
        userId: 'user-1',
        projectId: 'project-1',
      },
      episodeId: 'episode-1',
    })

    expect(locationSlotsMock.ensureProjectLocationImageSlots).toHaveBeenCalledWith({
      locationId: 'location-1',
      count: 1,
      fallbackDescription: '雨夜西餐厅',
      locale: 'zh',
      descriptionMode: 'scene-board',
    })
    expect(submitTaskMock).toHaveBeenCalledTimes(1)
    expect(submitTaskMock).toHaveBeenNthCalledWith(1, expect.objectContaining({
      type: TASK_TYPE.IMAGE_LOCATION,
      targetType: 'LocationImage',
      targetId: 'location-1',
      payload: expect.objectContaining({
        id: 'location-1',
        type: 'location',
        count: 1,
      }),
    }))
    expect(result).toMatchObject({
      success: true,
      async: true,
      taskId: 'task-1',
    })
  })
})
