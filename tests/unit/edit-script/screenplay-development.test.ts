import { describe, expect, it } from 'vitest'
import {
  assertSceneLayerSceneCount,
  beatLayerPackageSchema,
  buildInteractionLayerPackageFromBeatLayer,
  screenplaySkeletonPackageSchema,
  type SceneLayerPackage,
} from '@/lib/edit-script/screenplay-development'

function buildSceneLayerPackage(sceneCount: number): SceneLayerPackage {
  return {
    sceneLayer: Array.from({ length: sceneCount }, (_, index) => ({
      sceneNumber: index + 1,
      sceneGoal: `目标${String(index + 1)}`,
      sceneAntagonist: `阻碍${String(index + 1)}`,
      outcome: `结果${String(index + 1)}`,
      turningPoint: `转折${String(index + 1)}`,
      relationshipState: {
        primaryPair: '富家 / 穷家',
        stage: '陌生冲突',
        socialDistance: '完全陌生',
        trustLevel: '无信任',
        powerBalance: '富家掌握信息',
        knowledgeAsymmetry: '穷家不知道抱错真相',
        allowedAddressMode: '姓名称呼',
        forbiddenRelationshipLeap: '不得突然像熟人',
        relationshipTurn: '从陌生转向警惕',
      },
    })),
  }
}

function buildValidSkeleton() {
  return {
    screenplaySkeleton: {
      storyCoreEngine: {
        incitingIncident: '富家母亲收到医院旧档案袋和亲子鉴定报告。',
        globalGoal: '我要夺回孩子',
        dramaticProblem: '夺回孩子会摧毁两个家庭已经建立的亲情秩序。',
        protagonistWound: '她相信血缘比养育更真实。',
        gearLock: {},
      },
      storyOriginDiagnosis: {
        originDerivationChain: {
          derivedExternalValueOpposition: {
            valueA: '富贵',
            valueB: '贫穷',
            oppositionTest: '角色不能同时占有富贵生活和贫穷生活。',
          },
          derivedInternalValueOpposition: {
            valueC: '束缚',
            valueD: '自由',
            mutualExclusionTest: '她不能同时控制孩子归属又尊重孩子自由。',
            valuePairingRule: {
              pairAC: '富贵+束缚',
              pairBD: '贫穷+自由',
              acPositiveNegativeMix: '富贵为正，束缚为负。',
              bdPositiveNegativeMix: '贫穷为负，自由为正。',
              forbiddenPairing: '禁止写成富贵+自由与贫穷+束缚。',
            },
          },
          protagonistInference: {
            wound: '她相信血缘比养育更真实。',
          },
        },
      },
      storyStructureBlueprint: {
        coreValueAndStoryTriangle: {
          valueSpectrumAndDualOppositions: {
            externalValueOpposition: {
              valueA: '富贵',
              valueB: '贫穷',
              oppositionTest: '角色不能同时占有富贵生活和贫穷生活。',
            },
            internalValueOpposition: {
              valueC: '束缚',
              valueD: '自由',
              mutualExclusionTest: '她不能同时控制孩子归属又尊重孩子自由。',
              valuePairingRule: {
                pairAC: '富贵+束缚',
                pairBD: '贫穷+自由',
                acPositiveNegativeMix: '富贵为正，束缚为负。',
                bdPositiveNegativeMix: '贫穷为负，自由为正。',
                forbiddenPairing: '禁止写成富贵+自由与贫穷+束缚。',
              },
            },
          },
        },
      },
    },
  }
}

