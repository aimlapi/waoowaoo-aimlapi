import { z } from 'zod'
import { resolveEditFirstSceneCountSpec, type EditFirstDurationTier } from './duration-tier'

const jsonRecordSchema = z.object({}).catchall(z.unknown())

export const screenplaySkeletonPackageSchema = z.object({
  screenplaySkeleton: jsonRecordSchema.extend({
    sceneSkeleton: z.array(jsonRecordSchema.extend({
      sceneNumber: z.number().int().min(1),
      sceneGoal: z.string().trim().min(1).optional(),
      sceneAntagonist: z.string().trim().min(1).optional(),
      sceneOutcome: z.string().trim().min(1).optional(),
    })).min(1),
  }),
}).strict()

export const sequenceLayerPackageSchema = z.object({
  sequenceLayer: jsonRecordSchema.extend({
    sequences: z.array(jsonRecordSchema.extend({
      sequenceNumber: z.number().int().min(1),
    })).min(1),
  }),
}).strict()

export const valueSequenceLoopPackageSchema = z.object({
  valueSequenceLoop: jsonRecordSchema.extend({
    defaultLoopCount: z.literal(1),
    maxLoopCount: z.literal(2),
    noInfiniteLoop: z.literal(true),
    draftValueSwingSystem: jsonRecordSchema,
    draftRiskRewardSystem: jsonRecordSchema,
    draftSequenceSpine: z.array(jsonRecordSchema).min(1),
    auditRound1: jsonRecordSchema,
    repairRound1: jsonRecordSchema,
    lockedValueSwingSystem: jsonRecordSchema,
    lockedRiskRewardSystem: jsonRecordSchema,
    lockedSequenceSpine: z.array(jsonRecordSchema).min(1),
  }),
}).strict()

export const characterIdentityVoiceBiblePackageSchema = z.object({
  characterIdentityVoiceBible: jsonRecordSchema.extend({
    characterRoster: z.array(jsonRecordSchema.extend({
      characterName: z.string().trim().min(1),
      dramaticFunction: z.string().trim().min(1),
    })).min(1),
    mirroringMap: jsonRecordSchema,
    characterProfiles: z.array(jsonRecordSchema.extend({
      characterName: z.string().trim().min(1),
      identityProfile: jsonRecordSchema,
      tasteProfile: jsonRecordSchema,
      psychologicalProfile: jsonRecordSchema,
      behaviorProfile: jsonRecordSchema,
      voiceProfile: jsonRecordSchema,
      relationshipVoiceShifts: jsonRecordSchema,
    })).min(1),
  }),
}).strict()

export const sceneLayerPackageSchema = z.object({
  sceneLayerPackage: jsonRecordSchema.extend({
    sceneLayer: z.array(jsonRecordSchema.extend({
      sceneNumber: z.number().int().min(1),
      sceneGoal: z.string().trim().min(1),
      sceneAntagonist: z.string().trim().min(1),
      outcome: z.string().trim().min(1),
      turningPoint: z.string().trim().min(1),
    })).min(1),
  }),
}).strict()

export const beatStrategySchema = z.enum([
  'show',
  'mask',
  'concede',
  'force',
  'drop',
  'fight',
  'demand',
  'refuse',
  'blackmail',
  'threaten',
  'plead',
  'ignore',
  'probe',
  'evade',
  'confess',
  'deny',
  'lure',
  'expose',
  'bargain',
  'raise_cost',
  'humiliate',
  'defend',
  'soothe',
  'provoke',
  'submit',
  'seize_control',
])

export const beatInformationChangeSchema = z.enum([
  'setup',
  'payoff',
  'misdirect',
  'partial_reveal',
  'full_reveal',
  'none',
])

const beatActorSchema = z.object({
  actor: z.string().trim().min(1),
  strategy: beatStrategySchema,
  intent: z.string().trim().min(1),
}).strict()

const beatSchema = z.object({
  beatNumber: z.number().int().min(1),
  sceneNumber: z.number().int().min(1),
  action: beatActorSchema,
  reaction: beatActorSchema,
  actionReactionCouple: z.string().trim().min(1),
  strategyChange: z.string().trim().min(1),
  informationChange: beatInformationChangeSchema.optional(),
  subtextSeed: z.string().trim().min(1).optional(),
  valuePressure: z.object({
    externalPressure: z.string().trim().min(1),
    internalPressure: z.string().trim().min(1),
  }).strict(),
  newCondition: z.string().trim().min(1),
}).strict()

