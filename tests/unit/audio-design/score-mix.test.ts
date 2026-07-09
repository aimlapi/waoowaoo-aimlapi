import { describe, expect, it } from 'vitest'
import { planScoreStemMixSegments, resolveScoreLayerBaseVolume } from '@/lib/audio-design/score-mix'
import type { ScoreLayer, ScoreMixStrategy } from '@/lib/audio-design/types'

function strategy(): ScoreMixStrategy {
  return {
    generationMode: 'single_cue_or_sparse_layers_with_mix_automation',
    priorityPolicy: 'dialogue_then_spot_sfx_then_foley_then_ambience_then_score',
    defaultScoreVolume: 0.3,
    maxSimultaneousScoreLayers: 2,
    musicSilenceWindows: [{
      startSec: 4,
      endSec: 5,
      reason: 'Expose tape peel Foley without score masking.',
    }],
    sfxDuckingWindows: [{
      startSec: 7,
      endSec: 8,
      scoreVolume: 0.2,
      muteFrequencyBands: ['mid', 'high_mid', 'high'],
      reason: 'Let tooth contact and tiny prop detail cut through.',
    }],
    forbiddenTimbresNearSfx: [{
      timbre: 'metallic scrape',
      startSec: 6.8,
      endSec: 8.2,
      reason: 'Metallic scrape belongs to Foley/SFX, not score.',
    }],
  }
}

function scoreLayer(input: Partial<ScoreLayer> = {}): ScoreLayer {
  return {
    id: 'score-low-pressure',
    role: 'sub_bed',
    frequencyBand: 'sub',
    stackRole: 'foundation',
    instrument: 'processed sub drone',
    startSec: 0,
    endSec: 10,
    duckingRequired: true,
    dynamicCurve: 'near-silent pressure with small restrained swells',
    densityCurve: 'sparse',
    mixPriority: 3,
    description: 'Detached procedural pressure without horror exaggeration.',
    ...input,
  }
}

describe('score mix strategy', () => {
  it('splits score stems around silence and SFX ducking windows', () => {
    const segments = planScoreStemMixSegments({
      layer: scoreLayer(),
      durationSeconds: 10,
      strategy: strategy(),
    })

    expect(segments).toEqual([
      {
        layerId: 'score-low-pressure',
        startSec: 0,
        sourceOffsetSec: 0,
        durationSec: 4,
        volume: 0.24,
      },
      {
        layerId: 'score-low-pressure',
        startSec: 5,
        sourceOffsetSec: 5,
        durationSec: 2,
        volume: 0.24,
      },
      {
        layerId: 'score-low-pressure',
        startSec: 7,
        sourceOffsetSec: 7,
        durationSec: 1,
        volume: 0.048,
      },
      {
        layerId: 'score-low-pressure',
        startSec: 8,
        sourceOffsetSec: 8,
        durationSec: 2,
        volume: 0.24,
      },
    ])
  })

  it('removes score bands that are muted during tactile SFX windows', () => {
    const segments = planScoreStemMixSegments({
      layer: scoreLayer({
        id: 'score-mid-pulse',
        role: 'mid_pulse',
        frequencyBand: 'mid',
      }),
      durationSeconds: 10,
      strategy: strategy(),
    })

    expect(segments.map((segment) => [segment.startSec, segment.durationSec, segment.volume])).toEqual([
      [0, 4, 0.2],
      [5, 2, 0.2],
      [8, 2, 0.2],
    ])
  })

  it('keeps score role volume restrained even when the strategy volume is higher', () => {
    expect(resolveScoreLayerBaseVolume('high_air', {
      ...strategy(),
      defaultScoreVolume: 0.5,
    })).toBe(0.14)
  })

  it('fails explicitly when a score layer has no valid time range', () => {
    expect(() => planScoreStemMixSegments({
      layer: scoreLayer({
        startSec: 6,
        endSec: 6,
      }),
      durationSeconds: 10,
      strategy: strategy(),
    })).toThrow('AUDIO_SCORE_LAYER_TIME_RANGE_INVALID:score-low-pressure')
  })
})
