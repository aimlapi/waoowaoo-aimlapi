import { framesToSeconds, type AutomationLane, type TimelineClock } from './types'

function format(value: number): string {
  if (!Number.isFinite(value)) throw new Error('AUDIO_AUTOMATION_NUMBER_INVALID')
  return value.toFixed(6)
}

function interpolationExpression(input: {
  readonly progress: string
  readonly from: number
  readonly to: number
  readonly mode: AutomationLane['keyframes'][number]['interpolation']
}): string {
  const delta = input.to - input.from
  if (input.mode === 'linear') return `(${format(input.from)}+${format(delta)}*${input.progress})`
  if (input.mode === 'equal_power') {
    return `(${format(input.from)}+${format(delta)}*(sin(PI/2*${input.progress})*sin(PI/2*${input.progress})))`
  }
  return `(${format(input.from)}+${format(delta)}*(${input.progress}*${input.progress}*(3-2*${input.progress})))`
}

function laneExpression(lane: AutomationLane, clock: TimelineClock, timelineOffsetFrames: number): string {
  const first = lane.keyframes[0]
  const last = lane.keyframes[lane.keyframes.length - 1]
  if (!first || !last) throw new Error(`AUDIO_AUTOMATION_KEYFRAMES_REQUIRED:${lane.laneId}`)
  const firstTime = framesToSeconds(first.frame, clock)
  const timelineOffsetSeconds = framesToSeconds(timelineOffsetFrames, clock)
  const time = timelineOffsetSeconds === 0 ? 't' : `(t+${format(timelineOffsetSeconds)})`
  const postValue = lane.postBehavior === 'hold' ? last.value : 0
  let expression = format(postValue)

  for (let index = lane.keyframes.length - 2; index >= 0; index -= 1) {
    const from = lane.keyframes[index]
    const to = lane.keyframes[index + 1]
    if (!from || !to) throw new Error(`AUDIO_AUTOMATION_KEYFRAME_MISSING:${lane.laneId}:${index}`)
    const fromTime = framesToSeconds(from.frame, clock)
    const toTime = framesToSeconds(to.frame, clock)
    const progress = `((${time}-${format(fromTime)})/${format(toTime - fromTime)})`
    const interpolated = interpolationExpression({
      progress,
      from: from.value,
      to: to.value,
      mode: to.interpolation,
    })
    expression = `if(lt(${time},${format(toTime)}),${interpolated},${expression})`
  }
  return `if(lt(${time},${format(firstTime)}),0,${expression})`
}

export function buildGainAutomationVolumeFilter(input: {
  readonly baseVolume: number
  readonly lanes: readonly AutomationLane[]
  readonly clock: TimelineClock
  readonly timelineOffsetFrames?: number
}): string {
  if (!Number.isFinite(input.baseVolume) || input.baseVolume < 0 || input.baseVolume > 1) {
    throw new Error('AUDIO_AUTOMATION_BASE_VOLUME_INVALID')
  }
  if (input.lanes.length === 0) return `volume=${input.baseVolume.toFixed(6)}`
  const timelineOffsetFrames = input.timelineOffsetFrames ?? 0
  if (!Number.isInteger(timelineOffsetFrames) || timelineOffsetFrames < 0) {
    throw new Error('AUDIO_AUTOMATION_TIMELINE_OFFSET_INVALID')
  }
  const dbExpression = input.lanes
    .map((lane) => `(${laneExpression(lane, input.clock, timelineOffsetFrames)})`)
    .join('+')
  const volumeExpression = `${input.baseVolume.toFixed(6)}*pow(10,(${dbExpression})/20)`
  return `volume='${volumeExpression.replace(/,/g, '\\,')}':eval=frame`
}
