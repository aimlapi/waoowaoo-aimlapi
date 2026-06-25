import { describe, expect, it } from 'vitest'
import {
  assertScreenplaySkeletonSceneCount,
  beatLayerPackageSchema,
  buildInteractionLayerPackageFromBeatLayer,
  type ScreenplaySkeleton,
} from '@/lib/edit-script/screenplay-development'

function buildScreenplaySkeleton(sceneCount: number): ScreenplaySkeleton {
  return {
    sceneSkeleton: Array.from({ length: sceneCount }, (_, index) => ({
      sceneNumber: index + 1,
      sceneGoal: `目标 ${String(index + 1)}`,
      sceneAntagonist: `阻碍 ${String(index + 1)}`,
      sceneOutcome: `结果 ${String(index + 1)}`,
    })),
  }
}

describe('screenplay development layers', () => {
  it('rejects a long-duration screenplay skeleton with only one scene', () => {
    expect(() => assertScreenplaySkeletonSceneCount({
      screenplaySkeleton: buildScreenplaySkeleton(1),
      durationTier: 'long',
    })).toThrow('EDIT_SCREENPLAY_SKELETON_SCENE_COUNT_INVALID:tier=long:min=4:max=6:target=4:actual=1')
  })

  it('accepts the target scene skeleton count for each duration tier', () => {
    expect(() => assertScreenplaySkeletonSceneCount({
      screenplaySkeleton: buildScreenplaySkeleton(2),
      durationTier: 'short',
    })).not.toThrow()
    expect(() => assertScreenplaySkeletonSceneCount({
      screenplaySkeleton: buildScreenplaySkeleton(3),
      durationTier: 'medium',
    })).not.toThrow()
    expect(() => assertScreenplaySkeletonSceneCount({
      screenplaySkeleton: buildScreenplaySkeleton(4),
      durationTier: 'long',
    })).not.toThrow()
  })

  it('derives dramatic interactions from beat action-reaction strategy instead of prompting a fallback layer', () => {
    const beatLayerPackage = beatLayerPackageSchema.parse({
      beatLayerPackage: {
        sceneBeatBlocks: [
          {
            sceneNumber: 1,
            beats: [
              {
                beatNumber: 1,
                sceneNumber: 1,
                action: {
                  actor: '父亲',
                  strategy: 'demand',
                  intent: '逼儿子交出信件',
                },
                reaction: {
                  actor: '儿子',
                  strategy: 'refuse',
                  intent: '保住母亲留下的线索',
                },
                actionReactionCouple: '父亲逼迫，儿子拒绝',
                strategyChange: '儿子从沉默改为公开拒绝',
                informationChange: 'partial_reveal',
                subtextSeed: '儿子已经知道父亲隐瞒了母亲的真实去向。',
                valuePressure: {
                  externalPressure: '信件可能被抢走',
                  internalPressure: '儿子第一次必须承认自己不再信任父亲',
                },
                newCondition: '父子关系从控制变成正面冲突',
              },
            ],
          },
        ],
      },
    }).beatLayerPackage

    const interactionLayerPackage = buildInteractionLayerPackageFromBeatLayer(beatLayerPackage)
    const interaction = interactionLayerPackage.interactionLayerPackage.interactions[0]

    expect(interaction).toEqual(expect.objectContaining({
      interactionNumber: 1,
      sceneNumber: 1,
      sourceBeatNumber: 1,
      dramaticFunction: 'control_information',
    }))
    expect(interaction?.spokenSurface).toEqual(expect.objectContaining({
      actionIntent: '逼儿子交出信件',
      reactionIntent: '保住母亲留下的线索',
    }))
    expect(interaction?.informationControl).toEqual(expect.objectContaining({
      informationChange: 'partial_reveal',
      shouldReveal: true,
      revealConstraint: '不得超出 Beat Layer informationChange 授权的信息量。',
    }))
    expect(interaction?.dialogueConstraint).toEqual(expect.objectContaining({
      forbidden: '不得另起冲突，不得直接说出 hiddenLayer.subtext，不得超出 informationControl.allowedDisclosure。',
    }))
  })

  it('fails explicitly when beat strategy is outside the supported strategy set', () => {
    const invalidBeatLayer = {
      beatLayerPackage: {
        sceneBeatBlocks: [
          {
            sceneNumber: 1,
            beats: [
              {
                beatNumber: 1,
                sceneNumber: 1,
                action: {
                  actor: '父亲',
                  strategy: 'explain_everything',
                  intent: '解释所有信息',
                },
                reaction: {
                  actor: '儿子',
                  strategy: 'refuse',
                  intent: '拒绝',
                },
                actionReactionCouple: '父亲解释，儿子拒绝',
                strategyChange: '关系没有推进',
                informationChange: 'none',
                valuePressure: {
                  externalPressure: '无',
                  internalPressure: '无',
                },
                newCondition: '无',
              },
            ],
          },
        ],
      },
    }

    expect(() => beatLayerPackageSchema.parse(invalidBeatLayer)).toThrow()
  })
})
