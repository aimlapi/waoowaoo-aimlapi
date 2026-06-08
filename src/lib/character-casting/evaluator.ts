import type { Locale } from '@/i18n/routing'
import { executeVisionCompletion } from '@/lib/ai-exec/engine'
import { getCompletionContent } from '@/lib/ai-exec/llm-helpers'
import { safeParseJsonObject } from '@/lib/json-repair'
import {
  CHARACTER_CASTING_CRITERIA,
  type CharacterCastingCandidateEvaluation,
  type CharacterCastingCriterionKey,
  type CharacterCastingCriterionScore,
  type CharacterCastingEvaluationResult,
} from './evaluation'

export type CharacterCastingCandidateInput = {
  readonly candidateIndex: number
  readonly request: string
  readonly imageUrl: string
}

export type CharacterCastingEvaluationInput = {
  readonly userId: string
  readonly locale: Locale
  readonly analysisModel: string
  readonly baseRequest: string
  readonly candidates: readonly [
    CharacterCastingCandidateInput,
    CharacterCastingCandidateInput,
    CharacterCastingCandidateInput,
  ]
}

const CRITERIA_ZH: Record<CharacterCastingCriterionKey, string> = {
  roleConsistency: '角色一致性：同一组内是否像同一个演员，五官、体型、年龄感、精神状态是否稳定',
  identityReadability: '脸部与身份辨识度：面相、职业身份、人物气质是否清楚可读',
  contactSheetCompleteness: '选角素材完整度：是否包含身份照、正侧背、全身、局部细节、道具和场景定妆照',
  expressionRange: '表情跨度：中性、脆弱、微笑或其他情绪是否真实，并且没有崩脸或换人',
  costumeRange: '服装跨度：是否真的有不同服装、材质、层次或穿搭方式，同时仍像同一个角色',
  marksPropsFidelity: '标记与道具保真：疤痕、纹身、辅助器具、关键道具是否稳定可见',
  backgroundFit: '背景适配：故事场景是否符合角色身份，并且没有抢走主体',
  productionUsability: '后续资产可用性：是否适合作为后续角色资产、分镜和镜头参考',
}

const CRITERIA_EN: Record<CharacterCastingCriterionKey, string> = {
  roleConsistency: 'Role consistency: each sheet preserves one actor identity, facial structure, body profile, age impression, and visible state',
  identityReadability: 'Face and identity readability: readable face, profession, personality, and casting presence',
  contactSheetCompleteness: 'Casting material completeness: identity views, front/side/back, full body, details, prop, and scene stills',
  expressionRange: 'Expression range: believable neutral, vulnerable, smiling, or other emotional states without face drift',
  costumeRange: 'Costume range: visibly different outfits, materials, layers, or styling while staying the same role',
  marksPropsFidelity: 'Marks and prop fidelity: scars, tattoos, assistive devices, and key props stay visible and consistent',
  backgroundFit: 'Background fit: story settings match the role and keep the character as the subject',
  productionUsability: 'Production usability: useful as downstream character asset, storyboard, and shot reference',
}

