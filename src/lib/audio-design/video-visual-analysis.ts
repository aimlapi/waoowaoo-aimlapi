import { execFile } from 'node:child_process'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { promisify } from 'node:util'
import { z } from 'zod'
import { executeAiVisionStep } from '@/lib/ai-exec/engine'
import { safeParseJsonObject } from '@/lib/json-repair'
import { resolveStorageKeyFromMediaValue } from '@/lib/media/service'
import { getObjectBuffer, toFetchableUrl } from '@/lib/storage'
import type { FinalRenderClipPlan } from '@/lib/video-compose/final-render-plan'
import { framesToSeconds, type TimelineClock, type TimelineClipAudio } from './types'
import {
  videoVisualAnalysisSchema,
  visualFrameObservationSchema,
  type VideoVisualAnalysis,
} from './video-visual-types'

const execFileAsync = promisify(execFile)
const MAX_VISUAL_SAMPLES = 120
const VISION_BATCH_SIZE = 12

export type VideoVisualSample = {
  readonly frame: number
  readonly imageUrl: string
}

function sampleStepFrames(clock: TimelineClock): number {
  const minimumStep = Math.round(clock.fpsNumerator / clock.fpsDenominator)
  const requiredStep = Math.ceil(clock.totalFrames / MAX_VISUAL_SAMPLES)
  return Math.max(minimumStep, Math.ceil(requiredStep / minimumStep) * minimumStep)
}

function sampleFramesForClip(input: {
  readonly clip: TimelineClipAudio
  readonly stepFrames: number
}): readonly number[] {
  const frames: number[] = []
  for (
    let frame = input.clip.range.startFrame;
    frame < input.clip.range.endFrameExclusive;
    frame += input.stepFrames
  ) {
    frames.push(frame)
  }
  const lastFrame = input.clip.range.endFrameExclusive - 1
  if (frames[frames.length - 1] !== lastFrame) frames.push(lastFrame)
  return frames
}

async function writeVideoSource(source: FinalRenderClipPlan['source'], outputPath: string): Promise<void> {
  const storageKey = await resolveStorageKeyFromMediaValue(source)
  if (storageKey) {
    await writeFile(outputPath, await getObjectBuffer(storageKey))
    return
  }
  if (typeof source !== 'string' || !source.trim()) {
    throw new Error('AUDIO_VISUAL_ANALYSIS_VIDEO_SOURCE_INVALID')
  }
  const response = await fetch(toFetchableUrl(source))
  if (!response.ok) throw new Error(`AUDIO_VISUAL_ANALYSIS_VIDEO_DOWNLOAD_FAILED:${response.status}`)
  await writeFile(outputPath, Buffer.from(await response.arrayBuffer()))
}

async function extractVisualSamples(input: {
  readonly clips: readonly FinalRenderClipPlan[]
  readonly timelineClips: readonly TimelineClipAudio[]
  readonly clock: TimelineClock
  readonly workspaceDir: string
  readonly stepFrames: number
}): Promise<readonly VideoVisualSample[]> {
  const samples: VideoVisualSample[] = []
  for (const clip of input.clips) {
    const timelineClip = input.timelineClips.find((item) => item.order === clip.order)
    if (!timelineClip) throw new Error(`AUDIO_VISUAL_ANALYSIS_TIMELINE_CLIP_MISSING:${clip.order}`)
    const sourcePath = path.join(input.workspaceDir, `visual-source-${clip.order}.mp4`)
    await writeVideoSource(clip.source, sourcePath)
    const frames = sampleFramesForClip({ clip: timelineClip, stepFrames: input.stepFrames })
    for (const frame of frames) {
      const localFrame = frame - timelineClip.range.startFrame
      const framePath = path.join(input.workspaceDir, `visual-frame-${frame}.jpg`)
      await execFileAsync('ffmpeg', [
        '-y', '-v', 'error',
        '-i', sourcePath,
        '-ss', framesToSeconds(localFrame, input.clock).toFixed(6),
        '-frames:v', '1',
        '-vf', 'scale=768:-2:flags=lanczos',
        '-q:v', '3',
        framePath,
      ])
      const image = await readFile(framePath)
      if (image.byteLength === 0) throw new Error(`AUDIO_VISUAL_ANALYSIS_FRAME_EMPTY:${frame}`)
      samples.push({ frame, imageUrl: `data:image/jpeg;base64,${image.toString('base64')}` })
    }
  }
  return samples.sort((left, right) => left.frame - right.frame)
}

