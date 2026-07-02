import { describe, expect, it } from 'vitest'
import {
  durationTierForSegment,
  segmentCountForDuration,
} from '@/lib/long-form/types'

describe('long-form duration segmentation', () => {
  it('splits total duration into 120-second production segments', () => {
    expect(segmentCountForDuration(121)).toBe(2)
    expect(segmentCountForDuration(240)).toBe(2)
    expect(segmentCountForDuration(241)).toBe(3)
    expect(segmentCountForDuration(7200)).toBe(60)
  })

  it('maps segment target duration to the existing edit-first duration tiers', () => {
    expect(durationTierForSegment(30)).toBe('short')
    expect(durationTierForSegment(60)).toBe('medium')
    expect(durationTierForSegment(90)).toBe('long')
    expect(durationTierForSegment(120)).toBe('long')
  })
})
