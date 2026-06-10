import type { Locale } from '@/i18n/routing'
import { executeAiTextStep } from '@/lib/ai-exec/engine'
import { safeParseJsonObject } from '@/lib/json-repair'
import type { SelectedVisualReferenceStyle } from '@/lib/visual-reference-cases/selected-style'

export type CharacterCastingDirectionId = 'A' | 'B' | 'C'
export type CharacterCastingPlanIndex = 0 | 1 | 2

export type CharacterDNA = {
  readonly ageRange: string
  readonly gender: string
  readonly ethnicityRegion: string
  readonly socialClass: string
  readonly occupation: string
  readonly temperament: string
  readonly coreWound: string
  readonly desireNeed: string
  readonly narrativeFunction: string
  readonly bodyEnergy: string
  readonly styleCompatibility: string
}

export type CharacterAppearanceDescriptor = {
  readonly faceShape: string
  readonly boneStructure: string
  readonly eyes: string
  readonly nose: string
  readonly lips: string
  readonly skinTexture: string
  readonly hairstyle: string
  readonly bodyType: string
  readonly posture: string
  readonly wardrobe: string
  readonly visualKeywords: readonly string[]
}

export type CharacterCastingCandidatePlan = {
  readonly id: CharacterCastingDirectionId
  readonly candidateIndex: CharacterCastingPlanIndex
  readonly directionName: string
  readonly interpretationLogic: string
  readonly faceFamily: string
  readonly bodyType: string
  readonly emotionalTemperature: string
  readonly screenPresence: string
  readonly appearanceDescriptor: CharacterAppearanceDescriptor
  readonly imagePrompt: string
}

export type CharacterCastingPlanSet = readonly [
  CharacterCastingCandidatePlan,
  CharacterCastingCandidatePlan,
  CharacterCastingCandidatePlan,
]

export type CharacterCastingDiversityCheck = {
  readonly AB: string
  readonly AC: string
  readonly BC: string
  readonly passed: true
}

export type CharacterCastingPlanDocument = {
  readonly characterDNA: CharacterDNA
  readonly castingDirections: CharacterCastingPlanSet
  readonly diversityCheck: CharacterCastingDiversityCheck
}

type CharacterCastingPlanInput = {
  readonly userId: string
  readonly projectId: string
  readonly locale: Locale
  readonly analysisModel: string
  readonly characterRequest: string
  readonly selectedVisualReferenceStyle: SelectedVisualReferenceStyle
}

const DNA_KEYS: readonly (keyof CharacterDNA)[] = [
  'ageRange',
  'gender',
  'ethnicityRegion',
  'socialClass',
  'occupation',
  'temperament',
  'coreWound',
  'desireNeed',
  'narrativeFunction',
  'bodyEnergy',
  'styleCompatibility',
]

const APPEARANCE_DESCRIPTOR_KEYS: readonly (keyof CharacterAppearanceDescriptor)[] = [
  'faceShape',
  'boneStructure',
  'eyes',
  'nose',
  'lips',
  'skinTexture',
  'hairstyle',
  'bodyType',
  'posture',
  'wardrobe',
  'visualKeywords',
]

const DIRECTION_KEYS: readonly (keyof Omit<CharacterCastingCandidatePlan, 'candidateIndex'>)[] = [
  'id',
  'directionName',
  'interpretationLogic',
  'faceFamily',
  'bodyType',
  'emotionalTemperature',
  'screenPresence',
  'appearanceDescriptor',
  'imagePrompt',
]

const DIVERSITY_KEYS: readonly (keyof CharacterCastingDiversityCheck)[] = ['AB', 'AC', 'BC', 'passed']

const FORBIDDEN_DNA_KEYS = new Set([
  'face',
  'faceShape',
  'boneStructure',
  'eyes',
  'eye',
  'nose',
  'lips',
  'mouth',
  'skinTexture',
  'hairstyle',
  'hair',
])

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