export function buildVideoVisualAnalysisPrompt(
  samples: readonly VideoVisualSample[],
  clock: TimelineClock,
): string {
  return [
    '# Role',
    'You are a film visual-continuity observer supporting ambience and score planning.',
    '',
    '# Rules',
    '1. Observe visible facts only. Do not invent screenplay facts, dialogue, sound effects, or off-screen actions.',
    '2. Each image corresponds to the frame listed below. Copy every frame number exactly once.',
    '3. Describe location, enclosure, visible weather, persistent environmental conditions, activity level, and appropriate underscore energy.',
    '4. Do not describe violence, injury, body parts, or graphic actions. Replace any such visual content with the neutral phrase "restricted narrative event".',
    '5. Return strict JSON only: {"observations":[...]} with no Markdown or extra fields.',
    '',
    '# Observation item schema',
    '{"frame": integer, "location": string, "enclosure":"open|semi_open|enclosed", "weather":string|null, "persistentEnvironment":string[], "activityLevel":0..1, "suggestedScoreEnergy":0..1, "description":string}',
    '',
    '# Frame clock',
    JSON.stringify(clock),
    '',
    '# Image order',
    samples.map((sample, index) => `Image ${index + 1}: frame ${sample.frame}`).join('\n'),
  ].join('\n')
}

export function parseVideoVisualObservationBatch(
  text: string,
  expectedFrames: readonly number[],
): VideoVisualAnalysis['observations'] {
  const value = safeParseJsonObject(text)
  const parsed = z.object({ observations: z.array(visualFrameObservationSchema) }).safeParse(value)
  if (!parsed.success) {
    const issues = parsed.error.issues.map((issue) => `${issue.path.join('.')}:${issue.message}`).join(',')
    throw new Error(`AUDIO_VISUAL_ANALYSIS_INVALID:${issues}`)
  }
  const actualFrames = parsed.data.observations.map((item) => item.frame)
  if (JSON.stringify(actualFrames) !== JSON.stringify(expectedFrames)) {
    throw new Error(`AUDIO_VISUAL_ANALYSIS_FRAME_MAP_INVALID:${actualFrames.join(',')}`)
  }
  return parsed.data.observations
}

export async function analyzeLockedVideoFrames(input: {
  readonly userId: string
  readonly model: string
  readonly projectId: string
  readonly clips: readonly FinalRenderClipPlan[]
  readonly timelineClips: readonly TimelineClipAudio[]
  readonly clock: TimelineClock
}): Promise<VideoVisualAnalysis> {
  const workspaceDir = await mkdtemp(path.join(tmpdir(), 'waoowaoo-audio-visual-'))
  try {
    const stepFrames = sampleStepFrames(input.clock)
    const samples = await extractVisualSamples({
      clips: input.clips,
      timelineClips: input.timelineClips,
      clock: input.clock,
      workspaceDir,
      stepFrames,
    })
    if (samples.length === 0) throw new Error('AUDIO_VISUAL_ANALYSIS_NO_FRAMES')
    const observations: VideoVisualAnalysis['observations'][number][] = []
    for (let offset = 0; offset < samples.length; offset += VISION_BATCH_SIZE) {
      const batch = samples.slice(offset, offset + VISION_BATCH_SIZE)
      const completion = await executeAiVisionStep({
        userId: input.userId,
        model: input.model,
        prompt: buildVideoVisualAnalysisPrompt(batch, input.clock),
        imageUrls: batch.map((sample) => sample.imageUrl),
        projectId: input.projectId,
        action: 'audio_video_visual_analysis_v1',
        meta: {
          stepId: `audio_video_visual_analysis_v1_${offset / VISION_BATCH_SIZE + 1}`,
          stepTitle: 'audio_video_visual_analysis_v1',
          stepIndex: offset / VISION_BATCH_SIZE + 1,
          stepTotal: Math.ceil(samples.length / VISION_BATCH_SIZE),
        },
        temperature: 0.1,
      })
      observations.push(...parseVideoVisualObservationBatch(completion.text, batch.map((sample) => sample.frame)))
    }
    return videoVisualAnalysisSchema.parse({ schemaVersion: 1, sampleStepFrames: stepFrames, observations })
  } finally {
    await rm(workspaceDir, { recursive: true, force: true })
  }
}
