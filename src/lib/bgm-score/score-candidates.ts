import { generateMusic } from '@/lib/ai-exec/engine'
import type { LyriaPromptPair } from '@/lib/audio-design/lyria-prompt'
import { analyzeScoreCandidate, selectScoreCandidate } from '@/lib/audio-design/score-quality'
import { AUDIO_SAMPLE_RATE, type MusicTheorySpecV3 } from '@/lib/audio-design/types'
import { conformScoreDuration } from '@/lib/audio-design/score-duration'
import {
  decodeMonoFloat32,
  loadGeneratedAudioBuffer,
  uploadGeneratedAudio,
} from './audio-assets'
import type { BgmScoreMix, ScoreCandidateAsset } from './types'

export async function generateScoreCandidates(input: {
  readonly userId: string
  readonly musicModel: string
  readonly requests: readonly LyriaPromptPair[]
  readonly providerDurationSeconds: number
  readonly timelineDurationSeconds: number
  readonly bpm: number
  readonly outputFormat: 'mp3' | 'wav'
  readonly spec: MusicTheorySpecV3
  readonly workspaceDir: string
  readonly reusableCandidates: readonly ScoreCandidateAsset[]
  readonly onProgress: (candidates: readonly ScoreCandidateAsset[]) => Promise<void>
}): Promise<{
  readonly candidates: readonly ScoreCandidateAsset[]
  readonly selected: BgmScoreMix
}> {
  if (input.requests.length !== 4) throw new Error('AUDIO_SCORE_FOUR_RENDER_STRATEGIES_REQUIRED')
  input.requests.forEach((request, index) => {
    if (request.strategy !== input.spec.renderStrategies[index]) {
      throw new Error(`AUDIO_SCORE_RENDER_STRATEGY_ORDER_INVALID:${index}`)
    }
  })
  const candidates = [...input.reusableCandidates]
  for (const candidate of candidates) {
    if (candidate.renderStrategy !== input.spec.renderStrategies[candidate.candidateIndex]) {
      throw new Error(`AUDIO_SCORE_REUSABLE_CANDIDATE_STRATEGY_MISMATCH:${candidate.candidateIndex}`)
    }
  }
  for (const [candidateIndex, request] of input.requests.entries()) {
    if (candidates.some((candidate) => candidate.candidateIndex === candidateIndex)) continue
    const generated = await generateMusic(input.userId, input.musicModel, request.prompt, {
      negativePrompt: request.negativePrompt,
      durationSeconds: input.providerDurationSeconds,
      vocalMode: 'instrumental',
      bpm: input.bpm,
      outputFormat: input.outputFormat,
    })
    if (!generated.success) throw new Error(generated.error || 'BGM_SCORE_PROVIDER_FAILED')
    const audio = await loadGeneratedAudioBuffer({
      audioBase64: generated.audioBase64,
      audioUrl: generated.audioUrl,
      mimeType: generated.audioMimeType,
    })
    const sourceSamples = await decodeMonoFloat32({
      workspaceDir: input.workspaceDir,
      fileName: `score-candidate-${candidateIndex}-source`,
      audio,
    })
    const conformed = await conformScoreDuration({
      audio,
      workspaceDir: input.workspaceDir,
      fileName: `score-candidate-${candidateIndex}`,
      sourceDurationSeconds: sourceSamples.length / AUDIO_SAMPLE_RATE,
      targetDurationSeconds: input.timelineDurationSeconds,
    })
    const samples = await decodeMonoFloat32({
      workspaceDir: input.workspaceDir,
      fileName: `score-candidate-${candidateIndex}`,
      audio: conformed.audio,
    })
    const quality = analyzeScoreCandidate({
      samples,
      sampleRate: AUDIO_SAMPLE_RATE,
      expectedDurationSeconds: input.timelineDurationSeconds,
      sourceDurationSeconds: conformed.conformance.sourceDurationSeconds,
      durationConformanceRatio: conformed.conformance.tempoRatio,
      spec: input.spec,
    })
    const uploaded = await uploadGeneratedAudio({
      audio: conformed.audio,
      durationSeconds: input.timelineDurationSeconds,
      prefix: 'music/bgm-score-candidate',
    })
    candidates.push({
      ...uploaded,
      candidateIndex,
      renderStrategy: request.strategy,
      selected: false,
      quality,
    })
    await input.onProgress(candidates)
  }

  const ordered = [...candidates].sort((a, b) => a.candidateIndex - b.candidateIndex)
  if (ordered.length !== 4) throw new Error('AUDIO_SCORE_FOUR_CANDIDATES_REQUIRED')
  const selectedIndex = selectScoreCandidate(ordered.map((candidate) => candidate.quality))
  const selectedCandidates = ordered.map((candidate, index) => ({
    ...candidate,
    selected: index === selectedIndex,
  }))
  await input.onProgress(selectedCandidates)
  const selected = selectedCandidates[selectedIndex]
  if (!selected) throw new Error('AUDIO_SCORE_SELECTED_CANDIDATE_MISSING')
  return {
    candidates: selectedCandidates,
    selected: {
      mediaId: selected.mediaId,
      url: selected.url,
      storageKey: selected.storageKey,
      mimeType: selected.mimeType,
      durationMs: selected.durationMs,
    },
  }
}
