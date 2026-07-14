import { buildGainAutomationVolumeFilter } from '@/lib/audio-design/automation'
import {
  frameToSample,
  framesToSeconds,
  type AcousticPerspective,
  type AcousticTransition,
  type AmbienceSource,
  type AutomationLane,
  type FrameRange,
  type TimelineClock,
} from '@/lib/audio-design/types'

export type FinalRenderAmbienceTrack = {
  readonly sourceId: string
  readonly sourceContinuityId: string
  readonly path: string
  readonly range: FrameRange
  readonly loop: boolean
  readonly crossfadeFrames: number
  readonly phaseOffsetFrames: number
  readonly role: AmbienceSource['role']
  readonly baseGainDb: number
  readonly salience: number
  readonly spectralRole: AmbienceSource['spectralRole']
  readonly foregroundPolicy: AmbienceSource['foregroundPolicy']
  readonly perspectives: readonly AcousticPerspective[]
  readonly transitions: readonly AcousticTransition[]
}

type AmbiencePerspectiveBranch = {
  readonly track: FinalRenderAmbienceTrack
  readonly perspective: AcousticPerspective
  readonly renderRange: FrameRange
  readonly incomingTransition?: AcousticTransition
  readonly outgoingTransition?: AcousticTransition
}

export const AMBIENCE_AUDIO_TARGET = {
  integratedLufs: -24,
  truePeakDb: -3,
  loudnessRange: 18,
} as const

function format(value: number): string {
  if (!Number.isFinite(value)) throw new Error('FINAL_VIDEO_RENDER_AUDIO_FILTER_NUMBER_INVALID')
  return value.toFixed(6)
}

function rangesOverlap(first: FrameRange, second: FrameRange): boolean {
  return first.startFrame < second.endFrameExclusive && second.startFrame < first.endFrameExclusive
}

function buildBranches(tracks: readonly FinalRenderAmbienceTrack[]): readonly AmbiencePerspectiveBranch[] {
  return tracks.flatMap((track) => {
    if (track.perspectives.length === 0) {
      throw new Error(`FINAL_VIDEO_RENDER_AMBIENCE_PERSPECTIVE_REQUIRED:${track.sourceId}`)
    }
    return track.perspectives
      .filter((perspective) => rangesOverlap(perspective.range, track.range))
      .map((perspective) => {
        const transitions = track.transitions.filter((transition) => (
          transition.sourceContinuityId === track.sourceContinuityId
          && rangesOverlap(transition.range, track.range)
        ))
        const incomingTransition = transitions.find((transition) => transition.toZoneId === perspective.zoneId)
        const outgoingTransition = transitions.find((transition) => transition.fromZoneId === perspective.zoneId)
        const startFrame = Math.max(
          track.range.startFrame,
          incomingTransition
            ? Math.min(perspective.range.startFrame, incomingTransition.range.startFrame)
            : perspective.range.startFrame,
        )
        const endFrameExclusive = Math.min(
          track.range.endFrameExclusive,
          outgoingTransition
            ? Math.max(perspective.range.endFrameExclusive, outgoingTransition.range.endFrameExclusive)
            : perspective.range.endFrameExclusive,
        )
        if (endFrameExclusive <= startFrame) {
          throw new Error(`FINAL_VIDEO_RENDER_AMBIENCE_PERSPECTIVE_RANGE_INVALID:${track.sourceId}:${perspective.perspectiveId}`)
        }
        return {
          track,
          perspective,
          renderRange: { startFrame, endFrameExclusive },
          ...(incomingTransition ? { incomingTransition } : {}),
          ...(outgoingTransition ? { outgoingTransition } : {}),
        }
      })
  })
}

function acousticFilters(perspective: AcousticPerspective): readonly string[] {
  const distanceGainDb = perspective.distance === 'near' ? 0 : perspective.distance === 'medium' ? -2.5 : -6
  const enclosureGainDb = perspective.enclosure === 'enclosed' ? -1 : perspective.enclosure === 'semi_open' ? -0.5 : 0
  const gainDb = distanceGainDb + enclosureGainDb - perspective.occlusion * 7
  const cutoffHz = Math.max(1_200, Math.min(
    20_000,
    20_000
      - perspective.occlusion * 14_000
      - (perspective.enclosure === 'enclosed' ? 2_500 : perspective.enclosure === 'semi_open' ? 1_000 : 0),
  ))
  const sideLevel = Math.max(0.2, Math.min(
    1,
    1
      - perspective.occlusion * 0.65
      - (perspective.enclosure === 'enclosed' ? 0.15 : perspective.enclosure === 'semi_open' ? 0.08 : 0)
      - (perspective.distance === 'far' ? 0.1 : 0),
  ))
  const filters = [
    `volume=${format(10 ** (gainDb / 20))}`,
    `lowpass=f=${format(cutoffHz)}`,
    `stereotools=mlev=1:slev=${format(sideLevel)}`,
  ]
  if (perspective.enclosure === 'enclosed') filters.push('aecho=0.8:0.35:35|65:0.18|0.10')
  if (perspective.enclosure === 'semi_open') filters.push('aecho=0.8:0.25:45:0.10')
  return filters
}

