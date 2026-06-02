import { getUserModelConfig } from '@/lib/config-service'
import { executeVisionCompletion } from '@/lib/ai-exec/engine'
import { getCompletionContent } from '@/lib/ai-exec/llm-helpers'
import { safeParseJsonObject } from '@/lib/json-repair'
import type { Locale } from '@/i18n/routing'
import type { DevAbVariantId } from './variant-request'
import {
  DEV_AB_CASTING_CRITERIA,
  type DevAbCastingCriterionKey,
  type DevAbCastingCriterionScore,
  type DevAbCastingEvaluationResult,
  type DevAbCastingVariantEvaluation,
} from './casting-evaluation'

export type DevAbCastingEvaluationInput = {
  readonly userId: string
  readonly locale: Locale
  readonly baseRequest: string
  readonly variants: readonly [
    { readonly id: 'A'; readonly request: string; readonly imageUrl: string },
    { readonly id: 'B'; readonly request: string; readonly imageUrl: string },
  ]
}

const CRITERIA_ZH: Record<DevAbCastingCriterionKey, string> = {
  roleConsistency: '角色一致性：是否像同一个演员，五官、体型、年龄感、精神状态是否稳定',
  identityReadability: '脸部与身份辨识度：面相、职业身份、气质是否清楚可读',
  contactSheetCompleteness: '选角素材完整度：是否包含身份照、正侧背、全身、局部细节、道具和场景',
  expressionRange: '表情跨度：哭泣和微笑是否真实，并且没有崩脸或换人',
  costumeRange: '服装跨度：是否真的有不同服装、材质、层次或穿搭方式',
  marksPropsFidelity: '标记与道具保真：疤痕、纹身、辅助器具、关键道具是否稳定可见',
  backgroundFit: '背景适配：故事场景是否符合角色身份，并且没有抢走主体',
  productionUsability: '后续资产可用性：是否适合作为后续角色资产、分镜和镜头参考',
}

const CRITERIA_EN: Record<DevAbCastingCriterionKey, string> = {
  roleConsistency: 'Role consistency: same actor identity, facial structure, body profile, age impression, and visible state',
  identityReadability: 'Face and identity readability: readable face, role identity, and casting presence',
  contactSheetCompleteness: 'Casting material completeness: identity views, front/side/back, full body, details, prop, and scene stills',
  expressionRange: 'Expression range: believable crying and smiling without face drift or identity change',
  costumeRange: 'Costume range: visibly different outfits, materials, layers, or styling',
  marksPropsFidelity: 'Marks and prop fidelity: scars, tattoos, assistive devices, and key props stay visible and consistent',
  backgroundFit: 'Background fit: story settings match the role and keep the character as subject',
  productionUsability: 'Production usability: useful as downstream character asset, storyboard, and shot reference',
}

function buildEvaluationPrompt(input: DevAbCastingEvaluationInput): string {
  const criteria = input.locale === 'en' ? CRITERIA_EN : CRITERIA_ZH
  const criterionLines = DEV_AB_CASTING_CRITERIA.map((key) => `- ${key}: ${criteria[key]}`).join('\n')

  if (input.locale === 'en') {
    return [
      'You are a casting director and production visual asset supervisor.',
      'Evaluate two generated casting look-test contact sheets for the same role. Image 1 is Variant A. Image 2 is Variant B.',
      '',
      'Shared role request:',
      input.baseRequest,
      '',
      'Variant A submitted request:',
      input.variants[0].request,
      '',
      'Variant B submitted request:',
      input.variants[1].request,
      '',
      'Score every variant on each criterion from 0 to 10. Use the actual visible image content, not only the prompts.',
      criterionLines,
      '',
      'Return JSON only. Use this exact shape:',
      '{"winnerId":"A","summary":"one concise judging summary","variants":[{"id":"A","criteria":[{"key":"roleConsistency","score":0,"reason":"visible evidence"}],"strengths":["specific visible strength"],"risks":["specific visible risk"],"recommendation":"casting recommendation"}]}',
      'Each variant must include exactly all eight criterion keys. winnerId must be A or B.',
    ].join('\n')
  }

  return [
    '你是一名选角导演兼影视资产视觉总监。',
    '请评估两张为同一角色生成的选角定妆 contact sheet。图片 1 是 A 方案，图片 2 是 B 方案。',
    '',
    '共用角色需求：',
    input.baseRequest,
    '',
    'A 方案提交需求：',
    input.variants[0].request,
    '',
    'B 方案提交需求：',
    input.variants[1].request,
    '',
    '请根据图片中实际可见内容评分，不要只看提示词。每个方案的每个维度打 0 到 10 分。',
    criterionLines,
    '',
    '只返回 JSON。必须使用这个结构：',
    '{"winnerId":"A","summary":"一句简洁评审总结","variants":[{"id":"A","criteria":[{"key":"roleConsistency","score":0,"reason":"可见依据"}],"strengths":["具体可见优势"],"risks":["具体可见风险"],"recommendation":"选角建议"}]}',
    '每个方案必须完整包含八个 criterion key。winnerId 只能是 A 或 B。',
  ].join('\n')
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value)
}

