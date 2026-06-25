import { beforeEach, describe, expect, it, vi } from 'vitest'

const prismaMock = vi.hoisted(() => ({
  locationImage: {
    findMany: vi.fn(),
    createMany: vi.fn(async () => ({ count: 0 })),
    updateMany: vi.fn(async () => ({ count: 1 })),
    deleteMany: vi.fn(async () => ({ count: 0 })),
  },
  globalLocationImage: {
    findMany: vi.fn(),
    createMany: vi.fn(async () => ({ count: 0 })),
    updateMany: vi.fn(async () => ({ count: 1 })),
    deleteMany: vi.fn(async () => ({ count: 0 })),
  },
}))

vi.mock('@/lib/prisma', () => ({ prisma: prismaMock }))

import { ensureProjectLocationImageSlots } from '@/lib/image-generation/location-slots'

describe('location image slot descriptions', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('writes one quad-grid scene-board description for location generation', async () => {
    prismaMock.locationImage.findMany.mockResolvedValue([])

    await ensureProjectLocationImageSlots({
      locationId: 'location-1',
      count: 1,
      fallbackDescription: '同一间西餐厅',
      locale: 'zh',
      descriptionMode: 'scene-board',
    })

    const createArg = prismaMock.locationImage.createMany.mock.calls[0]?.[0] as
      | { data: Array<{ imageIndex: number; description: string }> }
      | undefined
    expect(createArg?.data).toHaveLength(1)
    expect(createArg?.data.map((item) => item.imageIndex)).toEqual([0])
    expect(createArg?.data[0]?.description).toContain('四宫格空间板')
    expect(createArg?.data[0]?.description).toContain('前方、后方、左侧、右侧')
  })

  it('refreshes existing scene-board slot descriptions before regeneration', async () => {
    prismaMock.locationImage.findMany.mockResolvedValue([
      { imageIndex: 0, description: '旧描述' },
      { imageIndex: 1, description: '旧描述' },
    ])

    await ensureProjectLocationImageSlots({
      locationId: 'location-1',
      count: 1,
      fallbackDescription: '同一间西餐厅',
      locale: 'zh',
      descriptionMode: 'scene-board',
    })

    expect(prismaMock.locationImage.updateMany).toHaveBeenCalledWith({
      where: { locationId: 'location-1', imageIndex: 0 },
      data: { description: expect.stringContaining('四宫格空间板') },
    })
    expect(prismaMock.locationImage.deleteMany).toHaveBeenCalledWith({
      where: { locationId: 'location-1', imageIndex: { gte: 1 } },
    })
    expect(prismaMock.locationImage.createMany).not.toHaveBeenCalled()
  })
})
