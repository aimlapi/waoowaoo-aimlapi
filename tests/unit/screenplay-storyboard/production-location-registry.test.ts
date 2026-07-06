import { describe, expect, it } from 'vitest'
import {
  normalizeDirectStoryboardOutputWithProductionLocationRegistry,
} from '@/lib/screenplay-storyboard/service'

const continuationContext = {
  existingPanelCount: 12,
  nextPanelNumber: 13,
  nextPanelIndex: 12,
  nextPanelGroupNumber: 3,
  nextSrtStart: 40,
  lastOriginalOrderKey: '002.001',
  lastScreenplaySceneNumber: 2,
  previousProductionLocations: [
    {
      productionLocationId: 'pl_chuzuwu',
      locationId: 'rental-room-old',
      stableSpatialFacts: ['窄小出租屋里窗户、单人床和木桌保持固定相对关系'],
      reusableAnchors: ['anchor_neon_window', 'anchor_wooden_bed', 'anchor_work_desk'],
      stableSetDressing: ['单人木床、旧木桌、床头柜'],
      nonPersistentStateBans: ['手机屏幕画面和墙上临时赛程表不能跨剧情段继承'],
    },
  ],
  previousProductionSegments: [
    {
      productionSegmentId: 'seg_scene2_chuzuwu',
      order: 2,
      originalOrderKey: '002.001',
      screenplaySceneNumber: 2,
      productionLocationId: 'pl_chuzuwu',
      locationId: 'rental-room-old',
      environment: '出租屋室内',
      sourceText: '窄小逼仄的出租屋，唯一的窗户正对楼下巨幅世界杯灯箱广告。',
      characterNames: ['陈志国'],
      propNames: [],
    },
  ],
  previousSceneZones: [
    {
      sceneZoneId: 'zone_chuzuwu_bed',
      locationId: 'rental-room-old',
      name: '出租屋单人床区域',
      overallPosition: '位于出租屋靠窗一侧的休息区域。',
      fixedAnchors: ['anchor_wooden_bed', 'anchor_neon_window'],
      spatialHardLocks: {
        anchorLayout: [
          '防盗网红光窗户固定在画面左侧后墙',
          '单人木床床头固定在画面右侧贴墙位置',
        ],
        screenDirectionLocks: ['窗外红光始终从画面左侧投向右侧床头和墙面'],
        depthLayoutLocks: ['床尾固定在画面左下前景，床头固定在画面右侧中后景'],
        cameraSideLocks: ['镜头始终位于靠镜头床沿这一侧拍摄'],
        subjectPlacementLocks: ['陈志国坐下和躺下都必须落在同一张单人木床的同一床轴上'],
        forbiddenSpatialChanges: ['不得交换床头和床尾'],
      },
    },
  ],
  productionLocationRegistry: [
    {
      productionLocationId: 'pl_chuzuwu',
      locationId: 'rental-room-old',
      locationName: '城中村出租屋',
      aliases: ['chuzuwu', '出租屋', '出租屋室内', '城中村出租屋'],
      stableSpatialFacts: ['窄小出租屋里窗户、单人床和木桌保持固定相对关系'],
      reusableAnchors: ['anchor_neon_window', 'anchor_wooden_bed', 'anchor_work_desk'],
      stableSetDressing: ['单人木床、旧木桌、床头柜'],
      nonPersistentStateBans: ['手机屏幕画面和墙上临时赛程表不能跨剧情段继承'],
      permanentSpatialLocks: {
        anchorLayout: [
          '防盗网红光窗户固定在画面左侧后墙',
          '单人木床床头固定在画面右侧贴墙位置',
        ],
        screenDirectionLocks: ['窗外红光始终从画面左侧投向右侧床头和墙面'],
        depthLayoutLocks: ['床尾固定在画面左下前景，床头固定在画面右侧中后景'],
        cameraSideLocks: ['镜头始终位于靠镜头床沿这一侧拍摄'],
        subjectPlacementLocks: [],
        forbiddenSpatialChanges: ['不得交换床头和床尾'],
      },
    },
  ],
} as const

const locations = [
  {
    locationId: 'rental-room-old',
    name: '城中村出租屋',
    summary: '陈志国长期居住的狭窄出租屋。',
    selectedImageId: null,
    imageUrl: null,
    imageDescription: null,
    spatialProfileJson: null,
    spatialProfileStatus: 'ready',
  },
  {
    locationId: 'rental-room-new',
    name: '出租屋',
    summary: '另一张出租屋资产。',
    selectedImageId: null,
    imageUrl: null,
    imageDescription: null,
    spatialProfileJson: null,
    spatialProfileStatus: 'ready',
  },
] as const

