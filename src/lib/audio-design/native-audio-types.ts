import { z } from 'zod'
import { AUDIO_SAMPLE_RATE, frameRangeSchema } from './types'

export const nativeAudioFrameFeatureSchema = z.object({
  frame: z.number().int().min(0),
  rmsDbfs: z.number().finite().max(0),
  peakDbfs: z.number().finite().max(0),
  crestDb: z.number().finite().min(0),
  zeroCrossingRate: z.number().min(0).max(1),
  active: z.boolean(),
  transient: z.boolean(),
})

export const nativeAudioActivityRangeSchema = z.object({
  range: frameRangeSchema,
  meanRmsDbfs: z.number().finite().max(0),
  peakDbfs: z.number().finite().max(0),
})

export const nativeAudioClipAnalysisSchema = z.object({
  order: z.number().int().positive(),
  range: frameRangeSchema,
  pcmHash: z.string().regex(/^[a-f0-9]{24}$/),
  activityThresholdDbfs: z.number().finite().max(0),
  frameFeatures: z.array(nativeAudioFrameFeatureSchema).min(1),
  activityRanges: z.array(nativeAudioActivityRangeSchema),
  transientFrames: z.array(z.number().int().min(0)),
})

export const nativeAudioAnalysisSchema = z.object({
  schemaVersion: z.literal(1),
  sampleRate: z.literal(AUDIO_SAMPLE_RATE),
  audioContentHash: z.string().regex(/^[a-f0-9]{24}$/),
  clips: z.array(nativeAudioClipAnalysisSchema).min(1),
})

export type NativeAudioFrameFeature = z.infer<typeof nativeAudioFrameFeatureSchema>
export type NativeAudioActivityRange = z.infer<typeof nativeAudioActivityRangeSchema>
export type NativeAudioClipAnalysis = z.infer<typeof nativeAudioClipAnalysisSchema>
export type NativeAudioAnalysis = z.infer<typeof nativeAudioAnalysisSchema>

export function compactNativeAudioForPrompt(analysis: NativeAudioAnalysis) {
  return {
    schemaVersion: analysis.schemaVersion,
    sampleRate: analysis.sampleRate,
    audioContentHash: analysis.audioContentHash,
    clips: analysis.clips.map((clip) => ({
      order: clip.order,
      range: clip.range,
      activityThresholdDbfs: clip.activityThresholdDbfs,
      activityRanges: clip.activityRanges,
      transientFrames: clip.transientFrames,
    })),
  }
}
