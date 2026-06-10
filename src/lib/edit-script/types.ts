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

export const sceneLayerSceneSchema = z.object({
  sceneNumber: z.number().int().min(1),
  sceneGoal: z.string().trim().min(1),
  obstacle: z.string().trim().min(1),
  tactic: z.string().trim().min(1),
  outcome: z.string().trim().min(1),
  valueShift: z.string().trim().min(1),
  themeConflict: z.object({
    valueA: z.string().trim().min(1),
    valueB: z.string().trim().min(1),
  }),
  sourceHardChoiceIndexes: z.array(z.number().int().min(1)).default([]),
})

export const valueSwingSchema = z.object({
  sceneNumber: z.number().int().min(1),
  currentValue: z.string().trim().min(1),
  swingDirection: z.string().trim().min(1),
  newValue: z.string().trim().min(1),
  magnitude: z.string().trim().min(1),
})

export const hardChoiceSceneMapSchema = z.object({
  hardChoiceIndex: z.number().int().min(1),
  sceneNumber: z.number().int().min(1),
  beatNumbers: z.array(z.number().int().min(1)).min(1),
  explicitCost: z.string().trim().min(1),
})

export const sceneLayerPackageSchema = z.object({
  sceneLayer: z.array(sceneLayerSceneSchema).min(1).max(24),
  valueSwingLayer: z.array(valueSwingSchema).min(1).max(24),
  hardChoiceSceneMap: z.array(hardChoiceSceneMapSchema).min(1),
}).superRefine((value, context) => {
  value.sceneLayer.forEach((scene, index) => {
    if (scene.sceneNumber !== index + 1) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['sceneLayer', index, 'sceneNumber'],
        message: 'Scene numbers must start at 1 and increase by 1.',
      })
    }
    if (normalizedComparableText(scene.themeConflict.valueA) === normalizedComparableText(scene.themeConflict.valueB)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['sceneLayer', index, 'themeConflict', 'valueA'],
        message: 'Scene theme conflict values must be mutually different.',
      })
    }
  })

  const sceneNumbers = new Set(value.sceneLayer.map((scene) => scene.sceneNumber))
  value.valueSwingLayer.forEach((swing, index) => {
    if (!sceneNumbers.has(swing.sceneNumber)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['valueSwingLayer', index, 'sceneNumber'],
        message: 'Value swing must reference an existing scene.',
      })
    }
  })

  value.hardChoiceSceneMap.forEach((mapping, index) => {
    if (!sceneNumbers.has(mapping.sceneNumber)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['hardChoiceSceneMap', index, 'sceneNumber'],
        message: 'Hard choice mapping must reference an existing scene.',
      })
    }
  })

  const firstMagnitude = value.valueSwingLayer[0]?.magnitude.length ?? 0
  const lastMagnitude = value.valueSwingLayer[value.valueSwingLayer.length - 1]?.magnitude.length ?? 0
  if (value.valueSwingLayer.length > 1 && lastMagnitude <= firstMagnitude) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['valueSwingLayer', value.valueSwingLayer.length - 1, 'magnitude'],
      message: 'Later value swings must have greater magnitude than early value swings.',
    })
  }
})

export const beatSchema = z.object({
  beatNumber: z.number().int().min(1),
  action: z.string().trim().min(1),
  reaction: z.string().trim().min(1),
  newSituation: z.string().trim().min(1),
})

export const beatLayerSceneSchema = z.object({
  sceneNumber: z.number().int().min(1),
  beats: z.array(beatSchema).min(2).max(16),
})

export const beatLayerPackageSchema = z.object({
  beatLayer: z.array(beatLayerSceneSchema).min(1).max(24),
}).superRefine((value, context) => {
  value.beatLayer.forEach((scene, sceneIndex) => {
    scene.beats.forEach((beat, beatIndex) => {
      if (beat.beatNumber !== beatIndex + 1) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['beatLayer', sceneIndex, 'beats', beatIndex, 'beatNumber'],
          message: 'Beat numbers must start at 1 inside each scene and increase by 1.',
        })
      }
    })
  })
})

export const dialogueBeatSchema = z.object({
  beatNumber: z.number().int().min(1),
  characterWant: z.string().trim().min(1),
  tactic: z.string().trim().min(1),
  subtext: z.string().trim().min(1),
  dialogue: z.string().trim().min(1),
  surfaceTopic: z.string().trim().min(1),
  realConflict: z.string().trim().min(1),
  dramaticPurpose: z.string().trim().min(1),
  naturalnessScore: z.number().min(0).max(10),
  conflictScore: z.number().min(0).max(10),
})

export const dialogueLayerSceneSchema = z.object({
  sceneNumber: z.number().int().min(1),
  dialogueBeats: z.array(dialogueBeatSchema).min(1).max(16),
})