describe('production location registry normalization', () => {
  it('reuses the canonical production location and carries permanent room locks across append batches', () => {
    const normalized = normalizeDirectStoryboardOutputWithProductionLocationRegistry({
      continuationContext,
      locations,
      parsed: {
        productionLocations: [
          {
            productionLocationId: 'pl_chuzuwu_new',
            locationId: 'rental-room-new',
            stableSpatialFacts: ['狭窄出租屋内有木桌和赛程表墙'],
            reusableAnchors: ['anchor_desk_and_chair'],
            stableSetDressing: ['木桌、赛程表墙'],
            nonPersistentStateBans: ['赛程表属于当前阶段变化'],
          },
        ],
        productionSegments: [
          {
            productionSegmentId: 'seg_scene4_chuzuwu',
            order: 1,
            originalOrderKey: '004.002',
            screenplaySceneNumber: 4,
            productionLocationId: 'pl_chuzuwu_new',
            locationId: 'rental-room-new',
            environment: '出租屋室内',
            sourceText: '出租屋。志国推门进来，一整面墙贴满赛程表。',
            characterNames: ['陈志国'],
            propNames: [],
          },
        ],
        segmentContinuityBibles: [
          {
            productionSegmentId: 'seg_scene4_chuzuwu',
            originalOrderKey: '004.002',
            screenplaySceneNumber: 4,
            dramaticContext: '陈小雨发现赛程表墙',
            temporalState: '夜晚',
            atmosphereState: '压抑',
            crowdState: '无人',
            spatialContinuity: ['木桌和赛程表墙保持当前段连续'],
            persistentSetState: [{ name: '赛程表墙', kind: 'set_dressing', continuityRule: '当前段持续存在' }],
            characterContinuity: [
              {
                characterName: '陈志国',
                initialPosition: '站在墙前',
                blockingArc: '试图挡住赛程表',
                eyelineRules: ['看向陈小雨'],
              },
            ],
            screenDirectionRules: ['父女左右关系不反转'],
            forbiddenChanges: ['赛程表墙不得消失'],
          },
        ],
        sceneZones: [
          {
            sceneZoneId: 'zone_chuzuwu_zhuozi',
            locationId: 'rental-room-new',
            name: '出租屋木桌与赛程墙',
            overallPosition: '出租屋靠窗一侧的木桌及相邻墙面',
            fixedAnchors: ['anchor_desk_and_chair', 'anchor_window'],
            spatialHardLocks: {
              anchorLayout: ['木桌在画面下方，赛程表墙在木桌后方'],
              screenDirectionLocks: ['陈志国站在左侧'],
              depthLayoutLocks: ['前景为桌面，背景为赛程表墙'],
              cameraSideLocks: ['镜头站在床沿侧往木桌拍摄'],
              subjectPlacementLocks: ['陈志国背靠赛程表墙'],
              forbiddenSpatialChanges: ['赛程表墙不得移出画面'],
            },
          },
        ],
        panels: [
          {
            panelNumber: 1,
            productionSegmentId: 'seg_scene4_chuzuwu',
            sourceText: '出租屋。志国推门进来，一整面墙贴满赛程表。',
            description: '陈志国站在赛程表墙前。',
            locationId: 'rental-room-new',
            sceneZoneId: 'zone_chuzuwu_zhuozi',
            characters: ['陈志国'],
            props: [],
            omittedSceneAssets: [],
            shotType: '中景',
            cameraMove: '固定',
            duration: 4,
            shotBlocking: {
              sceneZoneId: 'zone_chuzuwu_zhuozi',
              subjectPosition: '陈志国在画面左侧',
              cameraPosition: '平视室内',
              screenComposition: '赛程表墙在背景',
              characterPlacements: [
                {
                  characterName: '陈志国',
                  subjectPosition: '画面左侧',
                  facing: '右侧',
                  eyeline: '陈小雨方向',
                },
              ],
            },
            panelContinuity: {
              inheritedContinuity: ['出租屋红光持续'],
              changedContinuity: ['新增赛程表墙'],
              visibleContinuityElements: ['赛程表墙'],
              forbiddenDiscontinuity: ['床窗关系不得改变'],
            },
          },
        ],
        panelGroups: [
          {
            groupNumber: 1,
            panelNumbers: [1],
            sceneZoneIds: ['zone_chuzuwu_zhuozi'],
            continuityRule: '出租屋木桌与赛程表墙连续',
          },
        ],
        sceneContinuityLoops: [
          {
            productionSegmentId: 'seg_scene4_chuzuwu',
            auditRound: 1,
            checkedPanelNumbers: [1],
            checkedContinuityAxes: ['space', 'character_blocking', 'eyeline'],
            detectedIssues: [],
            repairActions: [],
            locked: true,
          },
        ],
      },
    })

    expect(normalized.productionLocations).toHaveLength(1)
    expect(normalized.productionLocations[0]?.productionLocationId).toBe('pl_chuzuwu')
    expect(normalized.productionLocations[0]?.locationId).toBe('rental-room-old')
    expect(normalized.productionSegments[0]?.productionLocationId).toBe('pl_chuzuwu')
    expect(normalized.productionSegments[0]?.locationId).toBe('rental-room-old')
    expect(normalized.panels[0]?.locationId).toBe('rental-room-old')
    expect(normalized.sceneZones[0]?.locationId).toBe('rental-room-old')
    expect(normalized.sceneZones[0]?.spatialHardLocks.anchorLayout).toContain('单人木床床头固定在画面右侧贴墙位置')
    expect(normalized.sceneZones[0]?.spatialHardLocks.forbiddenSpatialChanges.join('\n')).toContain('不得违反同一制片场景长期空间锁')
  })
})
