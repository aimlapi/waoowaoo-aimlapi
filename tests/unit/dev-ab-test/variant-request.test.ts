import { describe, expect, it } from 'vitest'
import {
  buildDevAbVariantCharacterRequest,
  normalizeDevAbInput,
} from '@/lib/dev-ab-test/variant-request'

describe('dev A/B variant request builder', () => {
  it('normalizes multiline input without losing semantic lines', () => {
    expect(normalizeDevAbInput('  base role  \n\n  style rule  ')).toBe('base role\nstyle rule')
  })

  it('builds zh variant request with shared base and explicit A/B rule', () => {
    const request = buildDevAbVariantCharacterRequest({
      baseRequest: '冷峻黑客\n黑色长风衣',
      variantId: 'A',
      variantInstruction: '湿润霓虹黑色电影风',
      locale: 'zh',
    })

    expect(request).toContain('选角定妆 A/B 共用角色需求')
    expect(request).toContain('冷峻黑客\n黑色长风衣')
    expect(request).toContain('方案 A')
    expect(request).toContain('湿润霓虹黑色电影风')
    expect(request).toContain('保持共用角色需求稳定')
  })

  it('builds en variant request without hardcoding zh labels', () => {
    const request = buildDevAbVariantCharacterRequest({
      baseRequest: 'cold hacker',
      variantId: 'B',
      variantInstruction: 'low-saturation cyber realism',
      locale: 'en',
    })

    expect(request).toContain('Casting look-test shared role request')
    expect(request).toContain('Variant B')
    expect(request).toContain('low-saturation cyber realism')
    expect(request).toContain('Keep the shared role stable')
    expect(request).not.toContain('选角定妆 A/B 共用角色需求')
  })
})
