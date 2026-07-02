import type { PlatformModelPreset } from '@/lib/platform-models/types'

export const CC_FABLE5_MODEL_ID = 'fable5'
export const CC_PLATFORM_DEFAULT_ANALYSIS_MODEL_KEY = `cc::${CC_FABLE5_MODEL_ID}`

function ccTokenPricing(input: number, output: number) {
  return {
    mode: 'capability' as const,
    tiers: [
      { when: { tokenType: 'input' }, amount: input },
      { when: { tokenType: 'output' }, amount: output },
    ],
  }
}

export const CC_PLATFORM_MODEL_PRESETS = [
  { provider: 'cc', modelId: CC_FABLE5_MODEL_ID, name: 'Fable 5', type: 'llm' },
] as const satisfies ReadonlyArray<PlatformModelPreset>

export const CC_BUILTIN_CAPABILITY_CATALOG_ENTRIES = [
  { modelType: 'llm', provider: 'cc', modelId: CC_FABLE5_MODEL_ID, capabilities: { llm: { reasoningEffortOptions: ['minimal', 'low', 'medium', 'high'] } } },
] as const

export const CC_BUILTIN_PRICING_CATALOG_ENTRIES = [
  { apiType: 'text', provider: 'cc', modelId: CC_FABLE5_MODEL_ID, pricing: ccTokenPricing(0, 0) },
] as const

export const CC_API_CONFIG_CATALOG_MODELS = [
  { modelId: CC_FABLE5_MODEL_ID, name: 'Fable 5', type: 'llm', provider: 'cc' },
] as const