function buildBranchFilter(input: {
  readonly branch: AmbiencePerspectiveBranch
  readonly inputIndex: number
  readonly outputIndex: number
  readonly clock: TimelineClock
  readonly lanes: readonly AutomationLane[]
}): string {
  const { track, perspective, renderRange, incomingTransition, outgoingTransition } = input.branch
  const phaseFrames = track.phaseOffsetFrames + renderRange.startFrame - track.range.startFrame
  const startSample = frameToSample(renderRange.startFrame, input.clock)
  const durationSamples = frameToSample(renderRange.endFrameExclusive - renderRange.startFrame, input.clock)
  const phaseSample = frameToSample(phaseFrames, input.clock)
  const volume = buildGainAutomationVolumeFilter({
    baseVolume: 1,
    lanes: input.lanes,
    clock: input.clock,
    timelineOffsetFrames: renderRange.startFrame,
  })
  const fades: string[] = []
  if (incomingTransition) {
    const frames = incomingTransition.range.endFrameExclusive - incomingTransition.range.startFrame
    fades.push(`afade=t=in:st=0:d=${format(framesToSeconds(frames, input.clock))}:curve=qsin`)
  }
  if (outgoingTransition) {
    const startFrames = outgoingTransition.range.startFrame - renderRange.startFrame
    const frames = outgoingTransition.range.endFrameExclusive - outgoingTransition.range.startFrame
    fades.push(`afade=t=out:st=${format(framesToSeconds(startFrames, input.clock))}:d=${format(framesToSeconds(frames, input.clock))}:curve=qsin`)
  }
  return [
    `[${input.inputIndex}:a]atrim=start_sample=${phaseSample}:end_sample=${phaseSample + durationSamples},asetpts=PTS-STARTPTS`,
    ',aresample=48000,aformat=sample_fmts=fltp:channel_layouts=stereo',
    `,loudnorm=I=${format(AMBIENCE_AUDIO_TARGET.integratedLufs)}:TP=${format(AMBIENCE_AUDIO_TARGET.truePeakDb)}:LRA=${format(AMBIENCE_AUDIO_TARGET.loudnessRange)}`,
    `,volume=${format(10 ** (track.baseGainDb / 20))},${acousticFilters(perspective).join(',')},${volume}`,
    fades.length > 0 ? `,${fades.join(',')}` : '',
    `,adelay=${startSample}S:all=1[amb_${input.outputIndex}]`,
  ].join('')
}

export function buildFinalRenderAmbienceGraph(input: {
  readonly tracks: readonly FinalRenderAmbienceTrack[]
  readonly clock: TimelineClock
  readonly automationLanes: readonly AutomationLane[]
  readonly firstInputIndex: number
}): {
  readonly inputArgs: readonly string[]
  readonly filters: readonly string[]
  readonly outputLabels: readonly string[]
} {
  const transitionIds = new Set(input.tracks.flatMap((track) => (
    track.transitions.map((transition) => transition.transitionId)
  )))
  const duplicateLane = input.automationLanes.find((lane) => (
    lane.targetBus === 'ambience'
    && lane.sourceEventId !== null
    && lane.sourceEventId !== undefined
    && transitionIds.has(lane.sourceEventId)
  ))
  if (duplicateLane) {
    throw new Error(`FINAL_VIDEO_RENDER_AMBIENCE_TRANSITION_AUTOMATION_DUPLICATED:${duplicateLane.laneId}`)
  }
  const branches = buildBranches(input.tracks)
  return {
    inputArgs: branches.flatMap((branch) => branch.track.loop
      ? ['-stream_loop', '-1', '-i', branch.track.path]
      : ['-i', branch.track.path]),
    filters: branches.map((branch, index) => buildBranchFilter({
      branch,
      inputIndex: input.firstInputIndex + index,
      outputIndex: index,
      clock: input.clock,
      lanes: input.automationLanes.filter((lane) => (
        lane.targetBus === 'ambience'
        && (lane.targetSourceId === null || lane.targetSourceId === undefined || lane.targetSourceId === branch.track.sourceId)
      )),
    })),
    outputLabels: branches.map((_, index) => `[amb_${index}]`),
  }
}