function assertOnlyKnownKeys(
  value: Record<string, unknown>,
  keys: readonly string[],
  field: string,
): void {
  const allowed = new Set(keys)
  for (const key of Object.keys(value)) {
    if (!allowed.has(key)) {
      throw new Error(`CHARACTER_CASTING_PLAN_INVALID:${field}.${key}`)
    }
  }
}

function normalizeTextForCompare(value: string): string {
  return value
    .toLocaleLowerCase()
    .replace(/[\s,，。.;；:：/、|_-]+/g, '')
    .trim()
}

function ensureDifferent(left: string, right: string, field: string): void {
  if (normalizeTextForCompare(left) === normalizeTextForCompare(right)) {
    throw new Error(`CHARACTER_CASTING_PLAN_INSUFFICIENT_DIVERSITY:${field}`)
  }
}

function normalizeCharacterDNA(value: unknown): CharacterDNA {
  if (!isRecord(value)) throw new Error('CHARACTER_CASTING_PLAN_INVALID:characterDNA')
  assertOnlyKnownKeys(value, DNA_KEYS, 'characterDNA')
  for (const key of Object.keys(value)) {
    if (FORBIDDEN_DNA_KEYS.has(key)) {
      throw new Error(`CHARACTER_CASTING_PLAN_INVALID:characterDNA.forbidden.${key}`)
    }
  }
  return {
    ageRange: readString(value.ageRange, 'characterDNA.ageRange'),
    gender: readString(value.gender, 'characterDNA.gender'),
    ethnicityRegion: readString(value.ethnicityRegion, 'characterDNA.ethnicityRegion'),
    socialClass: readString(value.socialClass, 'characterDNA.socialClass'),
    occupation: readString(value.occupation, 'characterDNA.occupation'),
    temperament: readString(value.temperament, 'characterDNA.temperament'),
    coreWound: readString(value.coreWound, 'characterDNA.coreWound'),
    desireNeed: readString(value.desireNeed, 'characterDNA.desireNeed'),
    narrativeFunction: readString(value.narrativeFunction, 'characterDNA.narrativeFunction'),
    bodyEnergy: readString(value.bodyEnergy, 'characterDNA.bodyEnergy'),
    styleCompatibility: readString(value.styleCompatibility, 'characterDNA.styleCompatibility'),
  }
}

function normalizeAppearanceDescriptor(value: unknown, field: string): CharacterAppearanceDescriptor {
  if (!isRecord(value)) throw new Error(`CHARACTER_CASTING_PLAN_INVALID:${field}`)
  assertOnlyKnownKeys(value, APPEARANCE_DESCRIPTOR_KEYS, field)
  return {
    faceShape: readString(value.faceShape, `${field}.faceShape`),
    boneStructure: readString(value.boneStructure, `${field}.boneStructure`),
    eyes: readString(value.eyes, `${field}.eyes`),
    nose: readString(value.nose, `${field}.nose`),
    lips: readString(value.lips, `${field}.lips`),
    skinTexture: readString(value.skinTexture, `${field}.skinTexture`),
    hairstyle: readString(value.hairstyle, `${field}.hairstyle`),
    bodyType: readString(value.bodyType, `${field}.bodyType`),
    posture: readString(value.posture, `${field}.posture`),
    wardrobe: readString(value.wardrobe, `${field}.wardrobe`),
    visualKeywords: readStringList(value.visualKeywords, `${field}.visualKeywords`),
  }
}

function readDirectionId(value: unknown, expected: CharacterCastingDirectionId, field: string): CharacterCastingDirectionId {
  if (typeof value === 'string' && value === expected) return expected
  throw new Error(`CHARACTER_CASTING_PLAN_INVALID:${field}`)
}

function directionIndex(id: CharacterCastingDirectionId): CharacterCastingPlanIndex {
  if (id === 'A') return 0
  if (id === 'B') return 1
  return 2
}

