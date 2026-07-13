import { execFile } from 'node:child_process'
import { readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { promisify } from 'node:util'
import { AUDIO_SAMPLE_RATE } from './types'

const execFileAsync = promisify(execFile)
const MINIMUM_CONFORMANCE_RATIO = 0.95
const MAXIMUM_CONFORMANCE_RATIO = 1.05

export type ScoreDurationConformance = {
  readonly sourceDurationSeconds: number
  readonly targetDurationSeconds: number
  readonly tempoRatio: number
  readonly requiresProcessing: boolean
}

export function resolveScoreDurationConformance(input: {
  readonly sourceDurationSeconds: number
  readonly targetDurationSeconds: number
}): ScoreDurationConformance {
  if (!Number.isFinite(input.sourceDurationSeconds) || input.sourceDurationSeconds <= 0) {
    throw new Error('AUDIO_SCORE_SOURCE_DURATION_INVALID')
  }
  if (!Number.isFinite(input.targetDurationSeconds) || input.targetDurationSeconds <= 0) {
    throw new Error('AUDIO_SCORE_TARGET_DURATION_INVALID')
  }
  const tempoRatio = input.sourceDurationSeconds / input.targetDurationSeconds
  if (tempoRatio < MINIMUM_CONFORMANCE_RATIO || tempoRatio > MAXIMUM_CONFORMANCE_RATIO) {
    throw new Error(`AUDIO_SCORE_DURATION_CONFORMANCE_OUT_OF_RANGE:${tempoRatio.toFixed(6)}`)
  }
  return {
    sourceDurationSeconds: input.sourceDurationSeconds,
    targetDurationSeconds: input.targetDurationSeconds,
    tempoRatio,
    requiresProcessing: Math.abs(input.sourceDurationSeconds - input.targetDurationSeconds) > (1 / AUDIO_SAMPLE_RATE),
  }
}

function audioExtension(mimeType: string): 'mp3' | 'wav' {
  if (mimeType.includes('mpeg') || mimeType.includes('mp3')) return 'mp3'
  if (mimeType.includes('wav')) return 'wav'
  throw new Error(`AUDIO_SCORE_DURATION_MIME_UNSUPPORTED:${mimeType}`)
}

export async function conformScoreDuration(input: {
  readonly audio: { readonly buffer: Buffer; readonly mimeType: string }
  readonly workspaceDir: string
  readonly fileName: string
  readonly sourceDurationSeconds: number
  readonly targetDurationSeconds: number
}): Promise<{
  readonly audio: { readonly buffer: Buffer; readonly mimeType: string }
  readonly conformance: ScoreDurationConformance
}> {
  const conformance = resolveScoreDurationConformance(input)
  if (!conformance.requiresProcessing) return { audio: input.audio, conformance }
  const extension = audioExtension(input.audio.mimeType)
  const sourcePath = path.join(input.workspaceDir, `${input.fileName}-duration-source.${extension}`)
  const outputPath = path.join(input.workspaceDir, `${input.fileName}-duration-conformed.wav`)
  await writeFile(sourcePath, input.audio.buffer)
  const targetSamples = Math.round(input.targetDurationSeconds * AUDIO_SAMPLE_RATE)
  await execFileAsync('ffmpeg', [
    '-y', '-v', 'error', '-i', sourcePath, '-vn',
    '-af', `atempo=${conformance.tempoRatio.toFixed(9)},apad,atrim=end_sample=${targetSamples}`,
    '-ar', String(AUDIO_SAMPLE_RATE), '-c:a', 'pcm_s24le', outputPath,
  ])
  return {
    audio: { buffer: await readFile(outputPath), mimeType: 'audio/wav' },
    conformance,
  }
}
