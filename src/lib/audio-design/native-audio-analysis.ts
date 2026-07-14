import { execFile } from 'node:child_process'
import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { promisify } from 'node:util'
import type { FinalRenderClipPlan } from '@/lib/video-compose/final-render-plan'
import { writeFinalRenderMediaSource } from '@/lib/video-compose/media-source'
import {
  AUDIO_SAMPLE_RATE,
  frameToSample,
  framesToSeconds,
  type TimelineClock,
  type TimelineClipAudio,
} from './types'
import {
  nativeAudioAnalysisSchema,
  nativeAudioClipAnalysisSchema,
  type NativeAudioActivityRange,
  type NativeAudioAnalysis,
  type NativeAudioClipAnalysis,
  type NativeAudioFrameFeature,
} from './native-audio-types'

export {
  compactNativeAudioForPrompt,
  nativeAudioAnalysisSchema,
  nativeAudioClipAnalysisSchema,
  nativeAudioFrameFeatureSchema,
} from './native-audio-types'
export type {
  NativeAudioAnalysis,
  NativeAudioClipAnalysis,
  NativeAudioFrameFeature,
} from './native-audio-types'

const execFileAsync = promisify(execFile)
const SILENCE_DBFS = -120

function amplitudeToDb(value: number): number {
  if (!Number.isFinite(value) || value <= 0) return SILENCE_DBFS
  return Math.max(SILENCE_DBFS, 20 * Math.log10(value))
}

function percentile(values: readonly number[], ratio: number): number {
  if (values.length === 0) return SILENCE_DBFS
  const sorted = [...values].sort((left, right) => left - right)
  const index = Math.min(sorted.length - 1, Math.max(0, Math.floor((sorted.length - 1) * ratio)))
  return sorted[index] ?? SILENCE_DBFS
}

function mergeActivityRanges(features: readonly NativeAudioFrameFeature[]) {
  const ranges: NativeAudioActivityRange[] = []
  let startIndex: number | null = null
  const flush = (endIndex: number): void => {
    if (startIndex === null) return
    const active = features.slice(startIndex, endIndex)
    const first = active[0]
    const last = active[active.length - 1]
    if (!first || !last) throw new Error('AUDIO_NATIVE_ACTIVITY_RANGE_EMPTY')
    ranges.push({
      range: { startFrame: first.frame, endFrameExclusive: last.frame + 1 },
      meanRmsDbfs: active.reduce((sum, feature) => sum + feature.rmsDbfs, 0) / active.length,
      peakDbfs: Math.max(...active.map((feature) => feature.peakDbfs)),
    })
    startIndex = null
  }
  features.forEach((feature, index) => {
    if (feature.active && startIndex === null) startIndex = index
    if (!feature.active && startIndex !== null) flush(index)
  })
  flush(features.length)
  return ranges
}

export function analyzeNativeAudioSamples(input: {
  readonly samples: Float32Array
  readonly clip: TimelineClipAudio
  readonly clock: TimelineClock
}): NativeAudioClipAnalysis {
  const frameCount = input.clip.range.endFrameExclusive - input.clip.range.startFrame
  const minimumSamples = frameToSample(frameCount, input.clock)
  if (input.samples.length + frameToSample(1, input.clock) < minimumSamples) {
    throw new Error(`AUDIO_NATIVE_TRACK_TOO_SHORT:${input.clip.order}:${input.samples.length}:${minimumSamples}`)
  }
  const rawFeatures = Array.from({ length: frameCount }, (_, localFrame) => {
    const startSample = frameToSample(localFrame, input.clock)
    const endSample = Math.min(input.samples.length, frameToSample(localFrame + 1, input.clock))
    let squareSum = 0
    let peak = 0
    let crossings = 0
    let previous = input.samples[startSample] ?? 0
    for (let sampleIndex = startSample; sampleIndex < endSample; sampleIndex += 1) {
      const sample = input.samples[sampleIndex] ?? 0
      squareSum += sample * sample
      peak = Math.max(peak, Math.abs(sample))
      if ((sample >= 0) !== (previous >= 0)) crossings += 1
      previous = sample
    }
    const sampleCount = Math.max(1, endSample - startSample)
    const rms = Math.sqrt(squareSum / sampleCount)
    const rmsDbfs = amplitudeToDb(rms)
    const peakDbfs = amplitudeToDb(peak)
    return {
      frame: input.clip.range.startFrame + localFrame,
      rmsDbfs,
      peakDbfs,
      crestDb: Math.max(0, peakDbfs - rmsDbfs),
      zeroCrossingRate: crossings / sampleCount,
    }
  })
  const noiseFloor = percentile(rawFeatures.map((feature) => feature.rmsDbfs), 0.2)
  const activityThresholdDbfs = Math.min(-24, Math.max(-55, noiseFloor + 10))
  const frameFeatures: NativeAudioFrameFeature[] = rawFeatures.map((feature, index) => {
    const previous = rawFeatures[index - 1]
    const riseDb = previous ? feature.rmsDbfs - previous.rmsDbfs : 0
    const active = feature.rmsDbfs >= activityThresholdDbfs
    return {
      ...feature,
      active,
      transient: active && riseDb >= 6 && feature.crestDb >= 6,
    }
  })
  const pcmBytes = Buffer.from(new Uint8Array(input.samples.buffer, input.samples.byteOffset, input.samples.byteLength))
  return nativeAudioClipAnalysisSchema.parse({
    order: input.clip.order,
    range: input.clip.range,
    pcmHash: createHash('sha256').update(pcmBytes).digest('hex').slice(0, 24),
    activityThresholdDbfs,
    frameFeatures,
    activityRanges: mergeActivityRanges(frameFeatures),
    transientFrames: frameFeatures.filter((feature) => feature.transient).map((feature) => feature.frame),
  })
}