function readString(value: unknown, field: string): string {
  if (typeof value !== 'string' || !value.trim()) throw new Error(`DEV_AB_CASTING_EVALUATION_INVALID:${field}`)
  return value.trim()
}

function readStringArray(value: unknown, field: string): string[] {
  if (!Array.isArray(value)) throw new Error(`DEV_AB_CASTING_EVALUATION_INVALID:${field}`)
  return value.map((item, index) => readString(item, `${field}.${index}`))
}

function readVariantId(value: unknown, field: string): DevAbVariantId {
  if (value === 'A' || value === 'B') return value
  throw new Error(`DEV_AB_CASTING_EVALUATION_INVALID:${field}`)
}

function readCriterionKey(value: unknown, field: string): DevAbCastingCriterionKey {
  if (typeof value !== 'string') throw new Error(`DEV_AB_CASTING_EVALUATION_INVALID:${field}`)
  const matched = DEV_AB_CASTING_CRITERIA.find((key) => key === value)
  if (!matched) throw new Error(`DEV_AB_CASTING_EVALUATION_INVALID:${field}`)
  return matched
}

function readScore(value: unknown, field: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > 10) {
    throw new Error(`DEV_AB_CASTING_EVALUATION_INVALID:${field}`)
  }
  return Math.round(value * 10) / 10
}

function normalizeCriteria(value: unknown, field: string): DevAbCastingCriterionScore[] {
  if (!Array.isArray(value)) throw new Error(`DEV_AB_CASTING_EVALUATION_INVALID:${field}`)
  const byKey = new Map<DevAbCastingCriterionKey, DevAbCastingCriterionScore>()
  value.forEach((item, index) => {
    if (!isRecord(item)) throw new Error(`DEV_AB_CASTING_EVALUATION_INVALID:${field}.${index}`)
    const key = readCriterionKey(item.key, `${field}.${index}.key`)
    byKey.set(key, {
      key,
      score: readScore(item.score, `${field}.${index}.score`),
      reason: readString(item.reason, `${field}.${index}.reason`),
    })
  })
  if (byKey.size !== DEV_AB_CASTING_CRITERIA.length) throw new Error(`DEV_AB_CASTING_EVALUATION_INVALID:${field}.missingCriteria`)
  return DEV_AB_CASTING_CRITERIA.map((key) => {
    const criterion = byKey.get(key)
    if (!criterion) throw new Error(`DEV_AB_CASTING_EVALUATION_INVALID:${field}.${key}`)
    return criterion
  })
}

function totalFromCriteria(criteria: readonly DevAbCastingCriterionScore[]): number {
  const total = criteria.reduce((sum, item) => sum + item.score, 0)
  return Math.round((total / criteria.length) * 10)
}

function normalizeVariant(value: unknown, field: string): DevAbCastingVariantEvaluation {
  if (!isRecord(value)) throw new Error(`DEV_AB_CASTING_EVALUATION_INVALID:${field}`)
  const criteria = normalizeCriteria(value.criteria, `${field}.criteria`)
  return {
    id: readVariantId(value.id, `${field}.id`),
    totalScore: totalFromCriteria(criteria),
    criteria,
    strengths: readStringArray(value.strengths, `${field}.strengths`),
    risks: readStringArray(value.risks, `${field}.risks`),
    recommendation: readString(value.recommendation, `${field}.recommendation`),
  }
}

function normalizeEvaluation(value: unknown): DevAbCastingEvaluationResult {
  if (!isRecord(value)) throw new Error('DEV_AB_CASTING_EVALUATION_INVALID:root')
  if (!Array.isArray(value.variants) || value.variants.length !== 2) {
    throw new Error('DEV_AB_CASTING_EVALUATION_INVALID:variants')
  }
  const winnerId = readVariantId(value.winnerId, 'winnerId')
  const variants = value.variants.map((item, index) => normalizeVariant(item, `variants.${index}`))
  const ids = new Set(variants.map((variant) => variant.id))
  if (!ids.has('A') || !ids.has('B')) throw new Error('DEV_AB_CASTING_EVALUATION_INVALID:variantIds')
  return {
    winnerId,
    summary: readString(value.summary, 'summary'),
    variants: ['A', 'B'].map((id) => {
      const variant = variants.find((item) => item.id === id)
      if (!variant) throw new Error(`DEV_AB_CASTING_EVALUATION_INVALID:variant.${id}`)
      return variant
    }),
  }
}

export async function evaluateDevAbCasting(input: DevAbCastingEvaluationInput): Promise<DevAbCastingEvaluationResult> {
  const userConfig = await getUserModelConfig(input.userId)
  const analysisModel = userConfig.analysisModel
  if (!analysisModel) throw new Error('DEV_AB_CASTING_ANALYSIS_MODEL_REQUIRED')

  const completion = await executeVisionCompletion({
    modality: 'vision',
    userId: input.userId,
    model: analysisModel,
    textPrompt: buildEvaluationPrompt(input),
    imageUrls: input.variants.map((variant) => variant.imageUrl),
    options: {
      temperature: 0.1,
      reasoning: false,
      action: 'dev_ab_casting_evaluate',
    },
  })

  const content = getCompletionContent(completion)
  return normalizeEvaluation(safeParseJsonObject(content))
}
