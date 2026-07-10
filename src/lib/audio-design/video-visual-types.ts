import { z } from 'zod'

export const visualFrameObservationSchema = z.object({
  frame: z.number().int().min(0),
  location: z.string().trim().min(1),
  enclosure: z.enum(['open', 'semi_open', 'enclosed']),
  weather: z.string().trim().min(1).optional().nullable(),
  persistentEnvironment: z.array(z.string().trim().min(1)),
  activityLevel: z.number().min(0).max(1),
  suggestedScoreEnergy: z.number().min(0).max(1),
  description: z.string().trim().min(1),
})

export const videoVisualAnalysisSchema = z.object({
  schemaVersion: z.literal(1),
  sampleStepFrames: z.number().int().positive(),
  observations: z.array(visualFrameObservationSchema).min(1),
})

export type VideoVisualAnalysis = z.infer<typeof videoVisualAnalysisSchema>
