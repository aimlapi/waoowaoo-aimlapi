import type { ShotScaleClass } from './types'
import { normalizeText } from './text'

export function classifyShotScale(value: string | null): ShotScaleClass {
  const text = normalizeText(value).toLocaleLowerCase()
  if (!text) return 'medium'
  if (
    text.includes('extreme close')
    || text.includes('extreme detail')
    || text.includes('insert')
    || text.includes('macro')
    || text.includes('局部特写')
    || text.includes('极近')
    || text.includes('极特写')
  ) return 'extreme_detail'
  if (
    text.includes('close')
    || text.includes('detail')
    || text.includes('特写')
    || text.includes('近景')
  ) return 'detail'
  if (
    text.includes('wide')
    || text.includes('long shot')
    || text.includes('full shot')
    || text.includes('establishing')
    || text.includes('远景')
    || text.includes('全景')
    || text.includes('大全景')
  ) return 'wide'
  return 'medium'
}

export function isDetailShot(shotScale: ShotScaleClass): boolean {
  return shotScale === 'detail' || shotScale === 'extreme_detail'
}
