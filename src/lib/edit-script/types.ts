import { z } from 'zod'
import type { LocationSpatialProfileStatus } from '@/lib/location-spatial-profile/types'

export const EDIT_ASSET_KINDS = ['character', 'location'] as const
export type EditAssetKind = (typeof EDIT_ASSET_KINDS)[number]

export const EDIT_ASSET_STATUSES = ['pending', 'generating', 'completed', 'failed'] as const
export type EditAssetStatus = (typeof EDIT_ASSET_STATUSES)[number]

export const EDIT_SCRIPT_VIDEO_RATIOS = ['9:16', '16:9', '21:9'] as const
export type EditScriptVideoRatio = (typeof EDIT_SCRIPT_VIDEO_RATIOS)[number]

export const storyDevelopmentCharacterFunctionSchema = z.enum([
  'helper',
  'obstacle',
  'temptation',
  'mirror',
  'observer',
  'contrast',
  'pressure',
])

function normalizedComparableText(value: string): string {
  return value.replace(/\s+/g, '').toLowerCase()
}

export const storyDevelopmentPackageSchema = z.object({
  schemaVersion: z.literal(2),
  premise: z.string().trim().min(1),
  protagonist: z.object({
    name: z.string().trim().min(1),
    ageRange: z.string().trim().min(1),
    socialPosition: z.string().trim().min(1),
    externalState: z.string().trim().min(1),
    innerWound: z.string().trim().min(1),
    lie: z.string().trim().min(1),
    want: z.string().trim().min(1),
    need: z.string().trim().min(1),
  }),
  themeEngine: z.object({
    valueA: z.string().trim().min(1),
    valueB: z.string().trim().min(1),
    centralDramaticQuestion: z.string().trim().min(1),
    controllingIdea: z.string().trim().min(1),
  }),
  world: z.object({
    era: z.string().trim().min(1),
    region: z.string().trim().min(1),
    socialReality: z.string().trim().min(1),
    conflictFunction: z.string().trim().min(1),
  }),
  antagonistSystem: z.object({
    embodiedAntagonist: z.object({
      name: z.string().trim().min(1),
      socialPosition: z.string().trim().min(1),
      activeOpposition: z.string().trim().min(1),
    }),
    institutionalAntagonist: z.object({
      name: z.string().trim().min(1),
      rulesOrMechanism: z.string().trim().min(1),
      activeOpposition: z.string().trim().min(1),
    }),
    abstractAntagonist: z.object({
      name: z.string().trim().min(1),
      existentialThreat: z.string().trim().min(1),
      activeOpposition: z.string().trim().min(1),
    }),
  }),
  characterNetwork: z.array(z.object({
    name: z.string().trim().min(1),
    ageRange: z.string().trim().min(1),
    relationshipToProtagonist: z.string().trim().min(1),
    dramaticFunction: storyDevelopmentCharacterFunctionSchema,
    themePosition: z.string().trim().min(1),
    fateRepresentation: z.string().trim().min(1),
    questionToProtagonist: z.string().trim().min(1),
    desireInStory: z.string().trim().min(1),
    pressureApplied: z.string().trim().min(1),
  })).min(2).max(6),
  fateNetwork: z.array(z.object({
    label: z.enum(['Future A', 'Future B', 'Future C']),
    characterName: z.string().trim().min(1),
    lifePath: z.string().trim().min(1),
    gain: z.string().trim().min(1),
    ending: z.string().trim().min(1),
  })).length(3),
  pressureLadder: z.array(z.object({
    level: z.number().int().min(1),
    domain: z.enum(['career', 'relationship', 'identity', 'existence']),
    pressure: z.string().trim().min(1),
    escalation: z.string().trim().min(1),
  })).min(4),
  hardChoices: z.array(z.object({
    valueA: z.string().trim().min(1),
    valueB: z.string().trim().min(1),
    decision: z.string().trim().min(1),
    cost: z.string().trim().min(1),
  })).min(3),
  valueArc: z.object({
    openingBelief: z.string().trim().min(1),
    closingBelief: z.string().trim().min(1),
    openingValueState: z.string().trim().min(1),
    closingValueState: z.string().trim().min(1),
  }),
  storyExpansion: z.array(z.object({
    act: z.string().trim().min(1),
    goal: z.string().trim().min(1),
    pressure: z.string().trim().min(1),
    choice: z.string().trim().min(1),
    cost: z.string().trim().min(1),
    newValueState: z.string().trim().min(1),
  })).min(3),
  narrativeStructure: z.object({
    type: z.enum([
      'classic_three_act',
      'rashomon',
      'multi_strand_polyphony',
      'circular',
      'stream_of_consciousness',
      'fragmented_memory',
    ]),
    reason: z.string().trim().min(1),
    mapping: z.object({
      openingMovement: z.string().trim().min(1),
      developmentMovement: z.string().trim().min(1),
      endingMovement: z.string().trim().min(1),
    }),
  }),
  screenplayConstraints: z.object({
    sceneCount: z.string().trim().min(1),
    tone: z.string().trim().min(1),
    endingState: z.string().trim().min(1),
  }),
}).superRefine((value, context) => {
  if (normalizedComparableText(value.protagonist.want) === normalizedComparableText(value.protagonist.need)) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['protagonist', 'want'],
      message: 'Want and Need must be different.',
    })
  }
  if (normalizedComparableText(value.themeEngine.valueA) === normalizedComparableText(value.themeEngine.valueB)) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['themeEngine', 'valueA'],
      message: 'Value A and Value B must be different.',
    })
  }
  if (normalizedComparableText(value.valueArc.openingBelief) === normalizedComparableText(value.valueArc.closingBelief)) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['valueArc', 'openingBelief'],
      message: 'Opening Belief and Closing Belief must be different.',
    })
  }
  if (normalizedComparableText(value.valueArc.openingValueState) === normalizedComparableText(value.valueArc.closingValueState)) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['valueArc', 'openingValueState'],
      message: 'Opening Value State and Closing Value State must be different.',
    })
  }
  value.pressureLadder.forEach((step, index) => {
    if (step.level !== index + 1) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['pressureLadder', index, 'level'],
        message: 'Pressure ladder levels must start at 1 and increase by 1.',
      })
    }
  })
})

