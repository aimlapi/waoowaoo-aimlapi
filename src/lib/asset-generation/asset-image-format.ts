import {
  CREATIVE_RESOURCE_SCHEMA,
  type CreativeResourceSchemaId,
} from '@/lib/creative-resource/schema-registry'
import type { CreativeDirection } from '@/lib/creative-direction/contracts'

export type AssetImageKind = 'character' | 'location' | 'prop'
export type AssetImageFormatLocale = 'zh' | 'en'
const ASSET_IMAGE_ASPECT_RATIO = '4:3' as const

interface AssetImageFormatPolicy {
  readonly kind: AssetImageKind
  readonly schemaId: CreativeResourceSchemaId
  readonly aspectRatio: typeof ASSET_IMAGE_ASPECT_RATIO
  readonly instruction: Readonly<Record<AssetImageFormatLocale, string>>
}

/** Asset-image format authority. Generic images, previews, frames and video are outside this policy. */
export const ASSET_IMAGE_FORMAT_POLICIES = {
  character: {
    kind: 'character',
    schemaId: CREATIVE_RESOURCE_SCHEMA.CHARACTER_IMAGE,
    aspectRatio: ASSET_IMAGE_ASPECT_RATIO,
    instruction: {
      zh: `【角色资产图固定版式】只生成一张完整的 ${ASSET_IMAGE_ASPECT_RATIO} 横向长方形资产图，画面严格分为左右两半：左半边只展示该角色的脸部特写，右半边只展示同一角色从头到脚无遮挡的完整全身。背景必须为纯白色。画面中只能出现同一个角色，不得出现其他人物、任何道具或场景环境。`,
      en: `[Fixed character asset-image format] Generate exactly one complete ${ASSET_IMAGE_ASPECT_RATIO} landscape rectangular asset image split into equal left and right halves. The left half shows only a close-up of this character's face; the right half shows the same character's complete, unobstructed, head-to-toe full body. Use a pure white background. Show only this same character, with no other people, props, or scene environment.`,
    },
  },
  location: {
    kind: 'location',
    schemaId: CREATIVE_RESOURCE_SCHEMA.LOCATION_IMAGE,
    aspectRatio: ASSET_IMAGE_ASPECT_RATIO,
    instruction: {
      zh: `【场景资产图固定版式】只生成一张完整的 ${ASSET_IMAGE_ASPECT_RATIO} 横向长方形场景资产图，使用正前方视角完整展示整个场景，不得拆分成多视图。画面中不得出现任何人物、松散家具或独立道具资产；墙体、门窗、楼梯等属于场景本体的固定结构与内建要素可以正常出现。`,
      en: `[Fixed location asset-image format] Generate exactly one complete ${ASSET_IMAGE_ASPECT_RATIO} landscape rectangular location asset image: a straight-on, full-scene view that shows the entire environment, never a multi-view sheet. Show no people, loose furniture, or independent prop assets. Fixed structures and built-in elements that are part of the location itself, such as walls, doors, windows, and stairs, may remain.`,
    },
  },
  prop: {
    kind: 'prop',
    schemaId: CREATIVE_RESOURCE_SCHEMA.PROP_IMAGE,
    aspectRatio: ASSET_IMAGE_ASPECT_RATIO,
    instruction: {
      zh: `【道具资产图固定版式】只生成一张完整的 ${ASSET_IMAGE_ASPECT_RATIO} 横向长方形资产图，只展示一个摆放方正、方向明确、居中且完整无遮挡的道具。背景必须为纯白色。画面中不得出现人物、其他道具或场景环境。`,
      en: `[Fixed prop asset-image format] Generate exactly one complete ${ASSET_IMAGE_ASPECT_RATIO} landscape rectangular asset image showing one prop only, squarely aligned, clearly oriented, centered, complete, and unobstructed. Use a pure white background. Show no people, other props, or scene environment.`,
    },
  },
} as const satisfies Record<AssetImageKind, AssetImageFormatPolicy>

const ASSET_IMAGE_KIND_BY_SCHEMA_ID = new Map<CreativeResourceSchemaId, AssetImageKind>(
  Object.values(ASSET_IMAGE_FORMAT_POLICIES).map((policy) => [policy.schemaId, policy.kind]),
)

function normalizeLocale(locale: string | null | undefined): AssetImageFormatLocale {
  return locale?.toLowerCase().startsWith('en') ? 'en' : 'zh'
}

export function getAssetImageFormatPolicy(kind: AssetImageKind): AssetImageFormatPolicy {
  return ASSET_IMAGE_FORMAT_POLICIES[kind]
}