function normalizeCastingDirection(
  value: unknown,
  expectedId: CharacterCastingDirectionId,
  field: string,
): CharacterCastingCandidatePlan {
  if (!isRecord(value)) throw new Error(`CHARACTER_CASTING_PLAN_INVALID:${field}`)
  assertOnlyKnownKeys(value, DIRECTION_KEYS, field)
  const id = readDirectionId(value.id, expectedId, `${field}.id`)
  const imagePrompt = readString(value.imagePrompt, `${field}.imagePrompt`)
  if (!imagePrompt.includes(`This is casting alternative ${id} for the same character.`)) {
    throw new Error(`CHARACTER_CASTING_PLAN_INVALID:${field}.imagePrompt.alternativeLabel`)
  }
  if (!imagePrompt.toLocaleLowerCase().includes('same character dna, different actor-like interpretation')) {
    throw new Error(`CHARACTER_CASTING_PLAN_INVALID:${field}.imagePrompt.characterDnaPhrase`)
  }
  return {
    id,
    candidateIndex: directionIndex(id),
    directionName: readString(value.directionName, `${field}.directionName`),
    interpretationLogic: readString(value.interpretationLogic, `${field}.interpretationLogic`),
    faceFamily: readString(value.faceFamily, `${field}.faceFamily`),
    bodyType: readString(value.bodyType, `${field}.bodyType`),
    emotionalTemperature: readString(value.emotionalTemperature, `${field}.emotionalTemperature`),
    screenPresence: readString(value.screenPresence, `${field}.screenPresence`),
    appearanceDescriptor: normalizeAppearanceDescriptor(value.appearanceDescriptor, `${field}.appearanceDescriptor`),
    imagePrompt,
  }
}

function normalizeDiversityCheck(value: unknown): CharacterCastingDiversityCheck {
  if (!isRecord(value)) throw new Error('CHARACTER_CASTING_PLAN_INVALID:diversityCheck')
  assertOnlyKnownKeys(value, DIVERSITY_KEYS, 'diversityCheck')
  if (value.passed !== true) {
    throw new Error('CHARACTER_CASTING_PLAN_INSUFFICIENT_DIVERSITY:diversityCheck.passed')
  }
  return {
    AB: readString(value.AB, 'diversityCheck.AB'),
    AC: readString(value.AC, 'diversityCheck.AC'),
    BC: readString(value.BC, 'diversityCheck.BC'),
    passed: true,
  }
}

function assertDescriptorDiversity(
  left: CharacterCastingCandidatePlan,
  right: CharacterCastingCandidatePlan,
): void {
  const pair = `${left.id}${right.id}`
  ensureDifferent(left.faceFamily, right.faceFamily, `${pair}.faceFamily`)
  ensureDifferent(left.screenPresence, right.screenPresence, `${pair}.screenPresence`)
  ensureDifferent(left.appearanceDescriptor.faceShape, right.appearanceDescriptor.faceShape, `${pair}.faceShape`)
  ensureDifferent(left.appearanceDescriptor.boneStructure, right.appearanceDescriptor.boneStructure, `${pair}.boneStructure`)

  const featureDifferences = [
    normalizeTextForCompare(left.appearanceDescriptor.eyes) !== normalizeTextForCompare(right.appearanceDescriptor.eyes),
    normalizeTextForCompare(left.appearanceDescriptor.nose) !== normalizeTextForCompare(right.appearanceDescriptor.nose),
    normalizeTextForCompare(left.appearanceDescriptor.lips) !== normalizeTextForCompare(right.appearanceDescriptor.lips),
  ].filter(Boolean).length
  if (featureDifferences < 2) {
    throw new Error(`CHARACTER_CASTING_PLAN_INSUFFICIENT_DIVERSITY:${pair}.eyesNoseLips`)
  }

  const hasBodyOrPostureDifference =
    normalizeTextForCompare(left.appearanceDescriptor.bodyType) !== normalizeTextForCompare(right.appearanceDescriptor.bodyType)
    || normalizeTextForCompare(left.appearanceDescriptor.posture) !== normalizeTextForCompare(right.appearanceDescriptor.posture)
  if (!hasBodyOrPostureDifference) {
    throw new Error(`CHARACTER_CASTING_PLAN_INSUFFICIENT_DIVERSITY:${pair}.bodyTypeOrPosture`)
  }
}

