import { describe, expect, it } from 'vitest'
import {
  validateSceneAssetSegments,
  type PanelSceneAssetBinding,
  type SceneAssetSegment,
} from '@/lib/screenplay-storyboard/scene-assets'

const characters = [
  { name: '强哥' },
  { name: '林曼' },
  { name: '徐伟' },
]

const locations = [
  { locationId: 'warehouse' },
  { locationId: 'office' },
]

const props = [
  { name: '手机' },
  { name: '铸铁椅' },
  { name: '办公桌电话' },
]

function segment(input: Partial<SceneAssetSegment> = {}): SceneAssetSegment {
  return {
    sceneSegmentId: input.sceneSegmentId ?? 'scene-1',
    order: input.order ?? 1,
    locationId: input.locationId ?? 'warehouse',
    environment: input.environment ?? '废弃造船厂空铁房内的绑架勒索现场',
    characterNames: input.characterNames ?? ['强哥', '林曼'],
    propNames: input.propNames ?? ['手机', '铸铁椅'],
  }
}

function panel(input: Partial<PanelSceneAssetBinding> = {}): PanelSceneAssetBinding {
  return {
    panelNumber: input.panelNumber ?? 1,
    sceneSegmentId: input.sceneSegmentId ?? 'scene-1',
    locationId: input.locationId ?? 'warehouse',
    shotType: input.shotType ?? 'Medium Shot',
    characterNames: input.characterNames ?? ['强哥', '林曼'],
    propNames: input.propNames ?? ['手机', '铸铁椅'],
    omittedSceneAssets: input.omittedSceneAssets ?? [],
  }
}

describe('screenplay storyboard scene asset validation', () => {
  it('rejects a panel that invents a character outside the current scene segment', () => {
    expect(() => validateSceneAssetSegments({
      segments: [segment({ characterNames: ['强哥', '林曼'] })],
      panels: [panel({ characterNames: ['强哥', '徐伟'] })],
      characters,
      props,
      locations,
    })).toThrow('SCREENPLAY_STORYBOARD_PANEL_CHARACTER_OUTSIDE_SCENE_ASSET_SEGMENT:panel_1:徐伟')
  })

  it('rejects a non-close-up panel that omits required scene assets', () => {
    expect(() => validateSceneAssetSegments({
      segments: [segment()],
      panels: [panel({
        shotType: 'Wide Shot',
        characterNames: ['强哥'],
        propNames: ['手机'],
      })],
      characters,
      props,
      locations,
    })).toThrow('SCREENPLAY_STORYBOARD_PANEL_MISSING_REQUIRED_SCENE_CHARACTER:panel_1:林曼')
  })

  it('allows a tight detail shot to focus on a subset only when omissions are explicit', () => {
    expect(() => validateSceneAssetSegments({
      segments: [segment()],
      panels: [panel({
        shotType: 'Extreme Close-up',
        characterNames: ['强哥'],
        propNames: ['手机'],
        omittedSceneAssets: [
          { kind: 'character', name: '林曼', reason: '极近景只拍强哥手部动作' },
          { kind: 'prop', name: '铸铁椅', reason: '极近景构图裁掉椅子主体' },
        ],
      })],
      characters,
      props,
      locations,
    })).not.toThrow()
  })

  it('rejects an omitted scene asset that is still declared visible', () => {
    expect(() => validateSceneAssetSegments({
      segments: [segment()],
      panels: [panel({
        omittedSceneAssets: [
          { kind: 'character', name: '林曼', reason: '错误地同时声明可见和省略' },
        ],
      })],
      characters,
      props,
      locations,
    })).toThrow('SCREENPLAY_STORYBOARD_PANEL_OMITTED_CHARACTER_STILL_VISIBLE:panel_1:林曼')
  })

  it('rejects cross-environment panels instead of silently borrowing assets across scenes', () => {
    expect(() => validateSceneAssetSegments({
      segments: [
        segment({ sceneSegmentId: 'scene-1', order: 1, locationId: 'warehouse' }),
        segment({
          sceneSegmentId: 'scene-2',
          order: 2,
          locationId: 'office',
          environment: '徐伟所在的明亮办公室电话另一端',
          characterNames: ['徐伟'],
          propNames: ['办公桌电话'],
        }),
      ],
      panels: [
        panel({ panelNumber: 1, sceneSegmentId: 'scene-1' }),
        panel({
          panelNumber: 2,
          sceneSegmentId: 'scene-2',
          locationId: 'warehouse',
          characterNames: ['徐伟'],
          propNames: ['办公桌电话'],
        }),
      ],
      characters,
      props,
      locations,
    })).toThrow('SCREENPLAY_STORYBOARD_PANEL_SCENE_ASSET_LOCATION_MISMATCH:panel_2:warehouse:office')
  })
})