describe('screenplay development layers', () => {
  it('accepts short value terms and a short global goal phrase', () => {
    expect(() => screenplaySkeletonPackageSchema.parse(buildValidSkeleton())).not.toThrow()
  })

  it('rejects scene-level fields in screenplay skeleton', () => {
    const value = buildValidSkeleton()
    expect(() => screenplaySkeletonPackageSchema.parse({
      screenplaySkeleton: {
        ...value.screenplaySkeleton,
        sceneSkeleton: [],
      },
    })).toThrow('Screenplay Skeleton Layer must not contain scene-level field')
  })

  it('rejects long descriptive global goals', () => {
    const value = buildValidSkeleton()
    value.screenplaySkeleton.storyCoreEngine.globalGoal = '我要在午夜之前通过律师和医院证明孩子归属'

    expect(() => screenplaySkeletonPackageSchema.parse(value)).toThrow('globalGoal')
  })

  it('requires external value opposition and allows internal value opposition to be omitted', () => {
    const value = buildValidSkeleton()
    delete (value.screenplaySkeleton.storyOriginDiagnosis.originDerivationChain as Record<string, unknown>).derivedInternalValueOpposition
    delete (value.screenplaySkeleton.storyStructureBlueprint.coreValueAndStoryTriangle.valueSpectrumAndDualOppositions as Record<string, unknown>).internalValueOpposition

    expect(() => screenplaySkeletonPackageSchema.parse(value)).not.toThrow()

    delete (value.screenplaySkeleton.storyOriginDiagnosis.originDerivationChain as Record<string, unknown>).derivedExternalValueOpposition
    expect(() => screenplaySkeletonPackageSchema.parse(value)).toThrow()
  })

  it('rejects long or equal value terms', () => {
    const value = buildValidSkeleton()
    value.screenplaySkeleton.storyOriginDiagnosis.originDerivationChain.derivedExternalValueOpposition.valueA = '拥有非常复杂的上流社会生活'

    expect(() => screenplaySkeletonPackageSchema.parse(value)).toThrow('valueA')

    const equalValue = buildValidSkeleton()
    equalValue.screenplaySkeleton.storyOriginDiagnosis.originDerivationChain.derivedExternalValueOpposition.valueB = '富贵'
    expect(() => screenplaySkeletonPackageSchema.parse(equalValue)).toThrow('externalValueOpposition.valueA and valueB must be different')
  })

  it('validates scene count on Scene Layer instead of Skeleton Layer', () => {
    expect(() => assertSceneLayerSceneCount({
      sceneLayerPackage: buildSceneLayerPackage(1),
      durationTier: 'long',
    })).toThrow('EDIT_SCREENPLAY_SCENE_LAYER_SCENE_COUNT_INVALID:tier=long:min=4:max=6:target=4:actual=1')

    expect(() => assertSceneLayerSceneCount({
      sceneLayerPackage: buildSceneLayerPackage(12),
      durationTier: 'fifteen_min',
    })).not.toThrow()
  })

  it('derives relationship constraints from beat relationship pressure', () => {
    const beatLayerPackage = beatLayerPackageSchema.parse({
      beatLayerPackage: {
        sceneBeatBlocks: [
          {
            sceneNumber: 1,
            beats: [
              {
                beatNumber: 1,
                sceneNumber: 1,
                action: { actor: '富家母亲', strategy: 'demand', intent: '递出报告' },
                reaction: { actor: '穷家父亲', strategy: 'refuse', intent: '推回报告' },
                actionReactionCouple: '要求 ↔ 拒绝',
                strategyChange: '富家母亲从确认真相改为索要孩子',
                informationChange: 'partial_reveal',
                subtextSeed: '她把血缘当成所有权。',
                valuePressure: {
                  externalPressure: '富贵压迫贫穷',
                  internalPressure: '束缚压迫自由',
                },
                relationshipPressure: {
                  currentStage: '陌生冲突',
                  pressureApplied: '报告把两个陌生家庭强行绑在一起',
                  trustMovement: '无信任',
                  powerMovement: '富家暂时占优',
                  distanceMovement: '陌生距离维持',
                  forbiddenLeapGuard: '不得突然像亲戚或熟人',
                },
                newCondition: '穷家第一次知道孩子可能被抱错',
              },
            ],
          },
        ],
      },
    }).beatLayerPackage

    const interaction = buildInteractionLayerPackageFromBeatLayer(beatLayerPackage).interactionLayerPackage.interactions[0]

    expect(interaction?.relationshipConstraint).toEqual({
      currentStage: '陌生冲突',
      allowedMovement: '信任变化：无信任；权力变化：富家暂时占优；距离变化：陌生距离维持',
      forbiddenLeapGuard: '不得突然像亲戚或熟人',
    })
  })
})
