import type { Locale } from '@/i18n/routing'
import { executeAiTextStep } from '@/lib/ai-exec/engine'
import { safeParseJsonObject } from '@/lib/json-repair'
import type { SelectedVisualReferenceStyle } from '@/lib/visual-reference-cases/selected-style'

export type CharacterCastingPlanIndex = 0 | 1 | 2

export type CharacterCastingCandidatePlan = {
  readonly candidateIndex: CharacterCastingPlanIndex
  readonly label: string
  readonly castingPremise: string
  readonly faceAndAge: string
  readonly hairAndSilhouette: string
  readonly bodyAndPosture: string
  readonly costumeAndMaterials: string
  readonly performanceState: string
  readonly storyContext: string
  readonly signatureDetails: readonly string[]
  readonly differenceLocks: readonly string[]
  readonly promptDirective: string
}

export type CharacterCastingPlanSet = readonly [
  CharacterCastingCandidatePlan,
  CharacterCastingCandidatePlan,
  CharacterCastingCandidatePlan,
]

type CharacterCastingPlanInput = {
  readonly userId: string
  readonly projectId: string
  readonly locale: Locale
  readonly analysisModel: string
  readonly characterRequest: string
  readonly selectedVisualReferenceStyle: SelectedVisualReferenceStyle
}

const PLAN_KEYS = [
  'castingPremise',
  'faceAndAge',
  'hairAndSilhouette',
  'bodyAndPosture',
  'costumeAndMaterials',
  'performanceState',
  'storyContext',
  'promptDirective',
] as const

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value)
}

function readString(value: unknown, field: string): string {
  if (typeof value !== 'string' || !value.trim()) {
    throw new Error(`CHARACTER_CASTING_PLAN_INVALID:${field}`)
  }
  return value.trim()
}

function readStringList(value: unknown, field: string): string[] {
  if (!Array.isArray(value) || value.length === 0) {
    throw new Error(`CHARACTER_CASTING_PLAN_INVALID:${field}`)
  }
  return value.map((item, index) => readString(item, `${field}.${index}`))
}

function readCandidateIndex(value: unknown, field: string): CharacterCastingPlanIndex {
  if (value === 0 || value === 1 || value === 2) return value
  throw new Error(`CHARACTER_CASTING_PLAN_INVALID:${field}`)
}

function normalizeCandidatePlan(value: unknown, field: string): CharacterCastingCandidatePlan {
  if (!isRecord(value)) throw new Error(`CHARACTER_CASTING_PLAN_INVALID:${field}`)
  for (const key of PLAN_KEYS) {
    readString(value[key], `${field}.${key}`)
  }
  return {
    candidateIndex: readCandidateIndex(value.candidateIndex, `${field}.candidateIndex`),
    label: readString(value.label, `${field}.label`),
    castingPremise: readString(value.castingPremise, `${field}.castingPremise`),
    faceAndAge: readString(value.faceAndAge, `${field}.faceAndAge`),
    hairAndSilhouette: readString(value.hairAndSilhouette, `${field}.hairAndSilhouette`),
    bodyAndPosture: readString(value.bodyAndPosture, `${field}.bodyAndPosture`),
    costumeAndMaterials: readString(value.costumeAndMaterials, `${field}.costumeAndMaterials`),
    performanceState: readString(value.performanceState, `${field}.performanceState`),
    storyContext: readString(value.storyContext, `${field}.storyContext`),
    signatureDetails: readStringList(value.signatureDetails, `${field}.signatureDetails`),
    differenceLocks: readStringList(value.differenceLocks, `${field}.differenceLocks`),
    promptDirective: readString(value.promptDirective, `${field}.promptDirective`),
  }
}

export function normalizeCharacterCastingPlans(value: unknown): CharacterCastingPlanSet {
  if (!isRecord(value)) throw new Error('CHARACTER_CASTING_PLAN_INVALID:root')
  const rawCandidates = value.candidates
  if (!Array.isArray(rawCandidates) || rawCandidates.length !== 3) {
    throw new Error('CHARACTER_CASTING_PLAN_INVALID:candidates')
  }
  const candidates = rawCandidates.map((item, index) => normalizeCandidatePlan(item, `candidates.${index}`))
  const byIndex = new Map<CharacterCastingPlanIndex, CharacterCastingCandidatePlan>()
  for (const candidate of candidates) {
    if (byIndex.has(candidate.candidateIndex)) {
      throw new Error(`CHARACTER_CASTING_PLAN_INVALID:duplicateCandidateIndex.${candidate.candidateIndex}`)
    }
    byIndex.set(candidate.candidateIndex, candidate)
  }
  const first = byIndex.get(0)
  const second = byIndex.get(1)
  const third = byIndex.get(2)
  if (!first || !second || !third) {
    throw new Error('CHARACTER_CASTING_PLAN_INVALID:missingCandidateIndex')
  }
  return [first, second, third]
}

function compactText(value: string, limit: number): string {
  const normalized = value.replace(/\s+/g, ' ').trim()
  if (normalized.length <= limit) return normalized
  return `${normalized.slice(0, limit).trim()}...`
}

