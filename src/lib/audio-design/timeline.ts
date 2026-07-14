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
  type AutomationLane,
  type NativeActionEvent,
  type SoundPresenceSegment,
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
  const timelineClips = buildTimelineClips(input.clips, input.clock)
  const payload = {
    clock: input.clock,
    clips: input.clips.map((clip) => {
      const timelineClip = timelineClips.find((candidate) => candidate.order === clip.order)
      if (!timelineClip) throw new Error(`AUDIO_TIMELINE_CLIP_SIGNATURE_MISSING:${clip.order}`)
      return {
        order: timelineClip.order,
        sourceKind: timelineClip.sourceKind,
        panelId: timelineClip.panelId,
        groupId: timelineClip.groupId ?? null,
        shotNumbers: timelineClip.shotNumbers,
        source: clip.source,
        range: timelineClip.range,
      }
    }),
  }
  return createHash('sha256').update(JSON.stringify(payload)).digest('hex').slice(0, 24)
}

export function buildAudioTimelineV2(input: {
  readonly clips: readonly FinalRenderClipPlan[]
  readonly clock: TimelineClock
  readonly timelineSignature: string
  readonly continuityPlan: AudioContinuityPlan
  readonly nativeActionEvents: readonly NativeActionEvent[]
}): AudioTimelineV2 {
  const presenceAutomation = buildSoundPresenceAutomation(input.continuityPlan.soundPresence, input.clock)
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
    nativeActionEvents: input.nativeActionEvents,
    soundPresence: input.continuityPlan.soundPresence,
    ambienceSources: input.continuityPlan.ambienceSources,
    scoreCues: input.continuityPlan.scoreCues,
    automationLanes: [...input.continuityPlan.automationLanes, ...presenceAutomation],
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
      ...(input.continuityPlan.ambienceSources.length > 0
        ? [createGeneratedStemPlan('ambience', 'Continuous SoundWorld ambience generated by ElevenLabs with loop phase preserved across shots.')]
        : []),
      ...(input.continuityPlan.scoreCues.length > 0
        ? [createGeneratedStemPlan('bgm', 'Continuous instrumental score cues generated by Lyria after the frame timeline is locked.')]
        : []),
    ],
  })
  if (!parsed.success) {
    const messages = parsed.error.issues.map((issue) => `${issue.path.join('.')}:${issue.message}`).join(',')
    throw new Error(`AUDIO_TIMELINE_V2_INVALID:${messages}`)
  }
  return parsed.data
}

function modeUsesBus(mode: SoundPresenceSegment['mode'], bus: 'ambience' | 'score'): boolean {
  if (bus === 'ambience') return mode === 'ambience_only' || mode === 'ambience_and_score'
  return mode === 'score_only' || mode === 'ambience_and_score'
}

function buildPresenceLane(
  presence: readonly SoundPresenceSegment[],
  clock: TimelineClock,
  bus: 'ambience' | 'score',
): AutomationLane | null {
  const states = presence.map((segment) => modeUsesBus(segment.mode, bus))
  if (states.every((state) => state === states[0])) return null
  const values = new Map<number, number>()
  values.set(0, states[0] ? 0 : -60)
  for (let index = 1; index < presence.length; index += 1) {
    const previous = presence[index - 1]
    const current = presence[index]
    if (!previous || !current || states[index - 1] === states[index]) continue
    const transitionFrames = Math.max(previous.fadeOutFrames, current.fadeInFrames, 1)
    const startFrame = Math.max(previous.range.startFrame, current.range.startFrame - transitionFrames)
    values.set(startFrame, states[index - 1] ? 0 : -60)
    values.set(current.range.startFrame, states[index] ? 0 : -60)
  }
  values.set(clock.totalFrames - 1, states[states.length - 1] ? 0 : -60)
  const keyframes = [...values.entries()]
    .sort(([left], [right]) => left - right)
    .map(([frame, value]) => ({ frame, value, interpolation: 'smooth' as const }))
  if (keyframes.length < 2) return null
  return {
    laneId: `${bus}_sound_presence`,
    targetBus: bus,
    targetSourceId: null,
    parameter: 'gain_db',
    keyframes,
    postBehavior: 'hold',
    reason: `deterministic ${bus} audibility compiled from SoundPresencePlan`,
    sourceEventId: null,
  }
}

export function buildSoundPresenceAutomation(
  presence: readonly SoundPresenceSegment[],
  clock: TimelineClock,
): readonly AutomationLane[] {
  return [buildPresenceLane(presence, clock, 'ambience'), buildPresenceLane(presence, clock, 'score')]
    .filter((lane): lane is AutomationLane => lane !== null)
}
