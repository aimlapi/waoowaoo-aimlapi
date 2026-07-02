import type { ShotScaleClass, StillFrame, StoryboardImageCompilerDiagnostic } from './types'

const WIDE_SHOT_MICRO_DETAIL_PATTERN = /(?:tear|tears|pupil|eyelash|wrist|bracelet|sweat|vein|spit|唾沫|眼泪|泪水|眼眶|瞳孔|睫毛|手腕|手镯|汗珠|青筋)/iu

export type ActionPerformanceLayerResult = {
  readonly stillFrame: StillFrame
  readonly readablePhysicalDetail: string
}

export function runActionPerformanceLayer(input: {
  readonly stillFrame: StillFrame
  readonly shotScale: ShotScaleClass
  readonly diagnostics: StoryboardImageCompilerDiagnostic[]
}): ActionPerformanceLayerResult {
  const emotion = removeWideShotMicroEmotion({
    emotion: input.stillFrame.emotion,
    shotScale: input.shotScale,
    diagnostics: input.diagnostics,
  })
  const stillFrame = {
    ...input.stillFrame,
    emotion,
  }
  return {
    stillFrame,
    readablePhysicalDetail: buildReadablePhysicalDetail({
      stillFrame,
      shotScale: input.shotScale,
    }),
  }
}

function removeWideShotMicroEmotion(input: {
  readonly emotion: string | null
  readonly shotScale: ShotScaleClass
  readonly diagnostics: StoryboardImageCompilerDiagnostic[]
}): string | null {
  if (input.shotScale !== 'wide') return input.emotion
  if (!input.emotion || !WIDE_SHOT_MICRO_DETAIL_PATTERN.test(input.emotion)) return input.emotion
  input.diagnostics.push({
    code: 'MICRO_DETAIL_REMOVED_FOR_WIDE_SHOT',
    message: 'Removed micro-expression or tiny prop detail from a wide shot emotion field.',
  })
  return null
}

function buildReadablePhysicalDetail(input: {
  readonly stillFrame: StillFrame
  readonly shotScale: ShotScaleClass
}): string {
  if (input.shotScale === 'wide') return 'Read emotion through posture, spacing, and silhouette.'
  if (input.shotScale === 'extreme_detail') return 'Read emotion through the single cropped physical detail.'
  if (input.stillFrame.emotion) return 'Use STILL_FRAME.emotion as the visible performance state.'
  if (input.stillFrame.action) return 'Use STILL_FRAME.action as the visible physical performance state.'
  return 'Read the dramatic state through visible body language.'
}
