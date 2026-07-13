import { readFile } from 'node:fs/promises'
import {
  assertAmbienceContinuity,
  measureAmbienceContinuity,
  type AmbienceContinuityMeasurement,
} from '@/lib/audio-design/ambience-continuity-quality'
import { buildGainAutomationVolumeFilter } from '@/lib/audio-design/automation'
import {
  frameToSample,
  framesToSeconds,
  type AutomationLane,
  type TimelineClock,
} from '@/lib/audio-design/types'
import {
  buildFinalRenderAmbienceGraph,
  type FinalRenderAmbienceTrack,
} from './final-render-ambience'

export { AMBIENCE_AUDIO_TARGET, type FinalRenderAmbienceTrack } from './final-render-ambience'

export type FinalRenderAudioCommandResult = {
  readonly stdout: string
  readonly stderr: string
}

export type FinalRenderAudioCommandRunner = (
  command: string,
  args: readonly string[],
) => Promise<FinalRenderAudioCommandResult>

export type AudioLoudnessTarget = {
  readonly integratedLufs: number
  readonly truePeakDb: number
  readonly loudnessRange: number
}

export type AudioLoudnessMeasurement = {
  readonly inputIntegrated: number
  readonly inputTruePeak: number
  readonly inputLra: number
  readonly inputThreshold: number
  readonly targetOffset: number
}

export type FinalRenderAudioMixResult = {
  readonly hasSourceAudio: boolean
  readonly mainAudio?: AudioLoudnessMeasurement
  readonly bgm: AudioLoudnessMeasurement
  readonly ambienceTrackCount: number
  readonly ambienceContinuity: readonly AmbienceContinuityMeasurement[]
}

export const MAIN_AUDIO_TARGET: AudioLoudnessTarget = {
  integratedLufs: -16,
  truePeakDb: -1.5,
  loudnessRange: 11,
}

export const BGM_AUDIO_TARGET: AudioLoudnessTarget = {
  integratedLufs: -18,
  truePeakDb: -2,
  loudnessRange: 14,
}

async function hasAudioStream(runCommand: FinalRenderAudioCommandRunner, filePath: string): Promise<boolean> {
  const result = await runCommand('ffprobe', [
    '-v', 'error', '-select_streams', 'a:0', '-show_entries', 'stream=index', '-of', 'csv=p=0', filePath,
  ])
  return result.stdout.trim().length > 0
}

async function probeAudioDuration(runCommand: FinalRenderAudioCommandRunner, filePath: string): Promise<number> {
  const result = await runCommand('ffprobe', [
    '-v', 'error', '-show_entries', 'format=duration', '-of', 'default=noprint_wrappers=1:nokey=1', filePath,
  ])
  const duration = Number.parseFloat(result.stdout.trim())
  if (!Number.isFinite(duration) || duration <= 0) throw new Error('FINAL_VIDEO_RENDER_AUDIO_DURATION_INVALID')
  return duration
}

function parseLoudnormNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value !== 'string') return null
  const parsed = Number.parseFloat(value)
  return Number.isFinite(parsed) ? parsed : null
}

function parseLoudnormMeasurement(stderr: string): AudioLoudnessMeasurement {
  const match = /\{[\s\S]*"input_i"[\s\S]*?\}/.exec(stderr)
  if (!match) throw new Error('FINAL_VIDEO_RENDER_LOUDNESS_ANALYSIS_FAILED')
  const parsed = JSON.parse(match[0]) as unknown
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('FINAL_VIDEO_RENDER_LOUDNESS_ANALYSIS_FAILED')
  }
  const record = parsed as Record<string, unknown>
  const inputIntegrated = parseLoudnormNumber(record.input_i)
  const inputTruePeak = parseLoudnormNumber(record.input_tp)
  const inputLra = parseLoudnormNumber(record.input_lra)
  const inputThreshold = parseLoudnormNumber(record.input_thresh)
  const targetOffset = parseLoudnormNumber(record.target_offset)
  if (inputIntegrated === null || inputTruePeak === null || inputLra === null || inputThreshold === null || targetOffset === null) {
    throw new Error('FINAL_VIDEO_RENDER_LOUDNESS_ANALYSIS_FAILED')
  }
  return { inputIntegrated, inputTruePeak, inputLra, inputThreshold, targetOffset }
}

function format(value: number): string {
  if (!Number.isFinite(value)) throw new Error('FINAL_VIDEO_RENDER_AUDIO_FILTER_NUMBER_INVALID')
  return value.toFixed(6)
}