export const beatLayerPackageSchema = z.object({
  beatLayerPackage: jsonRecordSchema.extend({
    sceneBeatBlocks: z.array(jsonRecordSchema.extend({
      sceneNumber: z.number().int().min(1),
      beats: z.array(beatSchema).min(1),
    })).min(1),
  }),
}).strict()

const interactionSchema = z.object({
  interactionNumber: z.number().int().min(1),
  sceneNumber: z.number().int().min(1),
  sourceBeatNumber: z.number().int().min(1),
  dramaticFunction: z.enum(['control_information', 'intensify_conflict', 'reveal_subtext', 'shift_power', 'bridge_dialogue']),
  powerStatus: jsonRecordSchema,
  spokenSurface: jsonRecordSchema,
  hiddenLayer: jsonRecordSchema,
  subtextPlan: jsonRecordSchema,
  informationControl: jsonRecordSchema,
  dialogueTactics: jsonRecordSchema,
  behavioralExpression: jsonRecordSchema,
  microTurn: jsonRecordSchema,
  dialogueConstraint: jsonRecordSchema,
}).strict()

export const interactionLayerPackageSchema = z.object({
  interactionLayerPackage: z.object({
    interactions: z.array(interactionSchema).min(1),
  }).strict(),
}).strict()

export const dialogueLayerPackageSchema = z.object({
  dialogueLayer: z.array(jsonRecordSchema.extend({
    sceneNumber: z.number().int().min(1),
    dialogueBeats: z.array(jsonRecordSchema.extend({
      beatNumber: z.number().int().min(1),
      speakerName: z.string().trim().min(1),
      dialogue: z.string().trim().min(1),
    })).optional(),
  })).min(1),
}).strict()

export const structureLoopBatchPackageSchema = z.object({
  screenplaySkeleton: screenplaySkeletonPackageSchema.shape.screenplaySkeleton,
  valueSequenceLoop: valueSequenceLoopPackageSchema.shape.valueSequenceLoop,
  characterIdentityVoiceBible: characterIdentityVoiceBiblePackageSchema.shape.characterIdentityVoiceBible,
  sequenceLayer: sequenceLayerPackageSchema.shape.sequenceLayer,
}).strict()

export const dramaticBatchPackageSchema = z.object({
  sceneLayerPackage: sceneLayerPackageSchema.shape.sceneLayerPackage,
  beatLayerPackage: beatLayerPackageSchema.shape.beatLayerPackage,
}).strict()

export const expressionBatchPackageSchema = z.object({
  dialogueLayer: dialogueLayerPackageSchema.shape.dialogueLayer,
  screenplayText: z.string().trim().min(1),
}).strict()

export const screenplayDevelopmentDraftPackageSchema = z.object({
  schemaVersion: z.literal(10),
  developmentStage: z.enum([
    'screenplaySkeleton',
    'valueSequenceLoop',
    'characterIdentityVoiceBible',
    'sequenceLayer',
    'sceneLayer',
    'beatLayer',
    'dramaticInteractionLayer',
    'dialogueLayer',
  ]),
  screenplaySkeleton: screenplaySkeletonPackageSchema.shape.screenplaySkeleton.optional(),
  valueSequenceLoop: valueSequenceLoopPackageSchema.shape.valueSequenceLoop.optional(),
  characterIdentityVoiceBible: characterIdentityVoiceBiblePackageSchema.shape.characterIdentityVoiceBible.optional(),
  sequenceLayer: sequenceLayerPackageSchema.shape.sequenceLayer.optional(),
  sceneLayerPackage: sceneLayerPackageSchema.shape.sceneLayerPackage.optional(),
  beatLayerPackage: beatLayerPackageSchema.shape.beatLayerPackage.optional(),
  interactionLayerPackage: interactionLayerPackageSchema.shape.interactionLayerPackage.optional(),
  dialogueLayer: dialogueLayerPackageSchema.shape.dialogueLayer.optional(),
}).strict()