async function decodeRequiredNativeAudio(input: {
  readonly clip: FinalRenderClipPlan
  readonly timelineClip: TimelineClipAudio
  readonly clock: TimelineClock
  readonly workspaceDir: string
}): Promise<Float32Array> {
  const sourcePath = path.join(input.workspaceDir, `native-source-${input.clip.order}.mp4`)
  const pcmPath = path.join(input.workspaceDir, `native-audio-${input.clip.order}.f32le`)
  await writeFinalRenderMediaSource(input.clip.source, sourcePath)
  const probe = await execFileAsync('ffprobe', [
    '-v', 'error', '-select_streams', 'a:0', '-show_entries', 'stream=index', '-of', 'csv=p=0', sourcePath,
  ])
  if (!String(probe.stdout ?? '').trim()) {
    throw new Error(`AUDIO_NATIVE_TRACK_REQUIRED:${input.clip.order}`)
  }
  const frameCount = input.timelineClip.range.endFrameExclusive - input.timelineClip.range.startFrame
  await execFileAsync('ffmpeg', [
    '-y', '-v', 'error', '-i', sourcePath, '-vn',
    '-t', framesToSeconds(frameCount, input.clock).toFixed(6),
    '-ac', '1', '-ar', String(AUDIO_SAMPLE_RATE), '-f', 'f32le', pcmPath,
  ])
  const pcm = await readFile(pcmPath)
  if (pcm.byteLength === 0 || pcm.byteLength % Float32Array.BYTES_PER_ELEMENT !== 0) {
    throw new Error(`AUDIO_NATIVE_PCM_INVALID:${input.clip.order}`)
  }
  const samples = new Float32Array(pcm.byteLength / Float32Array.BYTES_PER_ELEMENT)
  new Uint8Array(samples.buffer).set(pcm)
  return samples
}

export async function analyzeRequiredNativeAudio(input: {
  readonly clips: readonly FinalRenderClipPlan[]
  readonly timelineClips: readonly TimelineClipAudio[]
  readonly clock: TimelineClock
  readonly workspaceDir: string
}): Promise<NativeAudioAnalysis> {
  const clipAnalyses: NativeAudioClipAnalysis[] = []
  for (const clip of input.clips) {
    const timelineClip = input.timelineClips.find((item) => item.order === clip.order)
    if (!timelineClip) throw new Error(`AUDIO_NATIVE_TIMELINE_CLIP_MISSING:${clip.order}`)
    const samples = await decodeRequiredNativeAudio({
      clip,
      timelineClip,
      clock: input.clock,
      workspaceDir: input.workspaceDir,
    })
    clipAnalyses.push(analyzeNativeAudioSamples({ samples, clip: timelineClip, clock: input.clock }))
  }
  const audioContentHash = createHash('sha256')
    .update(clipAnalyses.map((clip) => clip.pcmHash).join(':'))
    .digest('hex')
    .slice(0, 24)
  return nativeAudioAnalysisSchema.parse({
    schemaVersion: 1,
    sampleRate: AUDIO_SAMPLE_RATE,
    audioContentHash,
    clips: clipAnalyses,
  })
}
