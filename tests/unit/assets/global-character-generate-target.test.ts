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
  getProjectModelConfig: vi.fn(),
  buildImageBillingPayload: vi.fn(),
  buildImageBillingPayloadFromUserConfig: vi.fn(({ basePayload }) => basePayload),
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

  it('uses five fixed spatial-board slots for global location group generation', async () => {
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
      count: 5,
      fallbackDescription: '雨夜街道',
    })
    expect(submitTaskMock).toHaveBeenCalledWith(expect.objectContaining({
      type: TASK_TYPE.ASSET_HUB_IMAGE,
      targetType: 'GlobalLocation',
      targetId: 'location-1',
      payload: expect.objectContaining({
        id: 'location-1',
        type: 'location',
        count: 5,
      }),
    }))
  })
})