export type StoryDevelopmentPackage = z.infer<typeof storyDevelopmentPackageSchema>

export interface EditScreenplayPayload {
  readonly id: string
  readonly projectId: string
  readonly episodeId: string
  readonly userPrompt: string
  readonly styleBible: EditScriptStyleBible | null
  readonly storyDevelopment: StoryDevelopmentPackage | null
  readonly screenplayText: string
  readonly status: string
}

export interface EditScriptShot {
  readonly shotNumber: number
  readonly durationSec: number
  readonly visualAction: string
  readonly charactersAndScene: string
  readonly camera: string
  readonly videoPrompt: string
  readonly sound: string
}

export interface EditScriptVideoBlock {
  readonly kind: 'single' | 'group'
  readonly shotNumbers: readonly number[]
  readonly gridMode?: '2x2' | '3x3'
  readonly reason: string
  readonly prompt: string
}

export interface EditAssetRequirement {
  readonly id?: string
  readonly kind: EditAssetKind
  readonly name: string
  readonly description: string
  readonly voiceTimbreText?: string | null
  readonly shotNumbers: readonly number[]
  readonly status?: EditAssetStatus
  readonly targetId?: string | null
  readonly taskTargetType?: 'CharacterAppearance' | 'LocationImage' | null
  readonly taskTargetId?: string | null
  readonly errorMessage?: string | null
  readonly previewImageUrl?: string | null
  readonly spatialProfileJson?: unknown | null
  readonly spatialProfileStatus?: LocationSpatialProfileStatus | null
  readonly spatialProfileError?: string | null
  readonly spatialProfileAnalyzedAt?: string | Date | null
  readonly spatialProfileModel?: string | null
}

export interface EditScriptPayload {
  readonly id?: string
  readonly projectId?: string
  readonly episodeId?: string
  readonly userPrompt?: string
  readonly styleBible: EditScriptStyleBible | null
  readonly screenplayText?: string | null
  readonly title: string
  readonly logline?: string | null
  readonly durationSec: number
  readonly shotCount: number
  readonly status?: string
  readonly shots: readonly EditScriptShot[]
  readonly videoBlocks: readonly EditScriptVideoBlock[]
  readonly requirements: readonly EditAssetRequirement[]
}

