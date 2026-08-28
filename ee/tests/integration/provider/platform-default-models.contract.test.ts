import { beforeAll, describe, expect, it } from 'vitest'
import { ensureAiCatalogsRegistered } from '@/lib/ai-exec/catalog-bootstrap'
import { listBuiltinCapabilityCatalog } from '@/lib/ai-registry/capabilities-catalog'
import { resolveRegisteredLlmProtocol } from '@/lib/ai-registry/llm-protocol'
import { listBuiltinPricingCatalog } from '@/lib/ai-registry/pricing-catalog'
import { getPlatformDefaultModelCatalog } from '@/lib/platform-models/catalog'

describe('Cloud platform default model contract', () => {
  beforeAll(() => {
    ensureAiCatalogsRegistered()
  })

  it('publishes only priced and capable defaults from the Cloud environment', () => {
    const defaults = getPlatformDefaultModelCatalog()
    expect(defaults.length).toBeGreaterThan(0)

    for (const model of defaults) {
      if (model.type === 'llm') {
        expect(resolveRegisteredLlmProtocol(model.modelKey)).toBe('openrouter-chat')
      }
      expect(listBuiltinCapabilityCatalog().some((entry) => (
        entry.modelType === model.type
        && entry.provider === model.provider
        && entry.modelId === model.modelId
      ))).toBe(true)
      expect(listBuiltinPricingCatalog().some((entry) => (
        entry.apiType === (model.type === 'llm' ? 'text' : model.type)
        && entry.provider === model.provider
        && entry.modelId === model.modelId
      ))).toBe(true)
    }
  })
})