function assertPlanDiversity(plans: CharacterCastingPlanSet): void {
  assertDescriptorDiversity(plans[0], plans[1])
  assertDescriptorDiversity(plans[0], plans[2])
  assertDescriptorDiversity(plans[1], plans[2])
}

export function normalizeCharacterCastingPlanDocument(value: unknown): CharacterCastingPlanDocument {
  if (!isRecord(value)) throw new Error('CHARACTER_CASTING_PLAN_INVALID:root')
  assertOnlyKnownKeys(value, ['characterDNA', 'castingDirections', 'diversityCheck'], 'root')
  const characterDNA = normalizeCharacterDNA(value.characterDNA)
  const rawDirections = value.castingDirections
  if (!Array.isArray(rawDirections) || rawDirections.length !== 3) {
    throw new Error('CHARACTER_CASTING_PLAN_INVALID:castingDirections')
  }
  const directions: CharacterCastingPlanSet = [
    normalizeCastingDirection(rawDirections[0], 'A', 'castingDirections.0'),
    normalizeCastingDirection(rawDirections[1], 'B', 'castingDirections.1'),
    normalizeCastingDirection(rawDirections[2], 'C', 'castingDirections.2'),
  ]
  assertPlanDiversity(directions)
  return {
    characterDNA,
    castingDirections: directions,
    diversityCheck: normalizeDiversityCheck(value.diversityCheck),
  }
}

export function normalizeCharacterCastingPlans(value: unknown): CharacterCastingPlanSet {
  return normalizeCharacterCastingPlanDocument(value).castingDirections
}

function compactText(value: string, limit: number): string {
  const normalized = value.replace(/\s+/g, ' ').trim()
  if (normalized.length <= limit) return normalized
  return `${normalized.slice(0, limit).trim()}...`
}

export function buildCharacterCastingPlanRequest(input: {
  readonly characterName: string
  readonly baseDescriptions: readonly string[]
  readonly screenplayText: string | null
  readonly locale: Locale
}): string {
  const english = input.locale === 'en'
  const descriptionText = input.baseDescriptions
    .filter((item) => item.trim())
    .map((item, index) => english
      ? `Existing appearance/story requirement ${index + 1}: ${item.trim()}`
      : `方案描述 ${index + 1}: ${item.trim()}`)
    .join('\n')
  return [
    english ? `Character name: ${input.characterName}` : `角色名：${input.characterName}`,
    descriptionText
      ? english
        ? `Existing character appearance / story requirement:\n${descriptionText}`
        : `已有角色形象/剧情需求：\n${descriptionText}`
      : '',
    input.screenplayText
      ? english
        ? `Screenplay text:\n${compactText(input.screenplayText, 6000)}`
        : `剧本文本：\n${compactText(input.screenplayText, 6000)}`
      : '',
  ].filter(Boolean).join('\n\n')
}