export const dialogueLayerPackageSchema = z.object({
  dialogueLayer: z.array(dialogueLayerSceneSchema).min(1).max(24),
})

export const screenplayDevelopmentPackageSchema = z.object({
  schemaVersion: z.literal(3),
  storyDevelopment: storyDevelopmentPackageSchema,
  sceneLayer: z.array(sceneLayerSceneSchema).min(1).max(24),
  valueSwingLayer: z.array(valueSwingSchema).min(1).max(24),
  hardChoiceSceneMap: z.array(hardChoiceSceneMapSchema).min(1),
  beatLayer: z.array(beatLayerSceneSchema).min(1).max(24),
  dialogueLayer: z.array(dialogueLayerSceneSchema).min(1).max(24),
}).superRefine((value, context) => {
  const sceneNumbers = new Set(value.sceneLayer.map((scene) => scene.sceneNumber))
  value.beatLayer.forEach((scene, index) => {
    if (!sceneNumbers.has(scene.sceneNumber)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['beatLayer', index, 'sceneNumber'],
        message: 'Beat layer must reference an existing scene.',
      })
    }
  })
  value.dialogueLayer.forEach((scene, index) => {
    if (!sceneNumbers.has(scene.sceneNumber)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['dialogueLayer', index, 'sceneNumber'],
        message: 'Dialogue layer must reference an existing scene.',
      })
    }
  })
})

export const screenplayDevelopmentDraftPackageSchema = z.object({
  schemaVersion: z.literal(3),
  developmentStage: z.enum(['storyDevelopment', 'sceneLayer', 'beatLayer', 'dialogueLayer']),
  storyDevelopment: storyDevelopmentPackageSchema,
  sceneLayer: z.array(sceneLayerSceneSchema).min(1).max(24).optional(),
  valueSwingLayer: z.array(valueSwingSchema).min(1).max(24).optional(),
  hardChoiceSceneMap: z.array(hardChoiceSceneMapSchema).min(1).optional(),
  beatLayer: z.array(beatLayerSceneSchema).min(1).max(24).optional(),
  dialogueLayer: z.array(dialogueLayerSceneSchema).min(1).max(24).optional(),
}).superRefine((value, context) => {
  if (value.developmentStage === 'sceneLayer' && (!value.sceneLayer || !value.valueSwingLayer || !value.hardChoiceSceneMap)) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['developmentStage'],
      message: 'Scene layer draft must include sceneLayer, valueSwingLayer, and hardChoiceSceneMap.',
    })
  }
  if (value.developmentStage === 'beatLayer' && (!value.sceneLayer || !value.valueSwingLayer || !value.hardChoiceSceneMap || !value.beatLayer)) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['developmentStage'],
      message: 'Beat layer draft must include story, scene, value swing, hard choice map, and beat layers.',
    })
  }
  if (value.developmentStage === 'dialogueLayer' && (!value.sceneLayer || !value.valueSwingLayer || !value.hardChoiceSceneMap || !value.beatLayer || !value.dialogueLayer)) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['developmentStage'],
      message: 'Dialogue layer draft must include story, scene, value swing, hard choice map, beat, and dialogue layers.',
    })
  }

  const sceneNumbers = new Set(value.sceneLayer?.map((scene) => scene.sceneNumber) ?? [])
  value.beatLayer?.forEach((scene, index) => {
    if (!sceneNumbers.has(scene.sceneNumber)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['beatLayer', index, 'sceneNumber'],
        message: 'Beat layer must reference an existing scene.',
      })
    }
  })
  value.dialogueLayer?.forEach((scene, index) => {
    if (!sceneNumbers.has(scene.sceneNumber)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['dialogueLayer', index, 'sceneNumber'],
        message: 'Dialogue layer must reference an existing scene.',
      })
    }
  })
})

export type SceneLayerPackage = z.infer<typeof sceneLayerPackageSchema>
export type BeatLayerPackage = z.infer<typeof beatLayerPackageSchema>
export type DialogueLayerPackage = z.infer<typeof dialogueLayerPackageSchema>
export type ScreenplayDevelopmentPackage = z.infer<typeof screenplayDevelopmentPackageSchema>
export type ScreenplayDevelopmentDraftPackage = z.infer<typeof screenplayDevelopmentDraftPackageSchema>
export type EditScreenplayDevelopmentPayload = ScreenplayDevelopmentPackage | ScreenplayDevelopmentDraftPackage | StoryDevelopmentPackage

export interface EditScreenplayPayload {
  readonly id: string
  readonly projectId: string
  readonly episodeId: string
  readonly userPrompt: string
  readonly styleBible: EditScriptStyleBible | null
  readonly storyDevelopment: EditScreenplayDevelopmentPayload | null
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