function buildEvaluationPrompt(input: CharacterCastingEvaluationInput): string {
  const criteria = input.locale === 'en' ? CRITERIA_EN : CRITERIA_ZH
  const criterionLines = CHARACTER_CASTING_CRITERIA.map((key) => `- ${key}: ${criteria[key]}`).join('\n')
  const candidateLines = input.candidates
    .map((candidate) => `Candidate ${candidate.candidateIndex}: ${candidate.request}`)
    .join('\n')

  if (input.locale === 'en') {
    return [
      'You are a casting director and production visual asset supervisor.',
      'Evaluate three generated casting look-test contact sheets for the same role. Image 1 is candidateIndex 0, image 2 is candidateIndex 1, and image 3 is candidateIndex 2.',
      '',
      'Shared role request:',
      input.baseRequest,
      '',
      'Candidate generation requests:',
      candidateLines,
      '',
      'Anti-fake-scoring rule: before scoring, compare the three images against each other. If two or three candidates are near-duplicates, share the same face, same styling, same contact-sheet layout, or only differ by tiny color/expression changes, say so plainly in summary, give those duplicated candidates low scores for identityReadability, costumeRange, expressionRange, backgroundFit, and productionUsability, and do not invent different strengths that are not visibly present.',
      'If all three candidates are effectively the same generated person/look, winnerIndex must be 0 only as a placeholder, and summary must state that there is no meaningful casting difference.',
      '',
      'Score every candidate on each criterion from 0 to 10. Judge from the actual visible image content, not only the prompts.',
      criterionLines,
      '',
      'Return JSON only. Use this exact shape:',
      '{"winnerIndex":0,"summary":"one concise judging summary","candidates":[{"candidateIndex":0,"criteria":[{"key":"roleConsistency","score":0,"reason":"visible evidence"}],"strengths":["specific visible strength"],"risks":["specific visible risk"],"recommendation":"casting recommendation"}]}',
      'candidates must contain exactly candidateIndex 0, 1, and 2. winnerIndex must be 0, 1, or 2. Each candidate must include exactly all eight criterion keys.',
    ].join('\n')
  }

  return [
    '你是一名选角导演兼影视资产视觉总监。',
    '请评估三张为同一角色生成的选角定妆 contact sheet。图片 1 是 candidateIndex 0，图片 2 是 candidateIndex 1，图片 3 是 candidateIndex 2。',
    '',
    '共用角色需求：',
    input.baseRequest,
    '',
    '候选生成需求：',
    candidateLines,
    '',
    '反假评分规则：评分前必须先横向比较三张图。如果两张或三张候选几乎重复、共用同一张脸、同一套造型、同一 contact sheet 版式，或者只是轻微换色/换表情，不得假装它们各有不同优点；必须在 summary 里直说“候选缺少有效差异”，并把重复候选在 identityReadability、costumeRange、expressionRange、backgroundFit、productionUsability 等维度打低分。',
    '如果三张本质上是同一个生成人物/同一套妆造，winnerIndex 只能把 0 当作占位赢家，同时 summary 必须说明没有真正可比较的选角差异。',
    '',
    '请根据图片中实际可见内容评分，不要只看提示词。每个候选的每个维度打 0 到 10 分。',
    criterionLines,
    '',
    '只返回 JSON。必须使用这个结构：',
    '{"winnerIndex":0,"summary":"一句简洁评审总结","candidates":[{"candidateIndex":0,"criteria":[{"key":"roleConsistency","score":0,"reason":"可见依据"}],"strengths":["具体可见优势"],"risks":["具体可见风险"],"recommendation":"选角建议"}]}',
    'candidates 必须完整包含 candidateIndex 0、1、2。winnerIndex 只能是 0、1、2。每个候选必须完整包含八个 criterion key。',
  ].join('\n')
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value)
}

function readString(value: unknown, field: string): string {
  if (typeof value !== 'string' || !value.trim()) throw new Error(`CHARACTER_CASTING_EVALUATION_INVALID:${field}`)
  return value.trim()
}

function readStringArray(value: unknown, field: string): string[] {
  if (!Array.isArray(value)) throw new Error(`CHARACTER_CASTING_EVALUATION_INVALID:${field}`)
  return value.map((item, index) => readString(item, `${field}.${index}`))
}

function readCandidateIndex(value: unknown, field: string): number {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 0 || value > 2) {
    throw new Error(`CHARACTER_CASTING_EVALUATION_INVALID:${field}`)
  }
  return value
}

function readCriterionKey(value: unknown, field: string): CharacterCastingCriterionKey {
  if (typeof value !== 'string') throw new Error(`CHARACTER_CASTING_EVALUATION_INVALID:${field}`)
  const matched = CHARACTER_CASTING_CRITERIA.find((key) => key === value)
  if (!matched) throw new Error(`CHARACTER_CASTING_EVALUATION_INVALID:${field}`)
  return matched
}

function readScore(value: unknown, field: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > 10) {
    throw new Error(`CHARACTER_CASTING_EVALUATION_INVALID:${field}`)
  }
  return Math.round(value * 10) / 10
}