export const editScriptShotSchema = z.object({
  shotNumber: z.number().int().positive(),
  durationSec: z.number().int().min(1).max(5),
  visualAction: z.string().trim().min(1),
  charactersAndScene: z.string().trim().min(1),
  camera: z.string().trim().min(1),
  videoPrompt: z.string().trim().min(1),
  sound: z.string().trim().min(1),
})

export const editScriptStructureShotSchema = editScriptShotSchema.omit({ videoPrompt: true })

export const editScriptCoreSchema = z.object({
  title: z.string().trim().min(1),
  logline: z.string().trim().optional().nullable(),
  durationSec: z.number().int().positive(),
  shots: z.array(editScriptShotSchema).min(1).max(60),
  videoBlocks: z.array(z.object({
    type: z.enum(['single', 'group']).optional(),
    kind: z.enum(['single', 'group']).optional(),
    shotNumbers: z.array(z.number().int().positive()).min(1).max(9),
    gridMode: z.enum(['2x2', '3x3']).optional(),
    reason: z.string().trim().min(1),
    prompt: z.string().trim().min(1),
  })).min(1).max(60),
})

export const editScriptStructureSchema = z.object({
  title: z.string().trim().min(1),
  logline: z.string().trim().optional().nullable(),
  durationSec: z.number().int().positive(),
  shots: z.array(editScriptStructureShotSchema).min(1).max(60),
  videoBlocks: z.array(z.object({
    type: z.enum(['single', 'group']).optional(),
    kind: z.enum(['single', 'group']).optional(),
    shotNumbers: z.array(z.number().int().positive()).min(1).max(9),
    gridMode: z.enum(['2x2', '3x3']).optional(),
    reason: z.string().trim().min(1),
  })).min(1).max(60),
})

export const editScriptVideoPromptSchema = z.object({
  shots: z.array(z.object({
    shotNumber: z.number().int().positive(),
    videoPrompt: z.string().trim().min(1),
  })).min(1).max(60),
  videoBlocks: z.array(z.object({
    shotNumbers: z.array(z.number().int().positive()).min(1).max(9),
    prompt: z.string().trim().min(1),
  })).min(1).max(60),
})

export const editScriptStylePolicySchema = z.object({
  visual: z.object({
    negativePrompt: z.string().trim().min(1),
    imageFilterPrompt: z.string().trim().min(1),
    lightingPrompt: z.string().trim().min(1),
    colorPrompt: z.string().trim().min(1),
    texturePrompt: z.string().trim().min(1),
    compositionPrompt: z.string().trim().min(1),
  }),
  camera: z.object({
    movementPrompt: z.string().trim().min(1),
    lensAndDepthPrompt: z.string().trim().min(1),
    videoRhythmPrompt: z.string().trim().min(1),
  }),
  sound: z.object({
    soundFilterPrompt: z.string().trim().min(1),
  }),
  hardBans: z.array(z.string().trim().min(1)).min(1),
})

export const editScriptStyleBibleSchema = z.object({
  styleBible: z.object({
    strategy: z.literal('style_bible'),
    styleSummary: z.string().trim().min(1),
    stylePolicy: editScriptStylePolicySchema,
  }),
})

export type EditScriptStyleBible = z.infer<typeof editScriptStyleBibleSchema>['styleBible']

export const editScriptVideoPromptBlockSchema = z.object({
  sourceVideoBlockIndex: z.number().int().min(0).max(59),
  shotNumbers: z.array(z.number().int().positive()).min(1).max(9),
  shots: z.array(z.object({
    shotNumber: z.number().int().positive(),
    videoPrompt: z.string().trim().min(1),
  })).min(1).max(9),
  videoBlock: z.object({
    shotNumbers: z.array(z.number().int().positive()).min(1).max(9),
    prompt: z.string().trim().min(1),
  }),
})

