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
      baseTitle: 'Dev A/B test shared base request',
      variantTitle: 'Variant',
      comparisonRule: 'Keep the shared base request stable and only apply this variant instruction as the visual strategy under test.',
    }
  }

  return {
    baseTitle: '开发 A/B 测试共用基础需求',
    variantTitle: '方案',
    comparisonRule: '保持共用基础需求稳定，只把本方案说明作为正在测试的视觉策略差异。',
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