function normalizeCriteria(value: unknown, field: string): CharacterCastingCriterionScore[] {
  if (!Array.isArray(value)) throw new Error(`CHARACTER_CASTING_EVALUATION_INVALID:${field}`)
  const byKey = new Map<CharacterCastingCriterionKey, CharacterCastingCriterionScore>()
  value.forEach((item, index) => {
    if (!isRecord(item)) throw new Error(`CHARACTER_CASTING_EVALUATION_INVALID:${field}.${index}`)
    const key = readCriterionKey(item.key, `${field}.${index}.key`)
    byKey.set(key, {
      key,
      score: readScore(item.score, `${field}.${index}.score`),
      reason: readString(item.reason, `${field}.${index}.reason`),
    })
  })
  if (byKey.size !== CHARACTER_CASTING_CRITERIA.length) throw new Error(`CHARACTER_CASTING_EVALUATION_INVALID:${field}.missingCriteria`)
  return CHARACTER_CASTING_CRITERIA.map((key) => {
    const criterion = byKey.get(key)
    if (!criterion) throw new Error(`CHARACTER_CASTING_EVALUATION_INVALID:${field}.${key}`)
    return criterion
  })
}

function totalFromCriteria(criteria: readonly CharacterCastingCriterionScore[]): number {
  const total = criteria.reduce((sum, item) => sum + item.score, 0)
  return Math.round((total / criteria.length) * 10)
}

function normalizeCandidate(value: unknown, field: string): CharacterCastingCandidateEvaluation {
  if (!isRecord(value)) throw new Error(`CHARACTER_CASTING_EVALUATION_INVALID:${field}`)
  const criteria = normalizeCriteria(value.criteria, `${field}.criteria`)
  return {
    candidateIndex: readCandidateIndex(value.candidateIndex, `${field}.candidateIndex`),
    totalScore: totalFromCriteria(criteria),
    criteria,
    strengths: readStringArray(value.strengths, `${field}.strengths`),
    risks: readStringArray(value.risks, `${field}.risks`),
    recommendation: readString(value.recommendation, `${field}.recommendation`),
  }
}

function normalizeEvaluation(value: unknown): CharacterCastingEvaluationResult {
  if (!isRecord(value)) throw new Error('CHARACTER_CASTING_EVALUATION_INVALID:root')
  if (!Array.isArray(value.candidates) || value.candidates.length !== 3) {
    throw new Error('CHARACTER_CASTING_EVALUATION_INVALID:candidates')
  }
  const winnerIndex = readCandidateIndex(value.winnerIndex, 'winnerIndex')
  const candidates = value.candidates.map((item, index) => normalizeCandidate(item, `candidates.${index}`))
  const indexes = new Set(candidates.map((candidate) => candidate.candidateIndex))
  if (!indexes.has(0) || !indexes.has(1) || !indexes.has(2)) {
    throw new Error('CHARACTER_CASTING_EVALUATION_INVALID:candidateIndexes')
  }
  return {
    winnerIndex,
    summary: readString(value.summary, 'summary'),
    candidates: [0, 1, 2].map((candidateIndex) => {
      const candidate = candidates.find((item) => item.candidateIndex === candidateIndex)
      if (!candidate) throw new Error(`CHARACTER_CASTING_EVALUATION_INVALID:candidate.${candidateIndex}`)
      return candidate
    }),
  }
}

export async function evaluateCharacterCastingCandidates(
  input: CharacterCastingEvaluationInput,
): Promise<CharacterCastingEvaluationResult> {
  const completion = await executeVisionCompletion({
    modality: 'vision',
    userId: input.userId,
    model: input.analysisModel,
    textPrompt: buildEvaluationPrompt(input),
    imageUrls: input.candidates.map((candidate) => candidate.imageUrl),
    options: {
      temperature: 0.1,
      reasoning: false,
      action: 'character_casting_candidates_evaluate',
    },
  })

  const content = getCompletionContent(completion)
  return normalizeEvaluation(safeParseJsonObject(content))
}