function loudnormAnalyzeFilter(target: AudioLoudnessTarget): string {
  return `I=${format(target.integratedLufs)}:TP=${format(target.truePeakDb)}:LRA=${format(target.loudnessRange)}:print_format=json`
}

function loudnormApplyFilter(target: AudioLoudnessTarget, measurement: AudioLoudnessMeasurement): string {
  return [
    `I=${format(target.integratedLufs)}`,
    `TP=${format(target.truePeakDb)}`,
    `LRA=${format(target.loudnessRange)}`,
    `measured_I=${format(measurement.inputIntegrated)}`,
    `measured_TP=${format(measurement.inputTruePeak)}`,
    `measured_LRA=${format(measurement.inputLra)}`,
    `measured_thresh=${format(measurement.inputThreshold)}`,
    `offset=${format(measurement.targetOffset)}`,
    'linear=true',
    'print_format=summary',
  ].join(':')
}

async function analyzeAudioLoudness(
  runCommand: FinalRenderAudioCommandRunner,
  inputPath: string,
  target: AudioLoudnessTarget,
): Promise<AudioLoudnessMeasurement> {
  const result = await runCommand('ffmpeg', [
    '-hide_banner', '-nostats', '-i', inputPath, '-af', `loudnorm=${loudnormAnalyzeFilter(target)}`, '-f', 'null', '-',
  ])
  return parseLoudnormMeasurement(result.stderr)
}

async function validateAmbienceBusContinuity(input: {
  readonly runCommand: FinalRenderAudioCommandRunner
  readonly graph: ReturnType<typeof buildFinalRenderAmbienceGraph>
  readonly pcmPath: string
  readonly boundaryFrames: readonly number[]
  readonly clock: TimelineClock
}): Promise<readonly AmbienceContinuityMeasurement[]> {
  if (input.boundaryFrames.length === 0) return []
  if (input.graph.outputLabels.length === 0) {
    throw new Error('FINAL_VIDEO_RENDER_AMBIENCE_CONTINUITY_TRACK_REQUIRED')
  }
  const totalSamples = frameToSample(input.clock.totalFrames, input.clock)
  const filters = [
    ...input.graph.filters,
    `${input.graph.outputLabels.join('')}amix=inputs=${input.graph.outputLabels.length}:duration=longest:normalize=0:dropout_transition=0,atrim=end_sample=${totalSamples},aformat=sample_fmts=flt:channel_layouts=mono[ambience_qc]`,
  ]
  await input.runCommand('ffmpeg', [
    '-y', ...input.graph.inputArgs,
    '-filter_complex', filters.join(';'),
    '-map', '[ambience_qc]', '-c:a', 'pcm_f32le', '-f', 'f32le', input.pcmPath,
  ])
  const pcm = await readFile(input.pcmPath)
  if (pcm.byteLength % Float32Array.BYTES_PER_ELEMENT !== 0) {
    throw new Error('FINAL_VIDEO_RENDER_AMBIENCE_PCM_INVALID')
  }
  const samples = new Float32Array(
    pcm.buffer,
    pcm.byteOffset,
    pcm.byteLength / Float32Array.BYTES_PER_ELEMENT,
  )
  const measurements = measureAmbienceContinuity({
    samples,
    clock: input.clock,
    boundaryFrames: input.boundaryFrames,
  })
  assertAmbienceContinuity({ measurements })
  return measurements
}

export async function renderFinalRenderClipAudio(input: {
  readonly runCommand: FinalRenderAudioCommandRunner
  readonly sourcePath: string
  readonly outputPath: string
  readonly durationSeconds: number
}): Promise<boolean> {
  const hasAudio = await hasAudioStream(input.runCommand, input.sourcePath)
  if (!hasAudio) {
    await input.runCommand('ffmpeg', [
      '-y', '-f', 'lavfi', '-t', input.durationSeconds.toFixed(6), '-i',
      'anullsrc=r=48000:cl=stereo', '-c:a', 'pcm_s24le', input.outputPath,
    ])
    return false
  }
  await input.runCommand('ffmpeg', [
    '-y', '-i', input.sourcePath, '-t', input.durationSeconds.toFixed(6), '-vn',
    '-af', 'aresample=48000,aformat=sample_fmts=fltp:channel_layouts=stereo',
    '-c:a', 'pcm_s24le', input.outputPath,
  ])
  return true
}

