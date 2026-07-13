import assert from 'node:assert/strict'
import { describe, expect, it } from 'vitest'
import {
  ImageUrlsContractError,
  decodeImageUrlsFromDb,
  decodeImageUrlsStrict,
  encodeImageUrls,
} from '@/lib/contracts/image-urls-contract'

describe('image URL persistence contract', () => {
  it('round-trips the canonical string-array encoding', () => {
    const encoded = encodeImageUrls(['a', 'b'])
    expect(encoded).toBe('["a","b"]')
    expect(decodeImageUrlsStrict(encoded)).toEqual(['a', 'b'])
  })

  it('rejects malformed, non-array, non-string, and missing database values', () => {
    const invalidValues = [
      'not-json',
      '{"a":1}',
      '["a",1]',
    ]
    for (const value of invalidValues) {
      assert.throws(() => decodeImageUrlsStrict(value), ImageUrlsContractError)
    }
    assert.throws(() => decodeImageUrlsFromDb(null), ImageUrlsContractError)
  })
})
