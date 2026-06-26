import { describe, expect, it } from 'vitest'
import { resolvePanelCharacterRequirementIds } from '@/lib/edit-script/storyboard-consistency/panel-character-resolution'

const characterAssets = [
  {
    requirementId: 'asset-gu-yan',
    kind: 'character',
    name: '顾严',
    shotNumbers: [5, 6, 7],
  },
  {
    requirementId: 'asset-shi-yu',
    kind: 'character',
    name: '施雨',
    shotNumbers: [4, 6, 9],
  },
] as const

const block = {
  shotNumbers: [5, 6, 7, 8],
} as const

function resolveForShot(input: {
  readonly shotNumber: number
  readonly shotScale: string
  readonly visibleAction?: string
  readonly charactersAndScene?: string
  readonly placementNames?: readonly string[]
}) {
  return resolvePanelCharacterRequirementIds({
    assets: characterAssets,
    shot: {
      shotNumber: input.shotNumber,
      visibleAction: input.visibleAction ?? '顾严在同一张餐桌旁承受冲击。',
      charactersAndScene: input.charactersAndScene ?? '西餐厅内的连续动作。',
    },
    block,
    cinematographyShot: {
      shotScale: input.shotScale,
    },
    generated: {
      shotBlocking: {
        characterPlacements: (input.placementNames ?? []).map((name) => ({
          characterName: name,
        })),
      },
      metadata: {},
    },
  })
}

describe('panel character resolution', () => {
  it('keeps exact asset shot index matches as the base source', () => {
    expect(resolveForShot({ shotNumber: 6, shotScale: '全景 Long Shot' })).toEqual([
      'asset-gu-yan',
      'asset-shi-yu',
    ])
  })

  it('adds a character when structured shot blocking names them even if asset shot indexes missed the shot', () => {
    expect(resolveForShot({
      shotNumber: 5,
      shotScale: '特写 Close-up',
      placementNames: ['施雨'],
    })).toEqual([
      'asset-gu-yan',
      'asset-shi-yu',
    ])
  })

  it('bridges adjacent continuity for medium or wide shots when the same character appears before and after', () => {
    expect(resolveForShot({ shotNumber: 5, shotScale: '中景 Medium Shot' })).toEqual([
      'asset-gu-yan',
      'asset-shi-yu',
    ])
  })

  it('does not bridge adjacent continuity into close-up or prop insert shots', () => {
    expect(resolveForShot({ shotNumber: 5, shotScale: '特写 Close-up' })).toEqual([
      'asset-gu-yan',
    ])
  })

  it('does not add a character when the shot explicitly states they are offscreen', () => {
    expect(resolveForShot({
      shotNumber: 5,
      shotScale: '全景 Long Shot',
      visibleAction: '施雨离场不入画，顾严独自站在破碎餐桌旁。',
    })).toEqual([
      'asset-gu-yan',
    ])
  })
})
