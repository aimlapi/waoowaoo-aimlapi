import { describe, expect, it } from 'vitest'
import {
  beatLayerPackageSchema,
  buildInteractionLayerPackageFromBeatLayer,
  dialogueLayerPackageSchema,
  sceneLayerPackageSchema,
  screenplaySkeletonPackageSchema,
  type SceneLayerPackage,
} from '@/lib/edit-script/screenplay-development'

function buildSceneLayerPackage(locationTotal: number): SceneLayerPackage {
  return {
    sceneLayer: Array.from({ length: locationTotal }, (_, index) => ({
      sceneNumber: index + 1,
      sceneLocationKey: `INT|房间${String(index + 1)}|夜`,
      intExt: '内景',
      locationName: `房间${String(index + 1)}`,
      timeSpan: '夜',
      locationContinuity: `房间${String(index + 1)}是独立发生场景`,
      sceneGoal: `目标 ${String(index + 1)}`,
      sceneAntagonist: `阻碍 ${String(index + 1)}`,
      outcome: `结果 ${String(index + 1)}`,
      turningPoint: `转折 ${String(index + 1)}`,
      relationshipState: {
        primaryPair: '主角/阻碍者',
        stage: '陌生对抗',
        socialDistance: '互不信任的交易距离',
        trustLevel: '低信任',
        powerBalance: '阻碍者暂时占优',
        knowledgeAsymmetry: '主角不知道阻碍者真实目的',
        allowedAddressMode: '正式称呼',
        forbiddenRelationshipLeap: '禁止熟人式称呼和创伤自白',
        relationshipTurn: '本场只能从试探进入正面冲突',
      },
      dramaticPhases: [
        {
          phaseNumber: 1,
          sourceSequenceNumber: 1,
          phaseFunction: `阶段功能 ${String(index + 1)}`,
          phaseGoal: `阶段目标 ${String(index + 1)}`,
          phaseAntagonist: `阶段阻碍 ${String(index + 1)}`,
          phaseOutcome: `阶段结果 ${String(index + 1)}`,
          turningPoint: `阶段转折 ${String(index + 1)}`,
        },
      ],
    })),
  }
}