export function resolveAssetImageKindForSchemaId(schemaId: string): AssetImageKind | null {
  return ASSET_IMAGE_KIND_BY_SCHEMA_ID.get(schemaId as CreativeResourceSchemaId) ?? null
}

function stripAssetImageFormatPolicy(prompt: string, kind: AssetImageKind): string {
  const policy = getAssetImageFormatPolicy(kind)
  return (Object.values(policy.instruction) as string[])
    .reduce((value, instruction) => value.replaceAll(instruction, ''), prompt)
    .replace(/[，,]\s*$/, '')
    .trim()
}

export function applyAssetImageFormatPolicy(input: {
  readonly prompt: string
  readonly kind: AssetImageKind
  readonly locale?: string | null
}): string {
  const cleanPrompt = stripAssetImageFormatPolicy(input.prompt, input.kind)
  const instruction = getAssetImageFormatPolicy(input.kind).instruction[normalizeLocale(input.locale)]
  return cleanPrompt ? `${cleanPrompt}\n\n${instruction}` : instruction
}

function assetIdentityLabel(kind: AssetImageKind, locale: AssetImageFormatLocale): string {
  if (locale === 'en') {
    if (kind === 'character') return 'Canonical character identity'
    if (kind === 'location') return 'Canonical location identity'
    return 'Canonical prop identity'
  }
  if (kind === 'character') return '角色稳定身份'
  if (kind === 'location') return '场景稳定身份'
  return '道具稳定身份'
}

function nonPhotographicConstraint(
  direction: CreativeDirection,
  locale: AssetImageFormatLocale,
): string | null {
  if (
    direction.visual.renderMedium === 'photographic'
    || direction.visual.renderMedium === 'live_action'
    || direction.visual.realismLevel === 'photorealistic'
  ) {
    return null
  }
  return locale === 'en'
    ? 'Do not convert this design into a photograph, live-action still, photoreal human, realistic skin photography, or cinematic production frame.'
    : '禁止把该设计转成照片、真人实拍剧照、照片级真人、真实皮肤摄影或剧情电影帧。'
}

/**
 * Sole semantic writer for project asset-image prompts. The Worker owns stable
 * identity and Creative Direction owns style; neither writes a provider prompt.
 */
export function compileAssetImagePrompt(input: {
  readonly kind: AssetImageKind
  readonly stableDescription: string
  readonly creativeDirection: CreativeDirection
  readonly locale?: string | null
}): string {
  const locale = normalizeLocale(input.locale)
  const direction = input.creativeDirection
  const prompt = locale === 'en'
    ? [
        `[${assetIdentityLabel(input.kind, locale)}] ${input.stableDescription.trim()}`,
        `[Canonical render medium] ${direction.visual.renderMedium}`,
        `[Canonical realism level] ${direction.visual.realismLevel}`,
        `[Cross-media style] ${direction.visual.crossMediaStyle}`,
        `[Visual execution] ${direction.visual.visualStyle}`,
        `[Asset lighting] ${direction.visual.assetImageStyle.lighting}`,
        `[Asset texture] ${direction.visual.assetImageStyle.texture}`,
        `[Asset rendering rules] ${direction.visual.assetImageStyle.renderingRules}`,
        `[Asset policy] ${direction.assetPolicy}`,
        'Render a static reusable design reference, not a story moment, film still, emotional performance, action pose, camera scene, or environmental portrait. Preserve the canonical identity exactly.',
        nonPhotographicConstraint(direction, locale),
      ].filter((line): line is string => line !== null).join('\n')
    : [
        `【${assetIdentityLabel(input.kind, locale)}】${input.stableDescription.trim()}`,
        `【权威渲染媒介】${direction.visual.renderMedium}`,
        `【权威写实等级】${direction.visual.realismLevel}`,
        `【跨媒体风格】${direction.visual.crossMediaStyle}`,
        `【视觉执行】${direction.visual.visualStyle}`,
        `【资产图灯光】${direction.visual.assetImageStyle.lighting}`,
        `【资产图材质】${direction.visual.assetImageStyle.texture}`,
        `【资产图渲染规则】${direction.visual.assetImageStyle.renderingRules}`,
        `【资产政策】${direction.assetPolicy}`,
        '生成静态、可复用的设计参考，不得写成剧情瞬间、电影剧照、情绪表演、动作姿势、摄影场面或环境人像；必须逐项保持上述稳定身份。',
        nonPhotographicConstraint(direction, locale),
      ].filter((line): line is string => line !== null).join('\n')
  return applyAssetImageFormatPolicy({
    prompt,
    kind: input.kind,
    locale,
  })
}
