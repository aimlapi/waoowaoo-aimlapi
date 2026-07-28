import { z } from 'zod'

export const CREATIVE_RENDER_MEDIA = [
  'photographic',
  'live_action',
  'two_dimensional_illustration',
  'three_dimensional_stylized',
  'stop_motion',
  'graphic_design',
  'mixed_media',
] as const

export const CREATIVE_REALISM_LEVELS = [
  'abstract',
  'highly_stylized',
  'stylized',
  'grounded_stylized',
  'photorealistic',
] as const

export const creativeDirectionVisualSchema = z.object({
  renderMedium: z.enum(CREATIVE_RENDER_MEDIA)
    .describe('The single canonical rendering medium shared by asset references and moving images.'),
  realismLevel: z.enum(CREATIVE_REALISM_LEVELS)
    .describe('The single canonical realism target. It may not be inferred later from genre or provider defaults.'),
  crossMediaStyle: z.string().trim().min(1)
    .describe('Executable shape, material, palette, line, surface, and finishing rules that must survive across asset images and video.'),
  visualStyle: z.string().trim().min(1),
  assetImageStyle: z.object({
    lighting: z.string().trim().min(1),
    texture: z.string().trim().min(1),
    renderingRules: z.string().trim().min(1)
      .describe('Asset-reference-specific rendering rules that preserve renderMedium, realismLevel, and crossMediaStyle.'),
  }).strict(),
}).strict()

export const creativeDirectionSchema = z.object({
  styleSummary: z.string().trim().min(1),
  rawUserStyle: z.string().trim().nullable(),
  visual: creativeDirectionVisualSchema,
  narrative: z.string().trim().min(1),
  directing: z.string().trim().min(1),
  editing: z.string().trim().min(1),
  sound: z.string().trim().min(1),
  assetPolicy: z.string().trim().min(1),
}).strict()

export type CreativeDirection = z.infer<typeof creativeDirectionSchema>

export const injectedCreativeDirectionSchema = z.object({
  revisionId: z.string().trim().min(1),
  direction: creativeDirectionSchema,
}).strict()

export type InjectedCreativeDirection = z.infer<typeof injectedCreativeDirectionSchema>
