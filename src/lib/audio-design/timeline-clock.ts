import { z } from 'zod'

export const AUDIO_TIMELINE_SCHEMA_VERSION = 3 as const
export const AUDIO_SAMPLE_RATE = 48_000 as const

export const frameRangeSchema = z.object({
  startFrame: z.number().int().min(0),
  endFrameExclusive: z.number().int().positive(),
}).superRefine((range, ctx) => {
  if (range.endFrameExclusive <= range.startFrame) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['endFrameExclusive'],
      message: 'AUDIO_FRAME_RANGE_INVALID',
    })
  }
})

export const timelineClockSchema = z.object({
  fpsNumerator: z.number().int().positive().max(240_000),
  fpsDenominator: z.number().int().positive().max(10_000),
  sampleRate: z.literal(AUDIO_SAMPLE_RATE),
  totalFrames: z.number().int().positive(),
})

export type FrameRange = z.infer<typeof frameRangeSchema>
export type TimelineClock = z.infer<typeof timelineClockSchema>

export function framesToSeconds(frame: number, clock: TimelineClock): number {
  if (!Number.isInteger(frame) || frame < 0) throw new Error('AUDIO_FRAME_INVALID')
  return (frame * clock.fpsDenominator) / clock.fpsNumerator
}

export function secondsToFrames(seconds: number, clock: Pick<TimelineClock, 'fpsNumerator' | 'fpsDenominator'>): number {
  if (!Number.isFinite(seconds) || seconds < 0) throw new Error('AUDIO_SECONDS_INVALID')
  return Math.round((seconds * clock.fpsNumerator) / clock.fpsDenominator)
}

export function frameToSample(frame: number, clock: TimelineClock): number {
  if (!Number.isInteger(frame) || frame < 0) throw new Error('AUDIO_FRAME_INVALID')
  return Math.round((frame * clock.fpsDenominator * clock.sampleRate) / clock.fpsNumerator)
}
