import { createHash } from 'node:crypto'
import type { FinalRenderClipPlan } from '@/lib/video-compose/final-render-plan'
import { resolveDefaultAudioStemModelConfig } from './stem-model-config'
import {
  timelineAudioDesignSchema,
  type AmbienceCue,
  type AudioStemPlan,
  type DialogueCue,
  type DuckingSegment,
  type NativeDialogueSourceProvider,
  type SpotSfxCue,
  type TimelineAudioDesign,
  type TimelineClipAudio,
} from './types'

const DIALOGUE_DUCKING_VOLUME = 0.22
const CRITICAL_SFX_DUCKING_VOLUME = 0.48
const NATIVE_VIDEO_SOUND_DUCKING_VOLUME = 0.82

function normalizeString(value: string | null | undefined): string {
  return typeof value === 'string' ? value.trim() : ''
}

function clampTimelineEnd(value: number, durationSeconds: number): number {
  return Math.min(Math.max(value, 0), durationSeconds)
}

function hasExplicitSoundDirection(clip: FinalRenderClipPlan): boolean {
  return normalizeString(clip.sound).length > 0
}

function resolveShotNumberForCue(
  cueShotNumber: number,
  clips: readonly TimelineClipAudio[],
): TimelineClipAudio | null {
  return clips.find((clip) => clip.shotNumbers.includes(cueShotNumber)) ?? null
}

function resolveCueRange(input: {
  readonly cueStartSec?: number | null
  readonly cueEndSec?: number | null
  readonly cueDurationSec?: number | null
  readonly clip: TimelineClipAudio
  readonly durationSeconds: number
}): { readonly startSec: number; readonly endSec: number } {
  const clipStart = input.clip.startSec
  const clipEnd = input.clip.endSec
  const startSec = typeof input.cueStartSec === 'number'
    ? clampTimelineEnd(input.cueStartSec, input.durationSeconds)
    : clipStart
  const explicitEnd = typeof input.cueEndSec === 'number'
    ? input.cueEndSec
    : typeof input.cueDurationSec === 'number'
      ? startSec + input.cueDurationSec
      : clipEnd
  const endSec = clampTimelineEnd(explicitEnd, input.durationSeconds)
  if (endSec <= startSec) {
    throw new Error('AUDIO_DESIGN_CUE_TIME_RANGE_INVALID')
  }
  return { startSec, endSec }
}

function buildTimelineClips(clips: readonly FinalRenderClipPlan[]): readonly TimelineClipAudio[] {
  let cursorSeconds = 0
  return clips.map((clip) => {
    const startSec = cursorSeconds
    cursorSeconds += clip.durationSeconds
    return {
      order: clip.order,
      sourceKind: clip.sourceKind,
      panelId: clip.panelId,
      groupId: clip.groupId ?? null,
      shotNumber: clip.shotNumber,
      shotNumbers: [...clip.shotNumbers],
      startSec,
      endSec: cursorSeconds,
      soundDirection: normalizeString(clip.sound) || null,
    }
  })
}

function buildNativeVideoSoundDucking(clips: readonly TimelineClipAudio[]): readonly DuckingSegment[] {
  return clips
    .filter((clip) => normalizeString(clip.soundDirection).length > 0)
    .map((clip) => ({
      startSec: clip.startSec,
      endSec: clip.endSec,
      bgmVolume: NATIVE_VIDEO_SOUND_DUCKING_VOLUME,
      reason: 'native_video_sound' as const,
      sourceId: `clip:${clip.order}`,
    }))
}

function buildDialogueDucking(input: {
  readonly dialogueCues: readonly DialogueCue[]
  readonly timelineClips: readonly TimelineClipAudio[]
  readonly durationSeconds: number
}): readonly DuckingSegment[] {
  return input.dialogueCues.map((cue) => {
    const clip = resolveShotNumberForCue(cue.shotNumber, input.timelineClips)
    if (!clip) throw new Error(`AUDIO_DESIGN_DIALOGUE_SHOT_NOT_IN_TIMELINE:${cue.shotNumber}`)
    const range = resolveCueRange({
      cueStartSec: cue.startSec,
      cueEndSec: cue.endSec,
      clip,
      durationSeconds: input.durationSeconds,
    })
    return {
      ...range,
      bgmVolume: DIALOGUE_DUCKING_VOLUME,
      reason: 'dialogue' as const,
      sourceId: cue.cueId,
    }
  })
}

function buildSpotSfxDucking(input: {
  readonly spotSfx: readonly SpotSfxCue[]
  readonly timelineClips: readonly TimelineClipAudio[]
  readonly durationSeconds: number
}): readonly DuckingSegment[] {
  return input.spotSfx
    .filter((cue) => cue.priority === 'critical')
    .map((cue) => {
      const clip = resolveShotNumberForCue(cue.shotNumber, input.timelineClips)
      if (!clip) throw new Error(`AUDIO_DESIGN_SFX_SHOT_NOT_IN_TIMELINE:${cue.shotNumber}`)
      const range = resolveCueRange({
        cueStartSec: cue.startSec,
        cueDurationSec: cue.durationSec,
        clip,
        durationSeconds: input.durationSeconds,
      })
      return {
        ...range,
        bgmVolume: CRITICAL_SFX_DUCKING_VOLUME,
        reason: 'critical_sfx' as const,
        sourceId: cue.cueId,
      }
    })
}

