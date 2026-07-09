import { ELEVENLABS_SOUND_EFFECT_MODEL } from '@/lib/sound-effects/model'
import { getProviderKey } from '../types'

export interface FixedProviderModel {
  readonly modelId: string
  readonly titleKey: 'fixedSoundEffectModel'
  readonly descriptionKey: 'fixedSoundEffectModelDescription'
}

export function resolveFixedProviderModel(providerId: string): FixedProviderModel | null {
  const providerKey = getProviderKey(providerId)
  if (providerKey !== 'elevenlabs') return null
  return {
    modelId: ELEVENLABS_SOUND_EFFECT_MODEL,
    titleKey: 'fixedSoundEffectModel',
    descriptionKey: 'fixedSoundEffectModelDescription',
  }
}

export function isFixedModelOnlyProvider(providerId: string): boolean {
  return resolveFixedProviderModel(providerId) !== null
}