function buildPlanPrompt(input: CharacterCastingPlanInput, previousFailure?: string): string {
  const title = compactText(input.selectedVisualReferenceStyle.title, 80)
  const description = compactText(input.selectedVisualReferenceStyle.description, 240)
  const retryBlock = previousFailure
    ? [
        '',
        input.locale === 'en'
          ? `Previous output failed validation and must be rewritten. Failure: ${previousFailure}`
          : `上一次输出未通过校验，必须重写。失败原因：${previousFailure}`,
      ].join('\n')
    : ''

  if (input.locale === 'en') {
    return [
      'Refactor the same screenplay-role casting process into a strict five-step JSON pipeline.',
      'Important: do not directly generate three images from the script. First create Character DNA, then Casting Directions, then Appearance Descriptors, then Image Prompts, then Diversity Judge.',
      '',
      'Role request from the screenplay:',
      input.characterRequest,
      '',
      'Selected visual reference case, the only style source:',
      `Title: ${title}`,
      `Description: ${description}`,
      '',
      'Step 1. Character DNA Generator:',
      'Generate the underlying role DNA from screenplay, role function, relationships, and story style. This layer must NOT describe concrete facial features.',
      'characterDNA may only contain: ageRange, gender, ethnicityRegion, socialClass, occupation, temperament, coreWound, desireNeed, narrativeFunction, bodyEnergy, styleCompatibility.',
      '',
      'Step 2. Casting Space Planner:',
      'Create exactly three mutually exclusive casting directions A/B/C. They must all fit the same DNA but have clearly different visual aura.',
      'Do not vary only hair or clothes. Each direction must include a different faceFamily, bodyType, emotionalTemperature, and screenPresence.',
      '',
      'Step 3. Appearance Descriptor Generator:',
      'For each direction, create a concrete appearanceDescriptor with faceShape, boneStructure, eyes, nose, lips, skinTexture, hairstyle, bodyType, posture, wardrobe, visualKeywords.',
      'Keep fixed across all three: age range, social class, occupation credibility, core temperament, narrative function, and the selected visual-reference world style.',
      '',
      'Step 4. Image Prompt Builder:',
      'Convert each appearanceDescriptor into an independent imagePrompt for one contact-sheet/look-test image.',
      'Each imagePrompt must explicitly include the exact sentence: "This is casting alternative A/B/C for the same character." using the matching letter.',
      'Each imagePrompt must also include the exact phrase: "same character DNA, different actor-like interpretation."',
      '',
      'Step 5. Diversity Judge:',
      'Before returning, compare A/B, A/C, and B/C. If any two are insufficiently different, rewrite the weak direction before returning.',
      'Passing criteria: different faceShape; different boneStructure; at least two of eyes/nose/lips differ; bodyType or posture differs; screenPresence differs; Character DNA does not drift.',
      '',
      'Return JSON only with this exact shape:',
      '{"characterDNA":{"ageRange":"","gender":"","ethnicityRegion":"","socialClass":"","occupation":"","temperament":"","coreWound":"","desireNeed":"","narrativeFunction":"","bodyEnergy":"","styleCompatibility":""},"castingDirections":[{"id":"A","directionName":"","interpretationLogic":"","faceFamily":"","bodyType":"","emotionalTemperature":"","screenPresence":"","appearanceDescriptor":{"faceShape":"","boneStructure":"","eyes":"","nose":"","lips":"","skinTexture":"","hairstyle":"","bodyType":"","posture":"","wardrobe":"","visualKeywords":[""]},"imagePrompt":""},{"id":"B","directionName":"","interpretationLogic":"","faceFamily":"","bodyType":"","emotionalTemperature":"","screenPresence":"","appearanceDescriptor":{"faceShape":"","boneStructure":"","eyes":"","nose":"","lips":"","skinTexture":"","hairstyle":"","bodyType":"","posture":"","wardrobe":"","visualKeywords":[""]},"imagePrompt":""},{"id":"C","directionName":"","interpretationLogic":"","faceFamily":"","bodyType":"","emotionalTemperature":"","screenPresence":"","appearanceDescriptor":{"faceShape":"","boneStructure":"","eyes":"","nose":"","lips":"","skinTexture":"","hairstyle":"","bodyType":"","posture":"","wardrobe":"","visualKeywords":[""]},"imagePrompt":""}],"diversityCheck":{"AB":"","AC":"","BC":"","passed":true}}',
      retryBlock,
    ].join('\n')
  }

  return [
    '请把同一个剧本角色的选角定妆流程重构成严格的五步 JSON 管线。',
    '重要：不要直接从剧本生成三张图。必须先生成 Character DNA，再生成 Casting Directions，再生成 Appearance Descriptors，再生成 Image Prompts，最后做 Diversity Judge。',
    '',
    '来自剧本的角色需求：',
    input.characterRequest,
    '',
    '已选视觉参考案例，唯一风格来源：',
    `标题：${title}`,
    `描述：${description}`,
    '',
    '1. Character DNA Generator：',
    '根据剧本、角色功能、人物关系、故事风格生成底层角色信息。这一层禁止生成具体五官。',
    'characterDNA 只能包含：ageRange、gender、ethnicityRegion、socialClass、occupation、temperament、coreWound、desireNeed、narrativeFunction、bodyEnergy、styleCompatibility。',
    '',
    '2. Casting Space Planner：',
    '基于 Character DNA 生成 3 个互斥的 casting directions：A/B/C。三个方向都必须符合角色本质，但视觉气质明显不同。',
    '不允许只做发型/衣服微调。每个 direction 必须有不同的 faceFamily、bodyType、emotionalTemperature、screenPresence。',
    '',
    '3. Appearance Descriptor Generator：',
    '为每个 casting direction 生成具体 appearanceDescriptor，必须包含 faceShape、boneStructure、eyes、nose、lips、skinTexture、hairstyle、bodyType、posture、wardrobe、visualKeywords。',
    '三组必须共同保持：年龄区间、社会阶层、职业可信度、人物核心气质、剧本功能、已选视觉参考案例的世界观风格。',
    '',
    '4. Image Prompt Builder：',
    '把每组 appearanceDescriptor 转成独立的 imagePrompt，用于单张 contact sheet / look-test sheet 生图。',
    '每个 imagePrompt 必须明确包含英文原句：This is casting alternative A/B/C for the same character. 其中字母必须匹配当前方案。',
    '每个 imagePrompt 还必须包含英文原句：same character DNA, different actor-like interpretation.',
    '',
    '5. Diversity Judge：',
    '返回前检查 A/B、A/C、B/C。如果任意两组之间差异不足，必须先重写薄弱方向再返回。',
    '通过标准：faceShape 不同；boneStructure 不同；eyes / nose / lips 至少两项不同；bodyType 或 posture 至少一项不同；screenPresence 不同；Character DNA 不能漂移。',
    '',
    '只返回 JSON，结构必须完全如下：',
    '{"characterDNA":{"ageRange":"","gender":"","ethnicityRegion":"","socialClass":"","occupation":"","temperament":"","coreWound":"","desireNeed":"","narrativeFunction":"","bodyEnergy":"","styleCompatibility":""},"castingDirections":[{"id":"A","directionName":"","interpretationLogic":"","faceFamily":"","bodyType":"","emotionalTemperature":"","screenPresence":"","appearanceDescriptor":{"faceShape":"","boneStructure":"","eyes":"","nose":"","lips":"","skinTexture":"","hairstyle":"","bodyType":"","posture":"","wardrobe":"","visualKeywords":[""]},"imagePrompt":""},{"id":"B","directionName":"","interpretationLogic":"","faceFamily":"","bodyType":"","emotionalTemperature":"","screenPresence":"","appearanceDescriptor":{"faceShape":"","boneStructure":"","eyes":"","nose":"","lips":"","skinTexture":"","hairstyle":"","bodyType":"","posture":"","wardrobe":"","visualKeywords":[""]},"imagePrompt":""},{"id":"C","directionName":"","interpretationLogic":"","faceFamily":"","bodyType":"","emotionalTemperature":"","screenPresence":"","appearanceDescriptor":{"faceShape":"","boneStructure":"","eyes":"","nose":"","lips":"","skinTexture":"","hairstyle":"","bodyType":"","posture":"","wardrobe":"","visualKeywords":[""]},"imagePrompt":""}],"diversityCheck":{"AB":"","AC":"","BC":"","passed":true}}',
    retryBlock,
  ].join('\n')
}

