import type { DevAbVariantId } from './variant-request'

export type DevAbCastingCriterionKey =
  | 'roleConsistency'
  | 'identityReadability'
  | 'contactSheetCompleteness'
  | 'expressionRange'
  | 'costumeRange'
  | 'marksPropsFidelity'
  | 'backgroundFit'
  | 'productionUsability'

export type DevAbCastingCriterionScore = {
  readonly key: DevAbCastingCriterionKey
  readonly score: number
  readonly reason: string
}

export type DevAbCastingVariantEvaluation = {
  readonly id: DevAbVariantId
  readonly totalScore: number
  readonly criteria: DevAbCastingCriterionScore[]
  readonly strengths: string[]
  readonly risks: string[]
  readonly recommendation: string
}

export type DevAbCastingEvaluationResult = {
  readonly winnerId: DevAbVariantId
  readonly summary: string
  readonly variants: DevAbCastingVariantEvaluation[]
}

export const DEV_AB_CASTING_CRITERIA: readonly DevAbCastingCriterionKey[] = [
  'roleConsistency',
  'identityReadability',
  'contactSheetCompleteness',
  'expressionRange',
  'costumeRange',
  'marksPropsFidelity',
  'backgroundFit',
  'productionUsability',
]

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value)
}

function readString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

function readStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return value.map(readString).filter(Boolean)
}

function readVariantId(value: unknown): DevAbVariantId | null {
  return value === 'A' || value === 'B' ? value : null
}

function readCriterionKey(value: unknown): DevAbCastingCriterionKey | null {
  if (typeof value !== 'string') return null
  return DEV_AB_CASTING_CRITERIA.find((key) => key === value) ?? null
}

function readScore(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0
}

function parseCriteria(value: unknown): DevAbCastingCriterionScore[] {
  if (!Array.isArray(value)) return []
  return value.flatMap((item) => {
    if (!isRecord(item)) return []
    const key = readCriterionKey(item.key)
    if (!key) return []
    return [{
      key,
      score: readScore(item.score),
      reason: readString(item.reason),
    }]
  })
}

function parseVariant(value: unknown): DevAbCastingVariantEvaluation | null {
  if (!isRecord(value)) return null
  const id = readVariantId(value.id)
  if (!id) return null
  return {
    id,
    totalScore: readScore(value.totalScore),
    criteria: parseCriteria(value.criteria),
    strengths: readStringArray(value.strengths),
    risks: readStringArray(value.risks),
    recommendation: readString(value.recommendation),
  }
}

export function parseDevAbCastingEvaluationResult(value: unknown): DevAbCastingEvaluationResult | null {
  if (!isRecord(value)) return null
  const winnerId = readVariantId(value.winnerId)
  if (!winnerId || !Array.isArray(value.variants)) return null
  const variants = value.variants
    .map(parseVariant)
    .filter((item): item is DevAbCastingVariantEvaluation => !!item)
  if (variants.length !== 2) return null
  return {
    winnerId,
    summary: readString(value.summary),
    variants,
  }
}
