import { describe, expect, it } from 'vitest'
import {
  validateProductionLocationGroups,
  validateProductionSegments,
  validateSceneContinuityLoops,
  validateSegmentContinuityBibles,
  type PanelContinuityState,
  type ProductionLocationGroup,
  type ProductionSegment,
  type SceneContinuityLoop,
  type SegmentContinuityBible,
} from '@/lib/screenplay-storyboard/production-continuity'

const locations = [{ locationId: 'food-stall' }, { locationId: 'rental-room' }]
const characters = [{ name: '陈志国' }, { name: '老葛' }]
const props = [{ name: '手机' }, { name: '啤酒' }]

function productionLocation(input: Partial<ProductionLocationGroup> = {}): ProductionLocationGroup {
  return {
    productionLocationId: input.productionLocationId ?? 'food-stall',
    locationId: input.locationId ?? 'food-stall',
    stableSpatialFacts: input.stableSpatialFacts ?? ['入口、中心桌与投影幕布保持固定相对关系'],
    reusableAnchors: input.reusableAnchors ?? ['中心桌', '投影幕布'],
    stableSetDressing: input.stableSetDressing ?? ['红色塑料桌椅'],
    nonPersistentStateBans: input.nonPersistentStateBans ?? ['夜晚人群和桌面菜品不能跨剧作场景继承'],
  }
}

function segment(input: Partial<ProductionSegment> = {}): ProductionSegment {
  return {
    productionSegmentId: input.productionSegmentId ?? 'segment-001-001',
    order: input.order ?? 1,
    originalOrderKey: input.originalOrderKey ?? '001.001',
    screenplaySceneNumber: input.screenplaySceneNumber ?? 1,
    productionLocationId: input.productionLocationId ?? 'food-stall',
    locationId: input.locationId ?? 'food-stall',
    environment: input.environment ?? '夜晚揭幕战的大排档，人群密集',
    sourceText: input.sourceText ?? '陈志国被老葛按到桌边，周围人群看着世界杯直播。',
    characterNames: input.characterNames ?? ['陈志国', '老葛'],
    propNames: input.propNames ?? ['手机', '啤酒'],
  }
}

function panelContinuity(input: Partial<PanelContinuityState> = {}): PanelContinuityState {
  return {
    inheritedContinuity: input.inheritedContinuity ?? ['陈志国始终坐在靠墙能看出口的位置'],
    changedContinuity: input.changedContinuity ?? [],
    visibleContinuityElements: input.visibleContinuityElements ?? ['中心桌', '啤酒', '手机'],
    forbiddenDiscontinuity: input.forbiddenDiscontinuity ?? ['不得让人群突然消失'],
  }
}

function bible(input: Partial<SegmentContinuityBible> = {}): SegmentContinuityBible {
  return {
    productionSegmentId: input.productionSegmentId ?? 'segment-001-001',
    originalOrderKey: input.originalOrderKey ?? '001.001',
    screenplaySceneNumber: input.screenplaySceneNumber ?? 1,
    dramaticContext: input.dramaticContext ?? '老葛把志国拖入第一次下注',
    temporalState: input.temporalState ?? '夜晚揭幕战',
    atmosphereState: input.atmosphereState ?? '热闹拥挤但志国局促',
    crowdState: input.crowdState ?? '周围始终有看球人群',
    spatialContinuity: input.spatialContinuity ?? ['中心桌在画面主区域，幕布位于后方'],
    persistentSetState: input.persistentSetState ?? [
      { name: '中心桌', kind: 'set_dressing', continuityRule: '同一张桌贯穿本段，不得重置为另一张桌' },
      { name: '啤酒', kind: 'prop', continuityRule: '倒酒后持续留在桌面或人物手边' },
    ],
    characterContinuity: input.characterContinuity ?? [
      {
        characterName: '陈志国',
        initialPosition: '靠墙坐下',
        blockingArc: '从防备到被下注吸引，身体逐渐朝幕布和手机前倾',
        eyelineRules: ['防备时看出口', '下注时看手机', '比赛时看幕布'],
      },
    ],
    screenDirectionRules: input.screenDirectionRules ?? ['出口方向与幕布方向不可在同段内反转'],
    forbiddenChanges: input.forbiddenChanges ?? ['不得把世界杯海报发明成路牌或霓虹招牌'],
  }
}