async function executePlanGeneration(
  input: CharacterCastingPlanInput,
  previousFailure?: string,
): Promise<CharacterCastingPlanDocument> {
  const completion = await executeAiTextStep({
    userId: input.userId,
    model: input.analysisModel,
    projectId: input.projectId,
    action: 'character_casting_plan_generate',
    messages: [{ role: 'user', content: buildPlanPrompt(input, previousFailure) }],
    temperature: 0.35,
    reasoning: false,
    meta: {
      stepId: 'character_casting_plan',
      stepTitle: input.locale === 'en' ? 'Generate casting DNA and alternatives' : '生成角色 DNA 与选角方向',
      stepIndex: 1,
      stepTotal: 1,
    },
  })
  return normalizeCharacterCastingPlanDocument(safeParseJsonObject(completion.text))
}

export async function generateCharacterCastingPlanDocument(
  input: CharacterCastingPlanInput,
): Promise<CharacterCastingPlanDocument> {
  try {
    return await executePlanGeneration(input)
  } catch (error) {
    const message = error instanceof Error ? error.message : 'unknown validation error'
    if (!message.startsWith('CHARACTER_CASTING_PLAN_INSUFFICIENT_DIVERSITY')) {
      throw error
    }
    return executePlanGeneration(input, message)
  }
}