function buildPlanPrompt(input: CharacterCastingPlanInput): string {
  const title = compactText(input.selectedVisualReferenceStyle.title, 80)
  const description = compactText(input.selectedVisualReferenceStyle.description, 240)
  const stylePrompt = compactText(input.selectedVisualReferenceStyle.prompt, 900)

  if (input.locale === 'en') {
    return [
      'Create three hard-differentiated casting plans for the same screenplay role before image generation.',
      'The plans are not final images. They are strict inputs for three later character look-test prompts.',
      '',
      'Role request from the screenplay:',
      input.characterRequest,
      '',
      'Selected visual reference case, the only style source:',
      `Title: ${title}`,
      `Description: ${description}`,
      `Prompt: ${stylePrompt}`,
      '',
      'Rules:',
      '- Keep all plans within the same role and the selected visual reference medium.',
      '- Do not copy the reference image composition, character positions, prop layout, or exact scene moment.',
      '- Do not introduce project style config, legacy style presets, or user-history style.',
      '- The three plans must be visibly different casting options: different face impression, hair silhouette, body/posture, costume structure, performance state, and signature detail.',
      '- Each plan must still obey the screenplay facts. Do not remove required role facts; vary how those facts are embodied.',
      '- Write concrete visual decisions that an image model can execute. Avoid vague words like more realistic, more emotional, or more stylish unless followed by visible specifics.',
      '',
      'Return JSON only with this exact shape:',
      '{"candidates":[{"candidateIndex":0,"label":"A grounded everyday option","castingPremise":"...","faceAndAge":"...","hairAndSilhouette":"...","bodyAndPosture":"...","costumeAndMaterials":"...","performanceState":"...","storyContext":"...","signatureDetails":["..."],"differenceLocks":["..."],"promptDirective":"..."}]}',
      'candidates must contain exactly candidateIndex 0, 1, and 2.',
    ].join('\n')
  }

  return [
    '请在生成图片前，先为同一个剧本角色设计三套“硬差异”的选角定妆方案。',
    '这些方案不是最终图片，而是后续三张候选定妆图的强约束输入。',
    '',
    '来自剧本的角色需求：',
    input.characterRequest,
    '',
    '已选视觉参考案例，唯一风格来源：',
    `标题：${title}`,
    `描述：${description}`,
    `提示词：${stylePrompt}`,
    '',
    '规则：',
    '- 三套方案必须仍然是同一个剧本角色，并保持已选视觉参考案例的媒介类别。',
    '- 绝对不要复制视觉参考案例图的构图、人物站位、道具摆法或具体场景瞬间。',
    '- 不要引入项目风格配置、旧项目风格、系统风格预设或用户历史偏好。',
    '- 三套方案必须像真正可比较的选角方案：脸型年龄感、发型轮廓、体型姿态、服装结构、表演状态、记忆点细节都要肉眼可区分。',
    '- 必须遵守剧本事实，不能删掉角色必需特征；只能改变这些事实被具象化的方式。',
    '- 所有描述都要是图像模型能执行的可见决定。不要只写“更真实、更情绪化、更有风格”，必须写出具体脸、发、体态、衣服、细节。',
    '',
    '只返回 JSON，结构必须完全如下：',
    '{"candidates":[{"candidateIndex":0,"label":"A 生活真实路线","castingPremise":"...","faceAndAge":"...","hairAndSilhouette":"...","bodyAndPosture":"...","costumeAndMaterials":"...","performanceState":"...","storyContext":"...","signatureDetails":["..."],"differenceLocks":["..."],"promptDirective":"..."}]}',
    'candidates 必须且只能包含 candidateIndex 0、1、2。',
  ].join('\n')
}

export async function generateCharacterCastingPlans(
  input: CharacterCastingPlanInput,
): Promise<CharacterCastingPlanSet> {
  const completion = await executeAiTextStep({
    userId: input.userId,
    model: input.analysisModel,
    projectId: input.projectId,
    action: 'character_casting_plan_generate',
    messages: [{ role: 'user', content: buildPlanPrompt(input) }],
    temperature: 0.4,
    reasoning: false,
    meta: {
      stepId: 'character_casting_plan',
      stepTitle: input.locale === 'en' ? 'Generate casting plans' : '生成选角候选方案',
      stepIndex: 1,
      stepTotal: 1,
    },
  })
  return normalizeCharacterCastingPlans(safeParseJsonObject(completion.text))
}

function formatList(items: readonly string[]): string {
  return items.map((item) => `- ${item}`).join('\n')
}

export function renderCharacterCastingPlanPromptBlock(input: {
  readonly plan: CharacterCastingCandidatePlan
  readonly locale: Locale
}): string {
  const plan = input.plan
  if (input.locale === 'en') {
    return [
      `Hard casting plan for candidate ${plan.candidateIndex}: ${plan.label}`,
      `Casting premise: ${plan.castingPremise}`,
      `Face and age read: ${plan.faceAndAge}`,
      `Hair and silhouette: ${plan.hairAndSilhouette}`,
      `Body and posture: ${plan.bodyAndPosture}`,
      `Costume and materials: ${plan.costumeAndMaterials}`,
      `Performance state: ${plan.performanceState}`,
      `Story context: ${plan.storyContext}`,
      'Signature visible details:',
      formatList(plan.signatureDetails),
      'Difference locks against the other candidates:',
      formatList(plan.differenceLocks),
      `Candidate-specific image directive: ${plan.promptDirective}`,
      'This candidate must follow this plan exactly; do not average it with other candidates.',
    ].join('\n')
  }
  return [
    `候选 ${plan.candidateIndex} 的硬差异选角方案：${plan.label}`,
    `选角前提：${plan.castingPremise}`,
    `脸型与年龄感：${plan.faceAndAge}`,
    `发型与轮廓：${plan.hairAndSilhouette}`,
    `体型与姿态：${plan.bodyAndPosture}`,
    `服装与材质：${plan.costumeAndMaterials}`,
    `表演状态：${plan.performanceState}`,
    `故事语境：${plan.storyContext}`,
    '标志性可见细节：',
    formatList(plan.signatureDetails),
    '与其他候选拉开的硬锁定差异：',
    formatList(plan.differenceLocks),
    `本候选图片专属指令：${plan.promptDirective}`,
    '本候选必须严格执行这套方案；不要把其他候选方案平均混合进来。',
  ].join('\n')
}
