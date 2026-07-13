import { generateMusic } from '@/lib/ai-exec/engine'
import { analyzeScoreCandidate, selectScoreCandidate } from '@/lib/audio-design/score-quality'
import type { MusicTheorySpecV2 } from '@/lib/audio-design/types'
import {
  decodeMonoFloat32,
  loadGeneratedAudioBuffer,
  uploadGeneratedAudio,
} from './audio-assets'
import type { BgmScoreMix, ScoreCandidateAsset } from './types'

export async function generateScoreCandidates(input: {
  readonly userId: string
  readonly musicModel: string
  readonly prompt: string
  readonly negativePrompt: string
  readonly providerDurationSeconds: number
  readonly timelineDurationSeconds: number
  readonly bpm: number
  readonly outputFormat: 'mp3' | 'wav'
  readonly spec: MusicTheorySpecV2
  readonly workspaceDir: string
  readonly reusableCandidates: readonly ScoreCandidateAsset[]
  readonly onProgress: (candidates: readonly ScoreCandidateAsset[]) => Promise<void>
}): Promise<{
  readonly candidates: readonly ScoreCandidateAsset[]
  readonly selected: BgmScoreMix
}> {
  const candidates = [...input.reusableCandidates]
  for (let candidateIndex = 0; candidateIndex < 2; candidateIndex += 1) {
    if (candidates.some((candidate) => candidate.candidateIndex === candidateIndex)) continue
    const generated = await generateMusic(input.userId, input.musicModel, input.prompt, {
      negativePrompt: input.negativePrompt,
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
    const samples = await decodeMonoFloat32({
      workspaceDir: input.workspaceDir,
      fileName: `score-candidate-${candidateIndex}`,
      audio,
    })
    const quality = analyzeScoreCandidate({
      samples,
      sampleRate: 48_000,
      expectedDurationSeconds: input.providerDurationSeconds,
      spec: input.spec,
    })
    const uploaded = await uploadGeneratedAudio({
      audio,
      durationSeconds: input.timelineDurationSeconds,
      prefix: 'music/bgm-score-candidate',
    })
    candidates.push({
      ...uploaded,
      candidateIndex,
      selected: false,
      quality,
    })
    await input.onProgress(candidates)
  }

  const ordered = [...candidates].sort((a, b) => a.candidateIndex - b.candidateIndex)
  if (ordered.length !== 2) throw new Error('AUDIO_SCORE_TWO_CANDIDATES_REQUIRED')
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
