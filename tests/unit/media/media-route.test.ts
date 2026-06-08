import { NextRequest } from 'next/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mediaServiceMock = vi.hoisted(() => ({
  getMediaObjectByPublicId: vi.fn(),
}))

const storageMock = vi.hoisted(() => ({
  getObjectBuffer: vi.fn(),
}))

vi.mock('@/lib/media/service', () => mediaServiceMock)
vi.mock('@/lib/storage', () => storageMock)

import { GET, HEAD } from '@/app/m/[publicId]/route'

function buildContext(publicId: string): { params: Promise<{ publicId: string }> } {
  return { params: Promise.resolve({ publicId }) }
}

describe('media public route', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mediaServiceMock.getMediaObjectByPublicId.mockResolvedValue({
      id: 'media-row-1',
      publicId: 'media-public-1',
      storageKey: 'images/media-public-1.jpg',
      sha256: null,
      mimeType: 'image/jpeg',
      sizeBytes: 4,
      width: null,
      height: null,
      durationMs: null,
      updatedAt: '2026-06-08T00:00:00.000Z',
    })
    storageMock.getObjectBuffer.mockResolvedValue(Buffer.from([0xff, 0xd8, 0xff, 0xdb]))
  })

  it('serves media bytes directly from storage without internal HTTP fetch', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch')
    const response = await GET(
      new NextRequest('http://localhost/m/media-public-1'),
      buildContext('media-public-1'),
    )

    expect(response.status).toBe(200)
    expect(response.headers.get('content-type')).toBe('image/jpeg')
    expect(response.headers.get('content-length')).toBe('4')
    expect(Buffer.from(await response.arrayBuffer()).toString('hex')).toBe('ffd8ffdb')
    expect(storageMock.getObjectBuffer).toHaveBeenCalledWith('images/media-public-1.jpg')
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('serves byte ranges for media that supports ranged playback', async () => {
    mediaServiceMock.getMediaObjectByPublicId.mockResolvedValueOnce({
      id: 'media-row-2',
      publicId: 'media-public-2',
      storageKey: 'video/media-public-2.mp4',
      sha256: null,
      mimeType: 'video/mp4',
      sizeBytes: 6,
      width: null,
      height: null,
      durationMs: null,
      updatedAt: '2026-06-08T00:00:00.000Z',
    })
    storageMock.getObjectBuffer.mockResolvedValueOnce(Buffer.from([1, 2, 3, 4, 5, 6]))

    const response = await GET(
      new NextRequest('http://localhost/m/media-public-2', {
        headers: { Range: 'bytes=2-4' },
      }),
      buildContext('media-public-2'),
    )

    expect(response.status).toBe(206)
    expect(response.headers.get('content-range')).toBe('bytes 2-4/6')
    expect(response.headers.get('accept-ranges')).toBe('bytes')
    expect(Buffer.from(await response.arrayBuffer())).toEqual(Buffer.from([3, 4, 5]))
  })

  it('returns cache headers for HEAD without reading object bytes', async () => {
    const response = await HEAD(
      new NextRequest('http://localhost/m/media-public-1'),
      buildContext('media-public-1'),
    )

    expect(response.status).toBe(200)
    expect(response.headers.get('content-type')).toBe('image/jpeg')
    expect(response.headers.get('content-length')).toBe('4')
    expect(storageMock.getObjectBuffer).not.toHaveBeenCalled()
  })
})
