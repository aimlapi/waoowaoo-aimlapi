import { execFile } from 'node:child_process'
import { readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { promisify } from 'node:util'
import { generateAudioStem } from '@/lib/audio-design/stem-generation'
import {
  assertAmbienceLoopBoundaryQuality,
  measureAmbienceLoopBoundary,
  selectBestAmbienceLoopCandidate,
} from '@/lib/audio-design/ambience-loop'
import { framesToSeconds, type AmbienceSource, type AudioTimelineV2 } from '@/lib/audio-design/types'
import { ensureMediaObjectFromStorageKey } from '@/lib/media/service'
import { generateUniqueKey, toFetchableUrl, uploadObject } from '@/lib/storage'
import type { AmbienceAsset, BgmScoreMix } from './types'

export type GeneratedAudioBuffer = {
  readonly buffer: Buffer
  readonly mimeType: string
}

const execFileAsync = promisify(execFile)

export function extensionFromAudioMimeType(mimeType: string): string {
  if (mimeType.includes('wav')) return 'wav'
  if (mimeType.includes('ogg')) return 'ogg'
  if (mimeType.includes('mp4') || mimeType.includes('m4a')) return 'm4a'
  return 'mp3'
}

function decodeAudioDataUrl(dataUrl: string): GeneratedAudioBuffer | null {
  const match = /^data:(audio\/[^;]+);base64,(.+)$/i.exec(dataUrl.trim())
  if (!match?.[1] || !match[2]) return null
  return { mimeType: match[1], buffer: Buffer.from(match[2], 'base64') }
}

export async function loadGeneratedAudioBuffer(input: {
  readonly audioBase64?: string
  readonly audioUrl?: string
  readonly mimeType?: string
}): Promise<GeneratedAudioBuffer> {
  const explicitMimeType = input.mimeType?.trim() || 'audio/mpeg'
  if (input.audioBase64) {
    return { buffer: Buffer.from(input.audioBase64, 'base64'), mimeType: explicitMimeType }
  }
  const audioUrl = input.audioUrl?.trim() || ''
  if (!audioUrl) throw new Error('BGM_SCORE_EMPTY_AUDIO_RESULT')
  const decoded = decodeAudioDataUrl(audioUrl)
  if (decoded) return decoded
  const response = await fetch(toFetchableUrl(audioUrl))
  if (!response.ok) throw new Error(`BGM_SCORE_AUDIO_DOWNLOAD_FAILED:${response.status}`)
  return {
    buffer: Buffer.from(await response.arrayBuffer()),
    mimeType: response.headers.get('content-type') || explicitMimeType,
  }
}

export async function uploadGeneratedAudio(input: {
  readonly audio: GeneratedAudioBuffer
  readonly durationSeconds: number
  readonly prefix: string
}): Promise<BgmScoreMix> {
  const storageKey = await uploadObject(
    input.audio.buffer,
    generateUniqueKey(input.prefix, extensionFromAudioMimeType(input.audio.mimeType)),
    1,
    input.audio.mimeType,
  )
  const durationMs = Math.round(input.durationSeconds * 1000)
  const media = await ensureMediaObjectFromStorageKey(storageKey, {
    mimeType: input.audio.mimeType,
    sizeBytes: input.audio.buffer.byteLength,
    durationMs,
  })
  return { mediaId: media.id, url: media.url, storageKey, mimeType: input.audio.mimeType, durationMs }
}

export async function decodeMonoFloat32(input: {
  readonly workspaceDir: string
  readonly fileName: string
  readonly audio: GeneratedAudioBuffer
}): Promise<Float32Array> {
  const sourcePath = path.join(input.workspaceDir, `${input.fileName}.${extensionFromAudioMimeType(input.audio.mimeType)}`)
  const pcmPath = path.join(input.workspaceDir, `${input.fileName}.f32le`)
  await writeFile(sourcePath, input.audio.buffer)
  await execFileAsync('ffmpeg', [
    '-y', '-v', 'error', '-i', sourcePath,
    '-vn', '-ac', '1', '-ar', '48000', '-f', 'f32le', pcmPath,
  ])
  const pcm = await readFile(pcmPath)
  if (pcm.byteLength % 4 !== 0) throw new Error('AUDIO_AMBIENCE_PCM_ALIGNMENT_INVALID')
  const samples = new Float32Array(pcm.byteLength / 4)
  for (let index = 0; index < samples.length; index += 1) {
    samples[index] = pcm.readFloatLE(index * 4)
  }
  return samples
}

function ambienceDurationSeconds(source: AmbienceSource, timeline: AudioTimelineV2): number {
  const frames = source.loopPolicy?.targetFrames
    ?? (source.range.endFrameExclusive - source.range.startFrame)
  const seconds = framesToSeconds(frames, timeline.clock)
  if (seconds < 0.5 || seconds > 22) {
    throw new Error(`AUDIO_AMBIENCE_PROVIDER_DURATION_OUT_OF_RANGE:${source.sourceId}:${seconds}`)
  }
  return seconds
}

export async function generateAmbienceAssets(input: {
  readonly userId: string
  readonly timeline: AudioTimelineV2
  readonly workspaceDir: string
  readonly reusableAssets: readonly AmbienceAsset[]
  readonly onProgress: (assets: readonly AmbienceAsset[]) => Promise<void>
}): Promise<readonly AmbienceAsset[]> {
  const assets: AmbienceAsset[] = [...input.reusableAssets]
  for (const source of input.timeline.ambienceSources) {
    const reusable = assets.filter((asset) => asset.sourceId === source.sourceId)
    if (reusable.length === 2 && reusable.filter((asset) => asset.selected).length === 1) continue

    const durationSeconds = ambienceDurationSeconds(source, input.timeline)
    const candidates: AmbienceAsset[] = []
    const measurements: ReturnType<typeof measureAmbienceLoopBoundary>[] = []
    for (let candidateIndex = 0; candidateIndex < 2; candidateIndex += 1) {
      const generated = await generateAudioStem({
        role: 'ambience',
        userId: input.userId,
        prompt: `${source.generationPrompt}\nCandidate variation ${candidateIndex + 1}: preserve the same source identity and loopability while varying only microscopic texture.`,
        durationSeconds,
        promptInfluence: source.promptInfluence,
        loop: source.playbackType === 'seamless_loop',
        outputFormat: 'mp3',
      })
      if (!generated.success) throw new Error(generated.error || 'AUDIO_AMBIENCE_PROVIDER_FAILED')
      const audio = await loadGeneratedAudioBuffer({
        audioBase64: generated.audioBase64,
        audioUrl: generated.audioUrl,
        mimeType: generated.audioMimeType,
      })
      const samples = await decodeMonoFloat32({
        workspaceDir: input.workspaceDir,
        fileName: `${source.sourceId}-${candidateIndex}`,
        audio,
      })
      const analysisWindowSeconds = source.loopPolicy
        ? framesToSeconds(source.loopPolicy.crossfadeFrames, input.timeline.clock)
        : undefined
      const measurement = measureAmbienceLoopBoundary({
        samples,
        sampleRate: input.timeline.clock.sampleRate,
        ...(analysisWindowSeconds ? { analysisWindowSeconds: Math.min(1, analysisWindowSeconds) } : {}),
      })
      measurements.push(measurement)
      const uploaded = await uploadGeneratedAudio({ audio, durationSeconds, prefix: 'audio/ambience' })
      candidates.push({
        ...uploaded,
        sourceId: source.sourceId,
        candidateIndex,
        selected: false,
        range: source.range,
        loop: source.playbackType === 'seamless_loop',
        crossfadeFrames: source.loopPolicy?.crossfadeFrames ?? 0,
        phaseOffsetFrames: source.loopPolicy?.phaseOffsetFrames ?? 0,
        boundaryScore: measurement.boundaryScore,
      })
    }
    const selectedIndex = selectBestAmbienceLoopCandidate(candidates)
    const selectedMeasurement = measurements[selectedIndex]
    if (!selectedMeasurement) throw new Error('AUDIO_AMBIENCE_LOOP_SELECTED_MEASUREMENT_MISSING')
    if (source.playbackType === 'seamless_loop') assertAmbienceLoopBoundaryQuality(selectedMeasurement)
    const selectedCandidates = candidates.map((candidate, index) => ({
      ...candidate,
      selected: index === selectedIndex,
    }))
    for (let index = assets.length - 1; index >= 0; index -= 1) {
      if (assets[index]?.sourceId === source.sourceId) assets.splice(index, 1)
    }
    assets.push(...selectedCandidates)
    await input.onProgress(assets)
  }
  return assets
}
