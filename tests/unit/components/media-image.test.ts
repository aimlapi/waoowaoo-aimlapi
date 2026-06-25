import { describe, expect, it } from 'vitest'
import { resolveMediaImageSource } from '@/components/media/MediaImage'

describe('MediaImage', () => {
  it('normalizes legacy storage keys before rendering', () => {
    expect(resolveMediaImageSource('images/prop.jpg')).toBe('/api/storage/sign?key=images%2Fprop.jpg')
  })

  it('keeps stable media routes unchanged', () => {
    expect(resolveMediaImageSource('/m/media-public-id')).toBe('/m/media-public-id')
  })
})
