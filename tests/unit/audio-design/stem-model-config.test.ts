import { describe, expect, it } from 'vitest'
import {
  DEFAULT_AUDIO_STEM_MODEL_CONFIGS,
  resolveDefaultAudioStemModelConfig,
} from '@/lib/audio-design/stem-model-config'

describe('audio stem model ownership', () => {
  it('only assigns generated post roles to ElevenLabs ambience and Lyria score', () => {
    expect(DEFAULT_AUDIO_STEM_MODEL_CONFIGS).toEqual({
      ambience: expect.objectContaining({
        provider: 'elevenlabs',
        modelId: 'eleven_text_to_sound_v2',
        generationKind: 'ambience',
      }),
      bgm: expect.objectContaining({
        provider: 'fal',
        modelId: 'fal-ai/lyria3/pro',
        generationKind: 'music',
      }),
    })
    expect(Object.keys(DEFAULT_AUDIO_STEM_MODEL_CONFIGS)).toEqual(['ambience', 'bgm'])
  })

  it('does not assign a generative model to native video dialogue and action sounds', () => {
    expect(resolveDefaultAudioStemModelConfig('native_video')).toBeNull()
  })
})
