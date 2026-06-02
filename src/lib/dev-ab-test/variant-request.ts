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
  readonly comparisonRule: string
} {
  if (locale === 'en') {
    return {
      baseTitle: 'Casting look-test shared role request',
      variantTitle: 'Variant',
      comparisonRule: 'Keep the shared role stable and only apply this variant instruction as the casting-photo look-test difference.',
    }
  }

  return {
    baseTitle: '选角定妆 A/B 共用角色需求',
    variantTitle: '方案',
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
    labels.comparisonRule,
  ].join('\n')
}