describe('screenplay development layers', () => {
  it('requires skeleton story engine and rejects scene-unit fields', () => {
    const skeleton = {
      storyCoreEngine: {
        incitingIncident: {
          event: '主角收到三天后必须交付样片的正式通知',
          beforeState: '主角还能逃避失败',
          afterState: '主角必须立刻行动',
          actTurn: '主角从逃避进入执行',
        },
        globalGoal: {
          objective: '在三天内交出一支可播放的样片',
          measurableTarget: '完成一支 60 秒样片',
          physicalProofOfSuccess: '导出并提交视频文件',
          deadlineOrConstraint: '三天后下午五点前',
        },
        dramaticProblem: {
          problem: '不交片就失去项目资格',
          whyItCannotBeIgnored: '项目资格会被当场取消',
          howItLocksWithIncitingIncidentAndGoal: '通知制造截止日期，截止日期迫使主角交片',
        },
        protagonistWound: {
          wound: '曾经公开交付失败',
          woundOrigin: '上一支样片在放映会上崩溃',
          defensiveBelief: '只要不交付就不会再次被羞辱',
          visibleBehavior: '反复检查素材却迟迟不导出',
        },
        gearLock: '通知触发截止日期，截止日期逼出交片目标，旧创伤解释主角为什么抗拒交付。',
      },
      storyOriginDiagnosis: {
        originDerivationChain: {
          derivedInternalValueOpposition: {
            valueA2: '承认自己需要交付',
            valueB2: '坚持不交付才安全',
            conflict: '主角不可能既承认必须交付，又相信不交付才安全。',
            mutualExclusionTest: '一旦主角按时交片，就已经否定了“不交付才安全”的信念。',
          },
          protagonistInference: {
            protagonistSeed: '害怕再次交付失败的创作者',
            wound: {
              wound: '曾经公开交付失败',
              woundOrigin: '上一支样片在放映会上崩溃',
              defensiveBelief: '只要不交付就不会再次被羞辱',
              visibleBehavior: '反复检查素材却迟迟不导出',
            },
            whatTheyWant: '避免再次被评价',
            whatTheyNeed: '完成一次真实交付',
          },
        },
      },
    }

    expect(() => screenplaySkeletonPackageSchema.parse({ screenplaySkeleton: skeleton })).not.toThrow()
    expect(() => screenplaySkeletonPackageSchema.parse({
      screenplaySkeleton: {
        ...skeleton,
        sceneSkeleton: [{ sceneNumber: 1 }],
      },
    })).toThrow('Scene-unit fields are owned by Scene Layer')
  })

  it('rejects repeated actual story location scenes instead of validating a target quota', () => {
    const sceneLayerPackage = buildSceneLayerPackage(2)
    expect(() => sceneLayerPackageSchema.parse({
      sceneLayerPackage: {
        ...sceneLayerPackage,
        sceneLayer: sceneLayerPackage.sceneLayer.map((scene) => ({
          ...scene,
          sceneLocationKey: 'INT|同一房间|夜',
          locationName: '同一房间',
          timeSpan: '夜',
        })),
      },
    })).toThrow('Duplicate story location scene key: INT|同一房间|夜')
  })

  it('rejects repeated actual story locations even when the model changes scene keys', () => {
    const sceneLayerPackage = buildSceneLayerPackage(2)
    expect(() => sceneLayerPackageSchema.parse({
      sceneLayerPackage: {
        ...sceneLayerPackage,
        sceneLayer: sceneLayerPackage.sceneLayer.map((scene, index) => ({
          ...scene,
          sceneLocationKey: `模型自造key-${String(index + 1)}`,
          intExt: '内景',
          locationName: '废弃造船厂空铁房',
          timeSpan: '夜',
        })),
      },
    })).toThrow('Duplicate actual story scene location and time: 内景/废弃造船厂空铁房/夜')
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
                action: { actor: '绑匪', strategy: 'demand', intent: '逼富豪付钱' },
                reaction: { actor: '富豪', strategy: 'ignore', intent: '继续擦杯子' },
                actionReactionCouple: '要求 ↔ 忽视',
                strategyChange: '绑匪从勒索改为试探富豪真实意图',
                informationChange: 'partial_reveal',
                subtextSeed: '富豪并不想救妻子。',
                valuePressure: {
                  externalPressure: '人质赎金谈判失败',
                  internalPressure: '绑匪发现自己的控制幻觉破裂',
                },
                relationshipPressure: {
                  currentStage: '第一次接触的勒索关系',
                  pressureApplied: '绑匪用赎金压迫富豪',
                  trustMovement: '无信任',
                  powerMovement: '富豪夺回心理优势',
                  distanceMovement: '陌生胁迫距离维持',
                  forbiddenLeapGuard: '禁止熟人式寒暄或互相信任',
                },
                newCondition: '绑匪发现赎金不是富豪软肋',
              },
            ],
          },
        ],
      },
    }).beatLayerPackage

    const interaction = buildInteractionLayerPackageFromBeatLayer(beatLayerPackage).interactionLayerPackage.interactions[0]
    expect(interaction?.relationshipConstraint).toEqual(expect.objectContaining({
      currentStage: '第一次接触的勒索关系',
      forbiddenLeapGuard: '禁止熟人式寒暄或互相信任',
    }))
  })

  it('requires dialogue beats to declare relationship execution', () => {
    expect(() => dialogueLayerPackageSchema.parse({
      dialogueLayer: [
        {
          sceneNumber: 1,
          dialogueBeats: [
            {
              beatNumber: 1,
              speakerName: '绑匪',
              dialogue: '钱准备好。',
              relationshipExecution: {
                relationshipStage: '第一次接触的勒索关系',
                socialDistanceFit: '保持陌生胁迫距离',
                disclosureLimitFit: '没有透露创伤或私密信息',
                intimacyLeapCheck: '未出现熟人称呼或信任表达',
              },
            },
          ],
        },
      ],
    })).not.toThrow()
  })
})