function sortDuckingProfile(segments: readonly DuckingSegment[]): readonly DuckingSegment[] {
  return [...segments].sort((left, right) => {
    if (left.startSec !== right.startSec) return left.startSec - right.startSec
    return left.bgmVolume - right.bgmVolume
  })
}

function buildAmbiencePlan(clips: readonly TimelineClipAudio[]): readonly AmbienceCue[] {
  return clips
    .filter((clip) => normalizeString(clip.soundDirection).length > 0)
    .map((clip) => ({
      cueId: `ambience:${clip.order}`,
      shotNumbers: clip.shotNumbers.length > 0 ? [...clip.shotNumbers] : [clip.order],
      description: clip.soundDirection ?? '',
      startSec: clip.startSec,
      endSec: clip.endSec,
    }))
}

function createGeneratedStemPlan(input: {
  readonly role: Exclude<AudioStemPlan['role'], 'native_video'>
  readonly status: AudioStemPlan['status']
  readonly description: string
}): AudioStemPlan {
  const modelConfig = resolveDefaultAudioStemModelConfig(input.role)
  if (!modelConfig) {
    throw new Error(`AUDIO_DESIGN_STEM_MODEL_NOT_CONFIGURED:${input.role}`)
  }
  return {
    role: input.role,
    status: input.status,
    provider: modelConfig.provider,
    modelId: modelConfig.modelId,
    modelKey: modelConfig.modelKey,
    generationKind: modelConfig.generationKind,
    description: input.description,
  }
}

export function createTimelineSignature(clips: readonly FinalRenderClipPlan[]): string {
  const payload = clips.map((clip) => ({
    order: clip.order,
    sourceKind: clip.sourceKind,
    panelId: clip.panelId,
    groupId: clip.groupId ?? null,
    shotNumbers: clip.shotNumbers,
    durationSeconds: clip.durationSeconds,
  }))
  return createHash('sha256').update(JSON.stringify(payload)).digest('hex').slice(0, 24)
}

export function buildTimelineAudioDesign(input: {
  readonly clips: readonly FinalRenderClipPlan[]
  readonly timelineSignature: string
  readonly durationSeconds: number
  readonly nativeDialogueProvider?: NativeDialogueSourceProvider
  readonly dialogueCues?: readonly DialogueCue[]
  readonly spotSfx?: readonly SpotSfxCue[]
}): TimelineAudioDesign {
  const timelineClips = buildTimelineClips(input.clips)
  const dialogueCues = input.dialogueCues ?? []
  const spotSfx = input.spotSfx ?? []
  const hasNativeSoundDirection = input.clips.some(hasExplicitSoundDirection)
  const duckingProfile = sortDuckingProfile([
    ...buildNativeVideoSoundDucking(timelineClips),
    ...buildDialogueDucking({
      dialogueCues,
      timelineClips,
      durationSeconds: input.durationSeconds,
    }),
    ...buildSpotSfxDucking({
      spotSfx,
      timelineClips,
      durationSeconds: input.durationSeconds,
    }),
  ])

  const parsed = timelineAudioDesignSchema.safeParse({
    schemaVersion: 1,
    timelineSignature: input.timelineSignature,
    durationSeconds: input.durationSeconds,
    nativeDialogueSource: {
      mode: 'native_video_dialogue',
      provider: input.nativeDialogueProvider ?? 'seedance_2_0',
      policy: 'keep_for_dialogue_and_lip_sync',
      description: 'Dialogue, vocal performance, and lip sync are authored by the upstream video model. The audio post module only adds non-dialogue Foley, spot SFX, ambience, and score.',
    },
    clips: timelineClips,
    stemPlan: [
      {
        role: 'native_video',
        status: 'generated',
        provider: null,
        modelId: null,
        modelKey: null,
        generationKind: 'native_reference',
        description: hasNativeSoundDirection
          ? 'Use generated video audio as native scene reference and ambience bed.'
          : 'Use generated video audio only when present as native scene reference.',
      },
      createGeneratedStemPlan({
        role: 'foley',
        status: 'planned',
        description: 'Video-locked action foley for footsteps, cloth, handling, and contact sounds. Timing must come from visual action events, not script-estimated seconds.',
      }),
      createGeneratedStemPlan({
        role: 'spot_sfx',
        status: spotSfx.length > 0 ? 'planned' : 'planned',
        description: 'Video-locked critical spot sound effects that must remain controllable at final mix time.',
      }),
      createGeneratedStemPlan({
        role: 'ambience',
        status: 'planned',
        description: 'Continuous scene ambience beds derived from shot-level sound direction.',
      }),
      createGeneratedStemPlan({
        role: 'bgm',
        status: 'planned',
        description: 'Continuous instrumental score generated after the final timeline is locked.',
      }),
    ],
    dialogueCues,
    spotSfxPlan: spotSfx,
    ambiencePlan: buildAmbiencePlan(timelineClips),
    duckingProfile,
  })
  if (!parsed.success) {
    throw new Error(`AUDIO_DESIGN_TIMELINE_INVALID:${parsed.error.issues.map((issue) => issue.message).join(',')}`)
  }
  return parsed.data
}
