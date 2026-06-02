import type { Locale } from '@/i18n/routing'

export type DevAbVariantId = 'A' | 'B'

export type DevAbVariantRequestInput = {
  readonly baseRequest: string
  readonly variantId: DevAbVariantId
  readonly variantInstruction: string
  readonly locale: Locale
}

function normalizeMultilineText(value: string): string {
  return value
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .join('\n')
}

export function normalizeDevAbInput(value: string): string {
  return normalizeMultilineText(value)
}

function labelsForLocale(locale: Locale): {
  readonly baseTitle: string
  readonly variantTitle: string
  readonly castingSheetTitle: string
  readonly castingSheetRules: readonly string[]
  readonly comparisonRule: string
} {
  if (locale === 'en') {
    return {
      baseTitle: 'Casting look-test shared role request',
      variantTitle: 'Variant',
      castingSheetTitle: 'Required casting material output',
      castingSheetRules: [
        'Generate one casting contact sheet, not a single plain-background portrait set.',
        'Keep the same actor identity, facial structure, body profile, skin condition, visible state, accessibility features, tattoos, scars, and identity marks consistent in every panel.',
        'Include plain studio identity panels plus additional casting stills with crying expression, smiling expression, at least two different costume looks, one key prop look, and one story-relevant background look.',
        'The costume looks must visibly change outfit materials, layers, or styling while preserving the same role identity.',
        'At least one panel must use a concrete non-white story background, and no panel may be blank.',
      ],
      comparisonRule: 'Keep the shared role stable and only apply this variant instruction as the casting-photo look-test difference.',
    }
  }

  return {
    baseTitle: '选角定妆 A/B 共用角色需求',
    variantTitle: '方案',
    castingSheetTitle: '必须生成的选角素材规格',
    castingSheetRules: [
      '生成一张选角定妆 contact sheet，不要只生成单一白底肖像组。',
      '每个小图必须保持同一演员身份、五官结构、体型、皮肤状态、可见精神状态、辅助器具、纹身、疤痕和身份标记一致。',
      '除了纯色摄影棚身份照，还必须包含哭泣表情、微笑表情、至少两套不同服装造型、一个关键道具造型、一个故事相关背景造型。',
      '不同服装造型要能看出材质、层次或穿搭变化，但角色身份不能变。',
      '至少一个小图必须使用具体的非白底故事背景，所有小图都不能留空。',
    ],
    comparisonRule: '保持共用角色需求稳定，只把本方案说明作为正在测试的选角定妆照差异。',
  }
}

export function buildDevAbVariantCharacterRequest(input: DevAbVariantRequestInput): string {
  const baseRequest = normalizeDevAbInput(input.baseRequest)
  const variantInstruction = normalizeDevAbInput(input.variantInstruction)
  const labels = labelsForLocale(input.locale)

  return [
    `${labels.baseTitle}:`,
    baseRequest,
    '',
    `${labels.variantTitle} ${input.variantId}:`,
    variantInstruction,
    '',
    `${labels.castingSheetTitle}:`,
    ...labels.castingSheetRules,
    '',
    labels.comparisonRule,
  ].join('\n')
}