function loop(input: Partial<SceneContinuityLoop> = {}): SceneContinuityLoop {
  return {
    productionSegmentId: input.productionSegmentId ?? 'segment-001-001',
    auditRound: input.auditRound ?? 1,
    checkedPanelNumbers: input.checkedPanelNumbers ?? [1, 2],
    checkedContinuityAxes: input.checkedContinuityAxes ?? ['space', 'character_blocking', 'eyeline', 'persistent_props'],
    detectedIssues: input.detectedIssues ?? [],
    repairActions: input.repairActions ?? [],
    locked: true,
  }
}

describe('production continuity storyboard contract', () => {
  it('keeps same production location grouped while requiring separate segment continuity bibles per screenplay scene', () => {
    const productionLocations = validateProductionLocationGroups({
      productionLocations: [productionLocation()],
      locations,
    })
    const productionSegments = validateProductionSegments({
      productionSegments: [
        segment(),
        segment({
          productionSegmentId: 'segment-003-002',
          order: 2,
          originalOrderKey: '003.002',
          screenplaySceneNumber: 3,
          environment: '傍晚大排档，老葛向志国讲盘口',
          sourceText: '傍晚，大排档。老葛用啤酒瓶和碟子在桌面摆出阵型。',
        }),
      ],
      productionLocations,
      locations,
      characters,
      props,
      panels: [
        {
          panelNumber: 1,
          productionSegmentId: 'segment-001-001',
          locationId: 'food-stall',
          shotType: '中景',
          characterNames: ['陈志国', '老葛'],
          propNames: ['手机', '啤酒'],
          omittedSceneAssets: [],
          panelContinuity: panelContinuity(),
        },
        {
          panelNumber: 2,
          productionSegmentId: 'segment-003-002',
          locationId: 'food-stall',
          shotType: '中景',
          characterNames: ['陈志国', '老葛'],
          propNames: ['手机', '啤酒'],
          omittedSceneAssets: [],
          panelContinuity: panelContinuity({
            inheritedContinuity: ['傍晚教学段的桌面阵型持续存在'],
            visibleContinuityElements: ['啤酒瓶阵型', '手机', '维修笔记本'],
          }),
        },
      ],
    })

    expect(productionSegments.map((item) => item.originalOrderKey)).toEqual(['001.001', '003.002'])
    expect(productionSegments[0].productionLocationId).toBe(productionSegments[1].productionLocationId)

    expect(() => validateSegmentContinuityBibles({
      productionSegments,
      segmentContinuityBibles: [bible()],
    })).toThrow('SCREENPLAY_STORYBOARD_SEGMENT_CONTINUITY_MISSING:segment-003-002')

    const bibles = validateSegmentContinuityBibles({
      productionSegments,
      segmentContinuityBibles: [
        bible(),
        bible({
          productionSegmentId: 'segment-003-002',
          originalOrderKey: '003.002',
          screenplaySceneNumber: 3,
          dramaticContext: '老葛把盘口逻辑包装成上岸方法',
          temporalState: '傍晚',
          atmosphereState: '比揭幕战更冷静的教学气氛',
          crowdState: '大排档有零散食客，不继承揭幕战爆满人群',
        }),
      ],
    })

    expect(bibles).toHaveLength(2)
  })

  it('requires scene continuity loop coverage for every panel inside each production segment', () => {
    const productionSegments = [
      segment(),
      segment({
        productionSegmentId: 'segment-002-001',
        order: 2,
        originalOrderKey: '002.001',
        screenplaySceneNumber: 2,
        productionLocationId: 'rental-room',
        locationId: 'rental-room',
        environment: '夜晚出租屋，红光照进床头',
        sourceText: '志国在出租屋里删除又重新下载博彩应用。',
        characterNames: ['陈志国'],
        propNames: ['手机'],
      }),
    ]
    const panelNumbersBySegment = new Map<string, readonly number[]>([
      ['segment-001-001', [1, 2]],
      ['segment-002-001', [3]],
    ])

    expect(() => validateSceneContinuityLoops({
      productionSegments,
      panelNumbersBySegment,
      loops: [loop({ checkedPanelNumbers: [1] }), loop({ productionSegmentId: 'segment-002-001', checkedPanelNumbers: [3] })],
    })).toThrow('SCREENPLAY_STORYBOARD_SCENE_CONTINUITY_LOOP_PANEL_COVERAGE_MISMATCH:segment-001-001')

    const loops = validateSceneContinuityLoops({
      productionSegments,
      panelNumbersBySegment,
      loops: [loop(), loop({ productionSegmentId: 'segment-002-001', checkedPanelNumbers: [3] })],
    })

    expect(loops.map((item) => item.productionSegmentId)).toEqual(['segment-001-001', 'segment-002-001'])
  })
})

