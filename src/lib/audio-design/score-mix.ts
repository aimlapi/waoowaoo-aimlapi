import type {
  ScoreFrequencyBand,
  ScoreLayer,
  ScoreLayerRole,
  ScoreMixStrategy,
} from './types'

export interface ScoreStemMixSegment {
  readonly layerId: string
  readonly startSec: number
  readonly sourceOffsetSec: number
  readonly durationSec: number
  readonly volume: number
}

function intervalsOverlap(
  leftStartSec: number,
  leftEndSec: number,
  rightStartSec: number,
  rightEndSec: number,
): boolean {
  return leftStartSec < rightEndSec && rightStartSec < leftEndSec
}

function scoreBandMuted(
  frequencyBand: ScoreFrequencyBand,
  muteFrequencyBands: readonly ScoreFrequencyBand[],
): boolean {
  return muteFrequencyBands.includes(frequencyBand) || muteFrequencyBands.includes('full_range')
}

export function resolveScoreLayerBaseVolume(role: ScoreLayerRole, strategy: ScoreMixStrategy): number {
  if (role === 'accent') return Math.min(0.28, strategy.defaultScoreVolume)
  if (role === 'perc_impacts') return Math.min(0.28, strategy.defaultScoreVolume)
  if (role === 'transition_riser') return Math.min(0.24, strategy.defaultScoreVolume)
  if (role === 'rhythmic') return Math.min(0.2, strategy.defaultScoreVolume)
  if (role === 'mid_pulse') return Math.min(0.2, strategy.defaultScoreVolume)
  if (role === 'low_mid_body') return Math.min(0.22, strategy.defaultScoreVolume)
  if (role === 'sub_bed') return Math.min(0.24, strategy.defaultScoreVolume)
  if (role === 'high_air') return Math.min(0.14, strategy.defaultScoreVolume)
  if (role === 'motif_texture') return Math.min(0.18, strategy.defaultScoreVolume)
  if (role === 'theme') return Math.min(0.18, strategy.defaultScoreVolume)
  if (role === 'atmospheric_pad') return Math.min(0.16, strategy.defaultScoreVolume)
  return Math.min(0.2, strategy.defaultScoreVolume)
}

export function planScoreStemMixSegments(input: {
  readonly layer: ScoreLayer
  readonly durationSeconds: number
  readonly strategy: ScoreMixStrategy
}): readonly ScoreStemMixSegment[] {
  const layerStartSec = input.layer.startSec
  const layerEndSec = Math.min(input.layer.endSec, input.durationSeconds)
  if (layerEndSec <= layerStartSec) {
    throw new Error(`AUDIO_SCORE_LAYER_TIME_RANGE_INVALID:${input.layer.id}`)
  }

  const splitPoints = new Set<number>([layerStartSec, layerEndSec])
  input.strategy.musicSilenceWindows.forEach((window) => {
    if (intervalsOverlap(layerStartSec, layerEndSec, window.startSec, window.endSec)) {
      splitPoints.add(Math.max(layerStartSec, window.startSec))
      splitPoints.add(Math.min(layerEndSec, window.endSec))
    }
  })
  input.strategy.sfxDuckingWindows.forEach((window) => {
    if (intervalsOverlap(layerStartSec, layerEndSec, window.startSec, window.endSec)) {
      splitPoints.add(Math.max(layerStartSec, window.startSec))
      splitPoints.add(Math.min(layerEndSec, window.endSec))
    }
  })

  const baseVolume = resolveScoreLayerBaseVolume(input.layer.role, input.strategy)
  const ordered = [...splitPoints].sort((left, right) => left - right)
  const segments: ScoreStemMixSegment[] = []

  for (let index = 0; index < ordered.length - 1; index += 1) {
    const startSec = ordered[index]
    const endSec = ordered[index + 1]
    if (typeof startSec !== 'number' || typeof endSec !== 'number') {
      throw new Error(`AUDIO_SCORE_MIX_SPLIT_POINT_MISSING:${input.layer.id}`)
    }
    if (endSec - startSec < 0.2) continue

    const silence = input.strategy.musicSilenceWindows.some((window) => (
      intervalsOverlap(startSec, endSec, window.startSec, window.endSec)
    ))
    if (silence) continue

    const duckWindows = input.strategy.sfxDuckingWindows.filter((window) => (
      intervalsOverlap(startSec, endSec, window.startSec, window.endSec)
    ))
    const muted = duckWindows.some((window) => (
      scoreBandMuted(input.layer.frequencyBand, window.muteFrequencyBands)
    ))
    if (muted) continue

    const duckVolume = duckWindows.reduce((current, window) => Math.min(current, window.scoreVolume), 1)
    segments.push({
      layerId: input.layer.id,
      startSec,
      sourceOffsetSec: startSec - layerStartSec,
      durationSec: endSec - startSec,
      volume: baseVolume * duckVolume,
    })
  }

  return segments
}