export const screenplayDevelopmentPackageSchema = z.object({
  schemaVersion: z.literal(10),
  screenplaySkeleton: screenplaySkeletonPackageSchema.shape.screenplaySkeleton,
  valueSequenceLoop: valueSequenceLoopPackageSchema.shape.valueSequenceLoop,
  characterIdentityVoiceBible: characterIdentityVoiceBiblePackageSchema.shape.characterIdentityVoiceBible,
  sequenceLayer: sequenceLayerPackageSchema.shape.sequenceLayer,
  sceneLayerPackage: sceneLayerPackageSchema.shape.sceneLayerPackage,
  beatLayerPackage: beatLayerPackageSchema.shape.beatLayerPackage,
  interactionLayerPackage: interactionLayerPackageSchema.shape.interactionLayerPackage,
  dialogueLayer: dialogueLayerPackageSchema.shape.dialogueLayer,
}).strict()

export type ScreenplaySkeleton = z.infer<typeof screenplaySkeletonPackageSchema>['screenplaySkeleton']
export type ValueSequenceLoop = z.infer<typeof valueSequenceLoopPackageSchema>['valueSequenceLoop']
export type CharacterIdentityVoiceBible = z.infer<typeof characterIdentityVoiceBiblePackageSchema>['characterIdentityVoiceBible']
export type SequenceLayer = z.infer<typeof sequenceLayerPackageSchema>['sequenceLayer']
export type SceneLayerPackage = z.infer<typeof sceneLayerPackageSchema>['sceneLayerPackage']
export type BeatLayerPackage = z.infer<typeof beatLayerPackageSchema>['beatLayerPackage']
export type InteractionLayerPackage = z.infer<typeof interactionLayerPackageSchema>
export type DialogueLayer = z.infer<typeof dialogueLayerPackageSchema>['dialogueLayer']
export type ScreenplayDevelopmentDraftPackage = z.infer<typeof screenplayDevelopmentDraftPackageSchema>
export type ScreenplayDevelopmentPackage = z.infer<typeof screenplayDevelopmentPackageSchema>
export type StructureLoopBatchPackage = z.infer<typeof structureLoopBatchPackageSchema>
export type DramaticBatchPackage = z.infer<typeof dramaticBatchPackageSchema>
export type ExpressionBatchPackage = z.infer<typeof expressionBatchPackageSchema>

export function assertScreenplaySkeletonSceneCount(input: {
  readonly screenplaySkeleton: ScreenplaySkeleton
  readonly durationTier: EditFirstDurationTier
}): void {
  const spec = resolveEditFirstSceneCountSpec(input.durationTier)
  const actualScenes = input.screenplaySkeleton.sceneSkeleton.length
  if (actualScenes >= spec.minScenes && actualScenes <= spec.maxScenes) return

  throw new Error([
    'EDIT_SCREENPLAY_SKELETON_SCENE_COUNT_INVALID',
    `tier=${spec.tier}`,
    `min=${String(spec.minScenes)}`,
    `max=${String(spec.maxScenes)}`,
    `target=${String(spec.targetScenes)}`,
    `actual=${String(actualScenes)}`,
  ].join(':'))
}

const STRATEGY_LABELS: Record<z.infer<typeof beatStrategySchema>, string> = {
  show: '表现',
  mask: '掩饰',
  concede: '让步',
  force: '逼迫',
  drop: '不争 / 隐忍',
  fight: '再争 / 反击',
  demand: '要求',
  refuse: '拒绝',
  blackmail: '勒索',
  threaten: '反威胁',
  plead: '哀求',
  ignore: '忽视',
  probe: '试探',
  evade: '回避',
  confess: '坦白',
  deny: '否认',
  lure: '诱导',
  expose: '拆穿',
  bargain: '交换',
  raise_cost: '抬价',
  humiliate: '羞辱',
  defend: '自保',
  soothe: '安抚',
  provoke: '激怒',
  submit: '服从',
  seize_control: '夺权',
}

function resolveDramaticFunction(input: {
  readonly actionStrategy: z.infer<typeof beatStrategySchema>
  readonly reactionStrategy: z.infer<typeof beatStrategySchema>
  readonly informationChange: z.infer<typeof beatInformationChangeSchema>
}) {
  if (input.informationChange !== 'none') return 'control_information'
  if (['force', 'demand', 'blackmail', 'threaten', 'humiliate', 'provoke'].includes(input.actionStrategy)) {
    return 'intensify_conflict'
  }
  if (input.actionStrategy === 'confess' || input.actionStrategy === 'expose') return 'reveal_subtext'
  if (['refuse', 'fight', 'seize_control'].includes(input.reactionStrategy)) return 'shift_power'
  return 'bridge_dialogue'
}

