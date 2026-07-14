import { createHash } from 'node:crypto'
import { z } from 'zod'

const riskSchema = z.enum(['low', 'medium', 'high'])

const dialogueSchema = z.object({
  character: z.string().trim().min(1),
  line: z.string().trim().min(1),
  subtext: z.string().trim().min(1),
  repetition_risk: riskSchema,
  padding_risk: riskSchema,
}).strict()

const continuityAuditSchema = z.object({
  source_stage_06_status: z.literal('pass'),
  kernel_status: z.literal('pass'),
  repeated_line_count: z.literal(0),
  low_function_line_count: z.literal(0),
  continuity_break_count: z.literal(0),
  repair_note: z.string().trim().min(1),
}).strict()

const visualLookLockSchema = z.object({
  visualStyle: z.string().trim().min(1),
  chromaticity: z.number().min(0).max(1),
  luminanceContrast: z.number().min(0).max(1),
  spatialSubjectivity: z.number().min(0).max(1),
  cameraDynamics: z.number().min(0).max(1),
  toneCurve: z.string().trim().min(1),
  colorBehavior: z.string().trim().min(1),
  opticalFamily: z.string().trim().min(1),
  texture: z.string().trim().min(1),
  grain: z.string().trim().min(1),
  halation: z.string().trim().min(1),
}).strict()

export const kernelCompilerScriptSchema = z.object({
  stage: z.literal('kernel_compiler'),
  interaction_density_prior: z.object({
    interactionDensity: z.number().min(0).max(1),
    sourceStage00Value: z.number().min(0).max(1),
    definition: z.literal('creative_target_for_finished_wall_clock_active_speech_coverage_ratio'),
    targetSpokenCoverageRatio: z.number().min(0).max(1),
    targetNonSpeechCoverageRatio: z.number().min(0).max(1),
    aggregateSpeakerSecondsExcludedFromThisMetric: z.boolean(),
    runtimeEnforced: z.literal(false),
    overrideApplied: z.boolean(),
    overrideReason: z.string(),
    downstreamPolicy: z.string().trim().min(1),
  }).strict(),
  dialogue_timing_policy: z.object({
    runtime_enforced: z.literal(false),
    pre_render_estimation_forbidden: z.literal(true),
  }).strict(),
  dialogue_continuity_audit: z.object({
    status: z.literal('pass'),
    lineCount: z.number().int().min(0),
    failedKernelCount: z.literal(0),
    repeatedLineCount: z.literal(0),
    lowFunctionLineCount: z.literal(0),
    continuityBreakCount: z.literal(0),
    paddingDetected: z.literal(false),
    dialogueTimingEnforced: z.literal(false),
  }).strict(),
  micro_beat_kernels: z.array(z.object({
    kernel_id: z.string().trim().regex(/^K-\d{4}$/),
    sequence_id: z.string().trim().min(1),
    scene_id: z.string().trim().min(1),
    location_id: z.string().trim().min(1),
    location_name: z.string().trim().min(1),
    beat_index: z.number().int().positive(),
    dramatic_function: z.string().trim().min(1),
    action: z.string().trim().min(1),
    dialogue: z.array(dialogueSchema),
    dialogue_continuity_audit: continuityAuditSchema,
    beat_interaction_type: z.enum(['dialogue_exchange', 'nonverbal_action']),
    dialogue_density_prior: z.object({
      interaction_density: z.number().min(0).max(1),
      source_stage: z.string().trim().min(1),
      runtime_enforced: z.literal(false),
      policy: z.literal('creative_prior_only'),
    }).strict(),
    beat_frequency_compliance: z.object({
      kernel_runtime_sec: z.number().positive(),
      status: z.literal('pass'),
    }).strict(),
    generation_facing_visual: z.object({
      projectVisualLookLock: visualLookLockSchema,
      visualAdapterPayload: z.object({
        locationId: z.string().trim().min(1),
        multiSensoryTextControl: z.string().trim().min(1),
      }).strict(),
    }).strict(),
    generation_facing_audio: z.object({
      dynamicMixerBlueprint: z.string().trim().min(1),
      dialogueTimingEnforced: z.literal(false),
    }).strict(),
  }).strict()).min(1),
}).strict().superRefine((script, ctx) => {
  const kernelIds = new Set<string>()
  let dialogueCount = 0
  script.micro_beat_kernels.forEach((kernel, index) => {
    dialogueCount += kernel.dialogue.length
    if (kernelIds.has(kernel.kernel_id)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['micro_beat_kernels', index, 'kernel_id'],
        message: 'AUDIO_KERNEL_COMPILER_DUPLICATE_KERNEL_ID',
      })
    }
    kernelIds.add(kernel.kernel_id)
    if (kernel.beat_index !== index + 1) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['micro_beat_kernels', index, 'beat_index'],
        message: 'AUDIO_KERNEL_COMPILER_BEAT_ORDER_INVALID',
      })
    }
    if (kernel.generation_facing_visual.visualAdapterPayload.locationId !== kernel.location_id) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['micro_beat_kernels', index, 'generation_facing_visual', 'visualAdapterPayload', 'locationId'],
        message: 'AUDIO_KERNEL_COMPILER_LOCATION_ID_MISMATCH',
      })
    }
  })
  if (dialogueCount !== script.dialogue_continuity_audit.lineCount) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['dialogue_continuity_audit', 'lineCount'],
      message: 'AUDIO_KERNEL_COMPILER_DIALOGUE_COUNT_MISMATCH',
    })
  }
  const spoken = script.interaction_density_prior.targetSpokenCoverageRatio
  const nonSpeech = script.interaction_density_prior.targetNonSpeechCoverageRatio
  if (Math.abs(spoken + nonSpeech - 1) > 0.000_001) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['interaction_density_prior'],
      message: 'AUDIO_KERNEL_COMPILER_COVERAGE_RATIO_INVALID',
    })
  }
})

export type KernelCompilerScript = z.infer<typeof kernelCompilerScriptSchema>
export type KernelCompilerBeat = KernelCompilerScript['micro_beat_kernels'][number]

export function parseKernelCompilerScript(value: unknown): KernelCompilerScript {
  const parsed = kernelCompilerScriptSchema.safeParse(value)
  if (!parsed.success) {
    const issues = parsed.error.issues.map((issue) => `${issue.path.join('.')}:${issue.message}`).join(',')
    throw new Error(`AUDIO_KERNEL_COMPILER_INVALID:${issues}`)
  }
  return parsed.data
}

export function createKernelCompilerHash(script: KernelCompilerScript): string {
  return createHash('sha256').update(JSON.stringify(script)).digest('hex').slice(0, 24)
}

export function compactKernelCompilerForAudio(script: KernelCompilerScript) {
  return {
    interactionDensityPrior: script.interaction_density_prior.interactionDensity,
    kernels: script.micro_beat_kernels.map((kernel) => ({
      kernelId: kernel.kernel_id,
      sequenceId: kernel.sequence_id,
      sceneId: kernel.scene_id,
      locationId: kernel.location_id,
      locationName: kernel.location_name,
      beatIndex: kernel.beat_index,
      dramaticFunction: kernel.dramatic_function,
      action: kernel.action,
      dialogue: kernel.dialogue.map((line) => ({
        character: line.character,
        line: line.line,
        subtext: line.subtext,
      })),
      beatInteractionType: kernel.beat_interaction_type,
      dynamicMixerBlueprint: kernel.generation_facing_audio.dynamicMixerBlueprint,
    })),
  }
}