export async function concatFinalRenderAudioClips(input: {
  readonly runCommand: FinalRenderAudioCommandRunner
  readonly clipAudioPaths: readonly string[]
  readonly outputPath: string
}): Promise<void> {
  if (input.clipAudioPaths.length === 0) throw new Error('FINAL_VIDEO_RENDER_NO_AUDIO_CLIPS')
  const audioInputs = input.clipAudioPaths.flatMap((clipPath) => ['-i', clipPath])
  const filterInputs = input.clipAudioPaths.map((_, index) => `[${index}:a]`).join('')
  await input.runCommand('ffmpeg', [
    '-y', ...audioInputs, '-filter_complex',
    `${filterInputs}concat=n=${input.clipAudioPaths.length}:v=0:a=1[aout]`,
    '-map', '[aout]', '-c:a', 'pcm_s24le', input.outputPath,
  ])
}

export async function muxFinalRenderAudio(input: {
  readonly runCommand: FinalRenderAudioCommandRunner
  readonly stitchedPath: string
  readonly mainAudioPath: string
  readonly hasSourceAudio: boolean
  readonly musicPath: string
  readonly ambienceTracks: readonly FinalRenderAmbienceTrack[]
  readonly ambienceQualityPcmPath: string
  readonly ambienceQualityBoundaryFrames: readonly number[]
  readonly outputPath: string
  readonly clock: TimelineClock
  readonly volume: number
  readonly automationLanes: readonly AutomationLane[]
}): Promise<FinalRenderAudioMixResult> {
  const durationSeconds = framesToSeconds(input.clock.totalFrames, input.clock)
  const musicDuration = await probeAudioDuration(input.runCommand, input.musicPath)
  if (musicDuration + 0.01 < durationSeconds) {
    throw new Error(`FINAL_VIDEO_RENDER_BGM_TOO_SHORT:${musicDuration}:${durationSeconds}`)
  }
  const bgmMeasurement = await analyzeAudioLoudness(input.runCommand, input.musicPath, BGM_AUDIO_TARGET)
  const mainMeasurement = input.hasSourceAudio
    ? await analyzeAudioLoudness(input.runCommand, input.mainAudioPath, MAIN_AUDIO_TARGET)
    : undefined
  const scoreLanes = input.automationLanes.filter((lane) => lane.targetBus === 'score')
  const scoreVolume = buildGainAutomationVolumeFilter({
    baseVolume: input.volume,
    lanes: scoreLanes,
    clock: input.clock,
  })
  const filters: string[] = [
    input.hasSourceAudio && mainMeasurement
      ? `[1:a]loudnorm=${loudnormApplyFilter(MAIN_AUDIO_TARGET, mainMeasurement)}[native_bus]`
      : '[1:a]volume=0[native_bus]',
    `[2:a]atrim=0:${format(durationSeconds)},asetpts=PTS-STARTPTS,loudnorm=${loudnormApplyFilter(BGM_AUDIO_TARGET, bgmMeasurement)},${scoreVolume}[score_bus]`,
  ]
  const mixInputs = ['[native_bus]', '[score_bus]']
  const ambienceGraph = buildFinalRenderAmbienceGraph({
    tracks: input.ambienceTracks,
    clock: input.clock,
    automationLanes: input.automationLanes,
    firstInputIndex: 3,
  })
  const ambienceContinuity = await validateAmbienceBusContinuity({
    runCommand: input.runCommand,
    graph: buildFinalRenderAmbienceGraph({
      tracks: input.ambienceTracks,
      clock: input.clock,
      automationLanes: input.automationLanes,
      firstInputIndex: 0,
    }),
    pcmPath: input.ambienceQualityPcmPath,
    boundaryFrames: input.ambienceQualityBoundaryFrames,
    clock: input.clock,
  })
  filters.push(...ambienceGraph.filters)
  mixInputs.push(...ambienceGraph.outputLabels)
  filters.push(`${mixInputs.join('')}amix=inputs=${mixInputs.length}:duration=first:normalize=0:dropout_transition=0,alimiter=limit=0.95[aout]`)

  await input.runCommand('ffmpeg', [
    '-y', '-i', input.stitchedPath, '-i', input.mainAudioPath, '-i', input.musicPath,
    ...ambienceGraph.inputArgs,
    '-filter_complex', filters.join(';'),
    '-map', '0:v:0', '-map', '[aout]', '-c:v', 'copy', '-c:a', 'aac', '-b:a', '256k',
    '-movflags', '+faststart', '-shortest', input.outputPath,
  ])
  return {
    hasSourceAudio: input.hasSourceAudio,
    ...(mainMeasurement ? { mainAudio: mainMeasurement } : {}),
    bgm: bgmMeasurement,
    ambienceTrackCount: input.ambienceTracks.length,
    ambienceContinuity,
  }
}