export async function generateCharacterCastingPlans(
  input: CharacterCastingPlanInput,
): Promise<CharacterCastingPlanSet> {
  return (await generateCharacterCastingPlanDocument(input)).castingDirections
}

function formatList(items: readonly string[]): string {
  return items.map((item) => `- ${item}`).join('\n')
}

export function renderCharacterCastingPlanPromptBlock(input: {
  readonly plan: CharacterCastingCandidatePlan
  readonly locale: Locale
}): string {
  const plan = input.plan
  const descriptor = plan.appearanceDescriptor
  if (input.locale === 'en') {
    return [
      `Casting alternative ${plan.id}: ${plan.directionName}`,
      `Interpretation logic: ${plan.interpretationLogic}`,
      `Face family: ${plan.faceFamily}`,
      `Body type: ${plan.bodyType}`,
      `Emotional temperature: ${plan.emotionalTemperature}`,
      `Screen presence: ${plan.screenPresence}`,
      'Appearance descriptor:',
      `- Face shape: ${descriptor.faceShape}`,
      `- Bone structure: ${descriptor.boneStructure}`,
      `- Eyes: ${descriptor.eyes}`,
      `- Nose: ${descriptor.nose}`,
      `- Lips: ${descriptor.lips}`,
      `- Skin texture: ${descriptor.skinTexture}`,
      `- Hairstyle: ${descriptor.hairstyle}`,
      `- Body type: ${descriptor.bodyType}`,
      `- Posture: ${descriptor.posture}`,
      `- Wardrobe: ${descriptor.wardrobe}`,
      'Visual keywords:',
      formatList(descriptor.visualKeywords),
      `Independent image prompt for this alternative: ${plan.imagePrompt}`,
      'Same-character lock: preserve the shared Character DNA only; do not average this actor-like interpretation with alternatives A/B/C.',
    ].join('\n')
  }
  return [
    `选角方向 ${plan.id}：${plan.directionName}`,
    `解释逻辑：${plan.interpretationLogic}`,
    `脸部家族：${plan.faceFamily}`,
    `体型方向：${plan.bodyType}`,
    `情绪温度：${plan.emotionalTemperature}`,
    `银幕存在感：${plan.screenPresence}`,
    '具体形象描述：',
    `- faceShape：${descriptor.faceShape}`,
    `- boneStructure：${descriptor.boneStructure}`,
    `- eyes：${descriptor.eyes}`,
    `- nose：${descriptor.nose}`,
    `- lips：${descriptor.lips}`,
    `- skinTexture：${descriptor.skinTexture}`,
    `- hairstyle：${descriptor.hairstyle}`,
    `- bodyType：${descriptor.bodyType}`,
    `- posture：${descriptor.posture}`,
    `- wardrobe：${descriptor.wardrobe}`,
    '视觉关键词：',
    formatList(descriptor.visualKeywords),
    `本方向独立生图 prompt：${plan.imagePrompt}`,
    '同角色锁定：只保持共用 Character DNA；不要把这个演员式诠释与 A/B/C 其他方案平均混合。',
  ].join('\n')
}
