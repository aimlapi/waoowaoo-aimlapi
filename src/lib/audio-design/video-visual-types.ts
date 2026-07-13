import { z } from 'zod'

export const VISUAL_LOCATION_EVIDENCE_VALUES = ['observed', 'inferred', 'unknown'] as const
export const VISUAL_SCENE_CONTINUITY_VALUES = ['same_scene', 'new_scene', 'uncertain'] as const
export const VISUAL_TRANSITION_EVIDENCE_VALUES = [
  'continuous_action',
  'camera_cut_only',
  'background_out_of_frame',
  'visible_spatial_passage',
  'establishing_view_of_new_location',
  'time_discontinuity',
  'weather_discontinuity',
] as const

export const visualFrameObservationSchema = z.object({
  frame: z.number().int().min(0),
  location: z.string().trim().min(1),
  locationEvidence: z.enum(VISUAL_LOCATION_EVIDENCE_VALUES),
  locationConfidence: z.number().min(0).max(1),
  continuityWithPrevious: z.enum(VISUAL_SCENE_CONTINUITY_VALUES),
  transitionEvidence: z.array(z.enum(VISUAL_TRANSITION_EVIDENCE_VALUES)),
  enclosure: z.enum(['open', 'semi_open', 'enclosed']),
  weather: z.string().trim().min(1).optional().nullable(),
  persistentEnvironment: z.array(z.string().trim().min(1)),
  outOfFramePersistentEnvironment: z.array(z.string().trim().min(1)),
  activityLevel: z.number().min(0).max(1),
  suggestedScoreEnergy: z.number().min(0).max(1),
  description: z.string().trim().min(1),
})

export const videoVisualAnalysisSchema = z.object({
  schemaVersion: z.literal(2),
  sampleStepFrames: z.number().int().positive(),
  observations: z.array(visualFrameObservationSchema).min(1),
})

export type VideoVisualAnalysis = z.infer<typeof videoVisualAnalysisSchema>
