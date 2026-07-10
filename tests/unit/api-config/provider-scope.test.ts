import { describe, expect, it } from 'vitest'
import {
  getAddableModelTypesForProvider,
  getVisibleModelTypesForProvider,
} from '@/app/[locale]/profile/components/api-config/provider-card/ProviderAdvancedFields'
import {
  filterApiConfigModelProviders,
  groupEnabledApiConfigModelsByType,
} from '@/app/[locale]/profile/components/api-config-tab/api-config-provider-filters'
import { getDefaultModelEmptyStateText } from '@/app/[locale]/profile/components/api-config-tab/default-model-empty-state'
import type { CustomModel, Provider } from '@/app/[locale]/profile/components/api-config/types'

function model(type: CustomModel['type'], provider = 'google'): CustomModel {
  return {
    modelId: `${type}-model`,
    modelKey: `${provider}::${type}-model`,
    name: `${type} model`,
    type,
    provider,
    price: 0,
    enabled: true,
  }
}

function provider(id: string, hasApiKey = true): Provider {
  return {
    id,
    name: id,
    hasApiKey,
  }
}

describe('api config provider scope', () => {
  it('allows model types only for the supported providers', () => {
    expect(getAddableModelTypesForProvider('ark')).toEqual(['llm', 'image', 'video'])
    expect(getAddableModelTypesForProvider('openrouter')).toEqual(['llm', 'video'])
    expect(getAddableModelTypesForProvider('fal')).toEqual(['image', 'video', 'audio', 'music'])
    expect(getAddableModelTypesForProvider('elevenlabs')).toEqual(['audio'])
    expect(getAddableModelTypesForProvider('google')).toEqual(['llm', 'image', 'video', 'music'])
    expect(getAddableModelTypesForProvider('unsupported-provider')).toEqual([])
  })

  it('shows only model sections that have matching models', () => {
    expect(getVisibleModelTypesForProvider('google', {
      llm: [model('llm')],
      image: [model('image')],
      video: [model('video')],
      music: [model('music')],
      audio: [model('audio', 'elevenlabs')],
    })).toEqual(['llm', 'image', 'video', 'music', 'audio'])
  })

  it('shows ElevenLabs when the catalog provides an audio model', () => {
    const providers = [
      provider('ark'),
      provider('openrouter'),
      provider('fal'),
      provider('google'),
      provider('elevenlabs'),
    ]
    const models = [
      model('llm', 'openrouter'),
      model('image', 'fal'),
      model('music', 'google'),
      model('audio', 'elevenlabs'),
    ]

    expect(filterApiConfigModelProviders(providers, models).map((item) => item.id)).toEqual([
      'openrouter',
      'fal',
      'google',
      'elevenlabs',
    ])
  })

  it('makes enabled ElevenLabs audio models available for default audio selection only after a key exists', () => {
    const audioModel = model('audio', 'elevenlabs')
    const withoutKey = groupEnabledApiConfigModelsByType([provider('elevenlabs', false)], [audioModel])
    const withKey = groupEnabledApiConfigModelsByType([provider('elevenlabs', true)], [audioModel])

    expect(withoutKey.audio).toEqual([])
    expect(withKey.audio).toEqual([
      expect.objectContaining({
        provider: 'elevenlabs',
        providerName: 'elevenlabs',
        type: 'audio',
      }),
    ])
  })

  it('ignores enabled models whose provider is absent from the provider configuration', () => {
    const grouped = groupEnabledApiConfigModelsByType([], [model('audio', 'elevenlabs')])

    expect(grouped.audio).toEqual([])
  })

  it('has empty-state copy for the supported default model types', () => {
    const t = (key: string) => key
    expect(getDefaultModelEmptyStateText('llm', t).description).toBe('defaultModelEmptyState.llmDescription')
    expect(getDefaultModelEmptyStateText('image', t).description).toBe('defaultModelEmptyState.imageDescription')
    expect(getDefaultModelEmptyStateText('video', t).description).toBe('defaultModelEmptyState.videoDescription')
    expect(getDefaultModelEmptyStateText('music', t).description).toBe('defaultModelEmptyState.musicDescription')
  })
})
