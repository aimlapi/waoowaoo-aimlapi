import { describe, expect, it } from 'vitest'
import {
  formatSceneZonesForStorage,
  validateSceneContinuity,
  type DirectShotBlocking,
  type SceneZone,
} from '@/lib/screenplay-storyboard/scene-continuity'

const locations = [{ locationId: 'rental-room', name: '出租屋' }]

function shotBlocking(sceneZoneId = 'zone-bed'): DirectShotBlocking {
  return {
    sceneZoneId,
    subjectPosition: '陈志国位于床沿或床面右侧活动区',
    cameraPosition: '镜头从床尾偏左方向看向床头',
    screenComposition: '窗户在画面左侧，床头在画面右侧',
    characterPlacements: [{
      characterName: '陈志国',
      subjectPosition: '画面右侧床头附近',
      facing: '朝向手机或背对窗户红光',
      eyeline: '看向手中手机或枕头方向',
    }],
  }
}

function sceneZone(input: Partial<SceneZone> = {}): SceneZone {
  return {
    sceneZoneId: input.sceneZoneId ?? 'zone-bed',
    locationId: input.locationId ?? 'rental-room',
    name: input.name ?? '出租屋床位区',
    overallPosition: input.overallPosition ?? '出租屋里靠窗的床位区域，床头固定在窗户右侧。',
    fixedAnchors: input.fixedAnchors ?? ['左侧红光窗户', '右侧木床头'],
    spatialHardLocks: input.spatialHardLocks ?? {
      anchorLayout: ['左侧红光窗户固定在画面左侧', '右侧木床头固定在画面右侧'],
      screenDirectionLocks: ['窗外红光始终从画面左侧投向床头右侧'],
      depthLayoutLocks: ['床尾固定在画面左下前景，床头固定在画面右侧中后景'],
      cameraSideLocks: ['镜头始终位于靠镜头床沿这一侧，不得切到靠窗床边'],
      subjectPlacementLocks: ['陈志国坐下和躺下都必须落在同一张单人木床的同一床轴上'],
      forbiddenSpatialChanges: ['不得镜像翻转窗户和床头的左右关系'],
    },
  }
}

describe('scene continuity spatial hard locks', () => {
  it('persists scene zone spatial hard locks for downstream image prompts', () => {
    const zones = [sceneZone()]

    validateSceneContinuity({
      sceneZones: zones,
      locations,
      panels: [
        {
          panelNumber: 1,
          characterNames: ['陈志国'],
          locationId: 'rental-room',
          sceneZoneId: 'zone-bed',
          shotBlocking: shotBlocking(),
        },
        {
          panelNumber: 2,
          characterNames: ['陈志国'],
          locationId: 'rental-room',
          sceneZoneId: 'zone-bed',
          shotBlocking: shotBlocking(),
        },
      ],
    })

    expect(formatSceneZonesForStorage(zones)[0]?.spatialHardLocks).toEqual({
      anchorLayout: ['左侧红光窗户固定在画面左侧', '右侧木床头固定在画面右侧'],
      screenDirectionLocks: ['窗外红光始终从画面左侧投向床头右侧'],
      depthLayoutLocks: ['床尾固定在画面左下前景，床头固定在画面右侧中后景'],
      cameraSideLocks: ['镜头始终位于靠镜头床沿这一侧，不得切到靠窗床边'],
      subjectPlacementLocks: ['陈志国坐下和躺下都必须落在同一张单人木床的同一床轴上'],
      forbiddenSpatialChanges: ['不得镜像翻转窗户和床头的左右关系'],
    })
  })
})
