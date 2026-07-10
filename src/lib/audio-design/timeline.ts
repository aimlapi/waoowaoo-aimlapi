import { createHash } from 'node:crypto'
import type { FinalRenderClipPlan } from '@/lib/video-compose/final-render-plan'
import { resolveDefaultAudioStemModelConfig } from '@/lib/ai-registry/audio-stem-model-config'
import {
  AUDIO_SAMPLE_RATE,
  AUDIO_TIMELINE_SCHEMA_VERSION,
  audioTimelineV2Schema,
  type AudioContinuityPlan,
  type AudioStemPlan,
  type AudioTimelineV2,
  type TimelineClock,
  type TimelineClipAudio,
} from './types'

function normalizeString(value: string | null | undefined): string {
  return typeof value === 'string' ? value.trim() : ''
}

export function createTimelineClock(input: {
  readonly clips: readonly FinalRenderClipPlan[]
  readonly fpsNumerator: number
  readonly fpsDenominator: number
}): TimelineClock {
  if (!Number.isInteger(input.fpsNumerator) || input.fpsNumerator <= 0) {
    throw new Error('AUDIO_TIMELINE_FPS_NUMERATOR_INVALID')
  }
  if (!Number.isInteger(input.fpsDenominator) || input.fpsDenominator <= 0) {
    throw new Error('AUDIO_TIMELINE_FPS_DENOMINATOR_INVALID')
  }
  const totalSeconds = input.clips.reduce((total, clip) => total + clip.durationSeconds, 0)
  const totalFrames = Math.round((totalSeconds * input.fpsNumerator) / input.fpsDenominator)
  if (totalFrames <= 0) throw new Error('AUDIO_TIMELINE_TOTAL_FRAMES_INVALID')
  return {
    fpsNumerator: input.fpsNumerator,
    fpsDenominator: input.fpsDenominator,
    sampleRate: AUDIO_SAMPLE_RATE,
    totalFrames,
  }
}

export function buildTimelineClips(
  clips: readonly FinalRenderClipPlan[],
  clock: TimelineClock,
): readonly TimelineClipAudio[] {
  let cumulativeSeconds = 0
  let startFrame = 0
  return clips.map((clip, index) => {
    cumulativeSeconds += clip.durationSeconds
    const isLast = index === clips.length - 1
    const endFrameExclusive = isLast
      ? clock.totalFrames
      : Math.round((cumulativeSeconds * clock.fpsNumerator) / clock.fpsDenominator)
    if (endFrameExclusive <= startFrame) {
      throw new Error(`AUDIO_TIMELINE_CLIP_FRAME_RANGE_INVALID:${clip.order}`)
    }
    const timelineClip: TimelineClipAudio = {
      order: clip.order,
      sourceKind: clip.sourceKind,
      panelId: clip.panelId,
      groupId: clip.groupId ?? null,
      shotNumber: clip.shotNumber,
      shotNumbers: [...clip.shotNumbers],
      range: { startFrame, endFrameExclusive },
      visualSummary: normalizeString(clip.description) || null,
      soundDirection: normalizeString(clip.sound) || null,
    }
    startFrame = endFrameExclusive
    return timelineClip
  })
}

function createGeneratedStemPlan(role: 'ambience' | 'bgm', description: string): AudioStemPlan {
  const modelConfig = resolveDefaultAudioStemModelConfig(role)
  if (!modelConfig) throw new Error(`AUDIO_DESIGN_STEM_MODEL_NOT_CONFIGURED:${role}`)
  return {
    role,
    status: 'planned',
    provider: modelConfig.provider,
    modelId: modelConfig.modelId,
    modelKey: modelConfig.modelKey,
    generationKind: modelConfig.generationKind,
    description,
  }
}

export function createTimelineSignature(input: {
  readonly clips: readonly FinalRenderClipPlan[]
  readonly clock: TimelineClock
}): string {
  const payload = {
    clock: input.clock,
    clips: buildTimelineClips(input.clips, input.clock).map((clip) => ({
      order: clip.order,
      sourceKind: clip.sourceKind,
      panelId: clip.panelId,
      groupId: clip.groupId ?? null,
      shotNumbers: clip.shotNumbers,
      range: clip.range,
    })),
  }
  return createHash('sha256').update(JSON.stringify(payload)).digest('hex').slice(0, 24)
}

export function buildAudioTimelineV2(input: {
  readonly clips: readonly FinalRenderClipPlan[]
  readonly clock: TimelineClock
  readonly timelineSignature: string
  readonly continuityPlan: AudioContinuityPlan
}): AudioTimelineV2 {
  const parsed = audioTimelineV2Schema.safeParse({
    schemaVersion: AUDIO_TIMELINE_SCHEMA_VERSION,
    timelineSignature: input.timelineSignature,
    clock: input.clock,
    nativeAudioPolicy: {
      provider: 'video_model_native',
      dialogueAndActionPolicy: 'keep_native_dialogue_and_synchronized_actions',
      generatedPostRoles: ['ambience', 'bgm'],
      missingCriticalActionPolicy: 'fail_and_regenerate_video_segment',
    },
    clips: buildTimelineClips(input.clips, input.clock),
    soundWorlds: input.continuityPlan.soundWorlds,
    acousticTransitions: input.continuityPlan.acousticTransitions,
    nativeActionEvents: [],
    ambienceSources: input.continuityPlan.ambienceSources,
    scoreCues: input.continuityPlan.scoreCues,
    automationLanes: input.continuityPlan.automationLanes,
    stemPlan: [
      {
        role: 'native_video',
        status: 'generated',
        provider: null,
        modelId: null,
        modelKey: null,
        generationKind: 'native_reference',
        description: 'Native video audio is the authority for dialogue and synchronized physical action sounds.',
      },
      createGeneratedStemPlan('ambience', 'Continuous SoundWorld ambience generated by ElevenLabs with loop phase preserved across shots.'),
      createGeneratedStemPlan('bgm', 'Continuous instrumental score cues generated by Lyria after the frame timeline is locked.'),
    ],
  })
  if (!parsed.success) {
    const messages = parsed.error.issues.map((issue) => `${issue.path.join('.')}:${issue.message}`).join(',')
    throw new Error(`AUDIO_TIMELINE_V2_INVALID:${messages}`)
  }
  return parsed.data
}