export const editScriptVideoBlockMergeSchema = z.object({
  shotNumbers: z.array(z.number().int().positive()).min(2).max(9),
  reason: z.string().trim().min(1),
  prompt: z.string().trim().min(1),
})

export const editScriptVideoBlockArrangementSchema = z.object({
  videoBlocks: z.array(z.object({
    blockIndex: z.number().int().min(0).max(59),
    shotNumbers: z.array(z.number().int().positive()).min(1).max(9),
    reason: z.string().trim().min(1),
    prompt: z.string().trim().min(1),
  })).min(1).max(60),
})

export type EditScriptVideoPromptBlockOutput = z.infer<typeof editScriptVideoPromptBlockSchema>
export type EditScriptVideoBlockMergeOutput = z.infer<typeof editScriptVideoBlockMergeSchema>
export type EditScriptVideoBlockArrangementOutput = z.infer<typeof editScriptVideoBlockArrangementSchema>

export const editAssetRequirementSchema = z.object({
  kind: z.enum(EDIT_ASSET_KINDS),
  name: z.string().trim().min(1),
  description: z.string().trim().min(1),
  voiceTimbreText: z.string().trim().min(1).optional().nullable(),
  shotNumbers: z.array(z.number().int().positive()).min(1),
}).superRefine((asset, context) => {
  const voiceTimbreText = asset.voiceTimbreText?.trim()
  if (asset.kind === 'character' && !voiceTimbreText) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['voiceTimbreText'],
      message: 'Character assets must include fixed voice timbre text.',
    })
  }
  if (asset.kind === 'location' && voiceTimbreText) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['voiceTimbreText'],
      message: 'Location assets must not include voice timbre text.',
    })
  }
})

export const editAssetExtractionSchema = z.object({
  assets: z.array(editAssetRequirementSchema).min(1).max(40),
})

export const createEditScriptRequestSchema = z.object({
  episodeId: z.string().trim().min(1),
  prompt: z.never().optional(),
  screenplayId: z.string().trim().min(1).optional(),
  videoRatio: z.enum(EDIT_SCRIPT_VIDEO_RATIOS).optional(),
})

export const createEditScreenplayRequestSchema = z.object({
  episodeId: z.string().trim().min(1),
  prompt: z.string().trim().min(1),
  videoRatio: z.enum(EDIT_SCRIPT_VIDEO_RATIOS).optional(),
})

export const getEditScreenplayRequestSchema = z.object({
  episodeId: z.string().trim().min(1),
})

export const getEditScriptRequestSchema = z.object({
  episodeId: z.string().trim().min(1),
})

export const updateEditScriptVideoBlockPromptRequestSchema = z.object({
  episodeId: z.string().trim().min(1),
  editScriptId: z.string().trim().min(1),
  blockIndex: z.number().int().min(0).max(59),
  prompt: z.string().trim().min(1),
})

export const mergeEditScriptVideoBlocksRequestSchema = z.object({
  operation: z.literal('mergeVideoBlocks'),
  episodeId: z.string().trim().min(1),
  editScriptId: z.string().trim().min(1),
  leftBlockIndex: z.number().int().min(0).max(58),
  rightBlockIndex: z.number().int().min(1).max(59),
})

export const arrangeEditScriptVideoBlocksRequestSchema = z.object({
  operation: z.literal('arrangeVideoBlocks'),
  episodeId: z.string().trim().min(1),
  editScriptId: z.string().trim().min(1),
  blocks: z.array(z.object({
    shotNumbers: z.array(z.number().int().positive()).min(1).max(9),
  })).min(1).max(60),
})

export const updateEditScriptAssetRequirementDescriptionRequestSchema = z.object({
  episodeId: z.string().trim().min(1),
  editScriptId: z.string().trim().min(1),
  requirementId: z.string().trim().min(1),
  description: z.string().trim().min(1),
})

export const generateEditAssetsRequestSchema = z.object({
  episodeId: z.string().trim().min(1),
  editScriptId: z.string().trim().min(1).optional(),
  requirementId: z.string().trim().min(1).optional(),
})

export const generateEditStoryboardRequestSchema = z.object({
  episodeId: z.string().trim().min(1),
  editScriptId: z.string().trim().min(1).optional(),
})
