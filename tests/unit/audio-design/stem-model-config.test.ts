import { describe, expect, it } from 'vitest'
import {
  DEFAULT_AUDIO_STEM_MODEL_CONFIGS,
  resolveDefaultAudioStemModelConfig,
} from '@/lib/audio-design/stem-model-config'

describe('audio stem model config', () => {
  it('routes cinematic audio stems to the selected provider models', () => {
    expect(DEFAULT_AUDIO_STEM_MODEL_CONFIGS).toEqual({
      dialogue: expect.objectContaining({
        provider: 'fal',
        modelId: 'xai/tts/v1',
        modelKey: 'fal::xai/tts/v1',
        generationKind: 'dialogue_tts',
      }),
      foley: expect.objectContaining({
        provider: 'elevenlabs',
        modelId: 'eleven_text_to_sound_v2',
        modelKey: 'elevenlabs::eleven_text_to_sound_v2',
        generationKind: 'foley',
      }),
      spot_sfx: expect.objectContaining({
        provider: 'elevenlabs',
        modelId: 'eleven_text_to_sound_v2',
        modelKey: 'elevenlabs::eleven_text_to_sound_v2',
        generationKind: 'spot_sfx',
      }),
      ambience: expect.objectContaining({
        provider: 'elevenlabs',
        modelId: 'eleven_text_to_sound_v2',
        modelKey: 'elevenlabs::eleven_text_to_sound_v2',
        generationKind: 'ambience',
      }),
      bgm: expect.objectContaining({
        provider: 'fal',
        modelId: 'fal-ai/lyria3/pro',
        modelKey: 'fal::fal-ai/lyria3/pro',
        generationKind: 'music',
      }),
    })
  })

  it('does not assign a generative model to the native video reference track', () => {
    expect(resolveDefaultAudioStemModelConfig('native_video')).toBeNull()
  })
})
