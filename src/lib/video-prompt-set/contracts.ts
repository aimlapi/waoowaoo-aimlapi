import { z } from 'zod'

const requiredText = (max: number) => z.string().trim().min(1).max(max)
const textList = (maxItems: number, maxLength: number) => z.array(
  requiredText(maxLength),
).max(maxItems)

export const VIDEO_SHOT_SIZES = [
  'extreme_wide',
  'wide',
  'medium_wide',
  'medium',
  'medium_close',
  'close',
  'extreme_close',
  'insert',
] as const

export const VIDEO_CAMERA_ANGLES = [
  'eye_level',
  'high',
  'low',
  'overhead',
  'dutch',
  'over_shoulder',
  'profile',
  'point_of_view',
] as const

export const VIDEO_SUBJECT_PLACEMENTS = [
  'left_third',
  'center',
  'right_third',
  'foreground',
  'midground',
  'background',
] as const

export const VIDEO_SCREEN_DIRECTIONS = [
  'left_to_right',
  'right_to_left',
  'toward_camera',
  'away_from_camera',
  'stationary',
] as const

export const VIDEO_CAMERA_MOVEMENTS = [
  'locked',
  'pan',
  'tilt',
  'dolly',
  'track',
  'handheld',
  'crane',
  'zoom',
] as const

export const VIDEO_INCOMING_CUT_TYPES = [
  'hard_cut',
  'cut_on_action',
  'match_cut',
  'sound_bridge',
  'motivated_reveal',
] as const

export const videoPromptReferenceSchema = z.object({
  key: requiredText(300)
    .describe('Exact unique source-material label supplied to this Worker.'),
  mediaType: z.enum(['image', 'audio'])
    .describe('The real media channel of that source. Image and audio numbering are independent.'),
  purpose: requiredText(1_000)
    .describe('How this exact reference constrains identity, location, prop, or voice in this shot.'),
}).strict()

const continuityStateSchema = z.object({
  stateId: requiredText(120)
    .describe('Stable local state identity. A non-first entry stateId must equal the previous shot exit stateId.'),
  description: requiredText(4_000)
    .describe('Observable people, positions, direction, gaze, action progress, prop state, environment, and sound state.'),
}).strict()

export const videoPromptShotSchema = z.object({
  key: requiredText(160)
    .describe('Stable local identity for this independently generated one-shot video segment.'),
  durationSeconds: z.number().int().positive()
    .describe('Exact clip duration selected from productionContext.video.allowedSegmentDurationsSeconds.'),
  editRole: requiredText(2_000)
    .describe('What new information or emotion this shot contributes to the whole edit.'),
  entryState: continuityStateSchema,
  incomingCut: z.object({
    type: z.enum(VIDEO_INCOMING_CUT_TYPES),
    handoff: requiredText(2_000)
      .describe('How the previous exit becomes this entry through position, direction, eyeline, action result, sound, or graphic relation.'),
  }).strict().nullable()
    .describe('Null only for the first shot. Every later shot owns exactly one incoming edit relation.'),
  references: z.array(videoPromptReferenceSchema).min(1).max(64)
    .describe('Only exact source labels used by this shot. At least one image reference is required.'),
  camera: z.object({
    shotSize: z.enum(VIDEO_SHOT_SIZES),
    angle: z.enum(VIDEO_CAMERA_ANGLES),
    subjectPlacement: z.enum(VIDEO_SUBJECT_PLACEMENTS),
    screenDirection: z.enum(VIDEO_SCREEN_DIRECTIONS),
    movement: z.enum(VIDEO_CAMERA_MOVEMENTS),
    lensAndDepth: requiredText(2_000),
    gazeTarget: requiredText(1_000),
    composition: requiredText(3_000),
  }).strict(),
  action: z.object({
    beatId: requiredText(120)
      .describe('Unique action beat identity across the set. One physical action may occur in only one generated shot.'),
    description: requiredText(4_000),
    dialogue: requiredText(4_000).nullable(),
  }).strict(),
  exitState: continuityStateSchema,
  cutPoint: requiredText(2_000)
    .describe('The completed observable result on which this independently generated shot ends.'),
  sound: requiredText(4_000)
    .describe('Native synchronized dialogue, effects, ambience, silence boundary, and any justified bridge.'),
  prohibitions: textList(32, 1_000),
}).strict().superRefine((shot, context) => {
  if (!shot.references.some((reference) => reference.mediaType === 'image')) {
    context.addIssue({
      code: 'custom',
      message: 'VIDEO_SHOT_IMAGE_REFERENCE_REQUIRED',
      path: ['references'],
    })
  }
  const referenceKeys = shot.references.map((reference) => reference.key)
  if (new Set(referenceKeys).size !== referenceKeys.length) {
    context.addIssue({
      code: 'custom',
      message: 'VIDEO_SHOT_REFERENCE_DUPLICATE',
      path: ['references'],
    })
  }
})

export const videoPromptSetWorkerOutputSchema = z.object({
  kind: z.literal('video_prompt_set'),
  segments: z.array(videoPromptShotSchema).min(1).max(512)
    .describe('One segment is exactly one continuous camera shot and one provider generation. Internal cuts and fast-cut clusters are forbidden.'),
}).strict()

export type VideoPromptSetWorkerOutput = z.infer<typeof videoPromptSetWorkerOutputSchema>

export const compiledVideoPromptShotSchema = videoPromptShotSchema.extend({
  prompt: requiredText(30_000)
    .describe('Deterministic provider prompt compiled from the canonical shot contract.'),
  referenceKeys: textList(64, 300)
    .describe('Derived ordered source labels used to resolve exact media revisions.'),
}).strict()

export const videoPromptSetResourceSchema = z.object({
  kind: z.literal('video_prompt_set'),
  segments: z.array(compiledVideoPromptShotSchema).min(1).max(512),
}).strict()

export type VideoPromptSetResource = z.infer<typeof videoPromptSetResourceSchema>