function buildAllowedDisclosure(informationChange: z.infer<typeof beatInformationChangeSchema>) {
  if (informationChange === 'none' || informationChange === 'setup') return '不释放新信息，只维持策略压力。'
  if (informationChange === 'payoff') return '允许回收已铺垫信息，但不得扩大到新的完整解释。'
  if (informationChange === 'misdirect') return '允许制造误导，但必须保留后续纠偏空间。'
  if (informationChange === 'partial_reveal') return '允许释放局部真相，但必须留下下一层问题。'
  return '允许完整揭示当前 beat 被授权的信息，不得提前越层剧透。'
}

export function buildInteractionLayerPackageFromBeatLayer(beatLayerPackage: BeatLayerPackage): InteractionLayerPackage {
  let interactionNumber = 1
  const interactions = beatLayerPackage.sceneBeatBlocks.flatMap((scene) => scene.beats.map((beat) => {
    const informationChange = beat.informationChange ?? 'none'
    const actionLabel = STRATEGY_LABELS[beat.action.strategy]
    const reactionLabel = STRATEGY_LABELS[beat.reaction.strategy]
    const subtext = beat.subtextSeed?.trim() || '未显露潜台词：由 action/reaction 策略对撞推导。'
    const currentInteractionNumber = interactionNumber
    interactionNumber += 1

    return {
      interactionNumber: currentInteractionNumber,
      sceneNumber: beat.sceneNumber,
      sourceBeatNumber: beat.beatNumber,
      dramaticFunction: resolveDramaticFunction({
        actionStrategy: beat.action.strategy,
        reactionStrategy: beat.reaction.strategy,
        informationChange,
      }),
      powerStatus: {
        dominantActor: beat.action.actor,
        pressuredActor: beat.reaction.actor,
        powerShift: `${beat.action.actor}以“${actionLabel}”推进，${beat.reaction.actor}以“${reactionLabel}”反制或承压。`,
      },
      spokenSurface: {
        surfaceTask: `${beat.action.actor}表面上要${beat.action.intent}，${beat.reaction.actor}表面上要${beat.reaction.intent}。`,
        actionIntent: beat.action.intent,
        reactionIntent: beat.reaction.intent,
      },
      hiddenLayer: {
        subtext,
        withheldMeaning: `不得直接说出：${subtext}`,
      },
      subtextPlan: {
        mustNotSay: subtext,
        indirectRoute: `通过“${actionLabel} ↔ ${reactionLabel}”的策略错位表达，不直接解释真实动机。`,
        pressurePoint: `${beat.valuePressure.externalPressure} / ${beat.valuePressure.internalPressure}`,
      },
      informationControl: {
        informationChange,
        shouldReveal: !['none', 'setup'].includes(informationChange),
        allowedDisclosure: buildAllowedDisclosure(informationChange),
        revealConstraint: '不得超出 Beat Layer informationChange 授权的信息量。',
      },
      dialogueTactics: {
        actionTactic: beat.action.strategy,
        reactionTactic: beat.reaction.strategy,
        tacticCollision: beat.actionReactionCouple,
      },
      behavioralExpression: {
        actionExpression: `${beat.action.actor}的表达要执行“${actionLabel}”，不得写具体动作或最终台词。`,
        reactionExpression: `${beat.reaction.actor}的表达要执行“${reactionLabel}”，不得写具体动作或最终台词。`,
        restraintRule: '只约束对白前的戏剧互动，不生成对白、动作、镜头或分镜。',
      },
      microTurn: {
        strategyChange: beat.strategyChange,
        newCondition: beat.newCondition,
      },
      dialogueConstraint: {
        allowed: 'Dialogue Layer 只能围绕 spokenSurface 的表层话题生成语义草稿。',
        forbidden: '不得另起冲突，不得直接说出 hiddenLayer.subtext，不得超出 informationControl.allowedDisclosure。',
        silenceRecommended: informationChange === 'none' && beat.action.strategy === 'drop',
      },
    }
  }))

  return interactionLayerPackageSchema.parse({
    interactionLayerPackage: {
      interactions,
    },
  })
}
