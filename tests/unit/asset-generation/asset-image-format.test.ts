import { describe, expect, it } from 'vitest'
import {
  applyAssetImageFormatPolicy,
  getAssetImageFormatPolicy,
  hasCurrentFrozenAssetImageFormatPolicy,
  resolveAssetImageKindForSchemaId,
} from '@/lib/asset-generation/asset-image-format'
import { CREATIVE_RESOURCE_SCHEMA } from '@/lib/creative-resource/schema-registry'

describe('asset image fixed-format policy', () => {
  it.each([
    [CREATIVE_RESOURCE_SCHEMA.CHARACTER_IMAGE, 'character', '4:3'],
    [CREATIVE_RESOURCE_SCHEMA.LOCATION_IMAGE, 'location', '4:3'],
    [CREATIVE_RESOURCE_SCHEMA.PROP_IMAGE, 'prop', '4:3'],
  ] as const)('maps professional asset schema %s to its only format policy', (schemaId, kind, ratio) => {
    expect(resolveAssetImageKindForSchemaId(schemaId)).toBe(kind)
    expect(getAssetImageFormatPolicy(kind).aspectRatio).toBe(ratio)
  })

  it.each([
    CREATIVE_RESOURCE_SCHEMA.GENERIC_IMAGE,
    CREATIVE_RESOURCE_SCHEMA.STYLE,
    CREATIVE_RESOURCE_SCHEMA.GENERIC_VIDEO,
    CREATIVE_RESOURCE_SCHEMA.VIDEO_SEGMENT,
  ])('does not claim non-asset schema %s', (schemaId) => {
    expect(resolveAssetImageKindForSchemaId(schemaId)).toBeNull()
  })

  it('places the character format last exactly once', () => {
    const first = applyAssetImageFormatPolicy({
      prompt: '苍白少年，破旧黑衣，湿发',
      kind: 'character',
      locale: 'zh',
    })
    const repeated = applyAssetImageFormatPolicy({
      prompt: `${first}\n额外风格块`,
      kind: 'character',
      locale: 'zh',
    })
    const instruction = getAssetImageFormatPolicy('character').instruction.zh

    expect(repeated.endsWith(instruction)).toBe(true)
    expect(repeated.split(instruction)).toHaveLength(2)
    expect(repeated).toContain('左半边只展示该角色的脸部特写')
    expect(repeated).toContain('右半边只展示同一角色从头到脚无遮挡的完整全身')
    expect(repeated).toContain('背景必须为纯白色')
  })

  it('keeps location and prop exclusion semantics separate', () => {
    const location = applyAssetImageFormatPolicy({ prompt: '废弃木屋', kind: 'location', locale: 'zh' })
    const prop = applyAssetImageFormatPolicy({ prompt: '折扇', kind: 'prop', locale: 'zh' })

    expect(location).toContain('正前方视角完整展示整个场景')
    expect(location).toContain('不得出现任何人物、松散家具或独立道具资产')
    expect(location).not.toContain('背景必须为纯白色')
    expect(prop).toContain('只展示一个摆放方正')
    expect(prop).toContain('背景必须为纯白色')
    expect(prop).toContain('不得出现人物、其他道具或场景环境')
  })

  it('rejects frozen asset retries created before the current format policy', () => {
    const prompt = applyAssetImageFormatPolicy({ prompt: '古铜折扇', kind: 'prop', locale: 'zh' })
    const current = {
      kind: 'prop',
      taskPrompt: prompt,
      taskAspectRatio: '4:3',
      resourcePrompt: prompt,
      resourceAspectRatio: '4:3',
    } as const

    expect(hasCurrentFrozenAssetImageFormatPolicy(current)).toBe(true)
    expect(hasCurrentFrozenAssetImageFormatPolicy({ ...current, taskAspectRatio: '3:2' })).toBe(false)
    expect(hasCurrentFrozenAssetImageFormatPolicy({ ...current, resourceAspectRatio: '3:2' })).toBe(false)
    expect(hasCurrentFrozenAssetImageFormatPolicy({ ...current, taskPrompt: '古铜折扇' })).toBe(false)
    expect(hasCurrentFrozenAssetImageFormatPolicy({ ...current, resourcePrompt: '古铜折扇' })).toBe(false)
  })
})
