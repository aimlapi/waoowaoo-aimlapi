import { type Job } from 'bullmq'
import { prisma } from '@/lib/prisma'
import { CHARACTER_ASSET_IMAGE_RATIO, addCharacterPromptSuffix, PRIMARY_APPEARANCE_INDEX } from '@/lib/constants'
import { type TaskJobData } from '@/lib/task/types'
import { encodeImageUrls } from '@/lib/contracts/image-urls-contract'
import { normalizeImageGenerationCount } from '@/lib/image-generation/count'
import { reportTaskProgress } from '../shared'
import {
  assertTaskActive,
  getProjectModels,
  toSignedUrlIfCos,
} from '../utils'
import { normalizeOptionalReferenceImagesForGeneration } from '@/lib/media/outbound-image'
import {
  appendSelectedVisualReferenceStylePromptBlock,
  requireSelectedVisualReferenceStyle,
} from '@/lib/visual-reference-cases/selected-style'
import {
  AnyObj,
  generateCleanImageToStorage,
  parseImageUrls,
  parseJsonStringArray,
  pickFirstString,
} from './image-task-handler-shared'
import {
  parseAppearanceCandidateMetadata,
  stringifyAppearanceCandidateMetadata,
  type CharacterAppearanceCandidateMetadata,
} from '@/types/character-casting'
import {
  generateCharacterCastingPlanDocument,
  type CharacterAppearanceDescriptor,
  type CharacterCastingCandidatePlan,
  type CharacterCastingPlanDocument,
  type CharacterCastingPlanSet,
} from '@/lib/character-casting/casting-plan'

interface CharacterAppearanceRecord {
  id: string
  characterId: string
  appearanceIndex: number
  descriptions: string | null
  description: string | null
  descriptionMetadata?: string | null
  imageUrls: string | null
  selectedIndex: number | null
  imageUrl: string | null
  changeReason: string | null
}

function buildCastingStillPromptBlock(
  metadata: CharacterAppearanceCandidateMetadata | null,
  locale: string | null | undefined,
): string {
  const stills = metadata?.castingStills ?? []
  if (stills.length === 0) return ''

  const details = stills.map((still, index) => {
    const parts = [
      `${index + 1}. ${still.title}`,
      still.prompt,
      still.expression ? `expression: ${still.expression}` : '',
      still.prop ? `prop: ${still.prop}` : '',
      still.background ? `background: ${still.background}` : '',
      still.purpose ? `purpose: ${still.purpose}` : '',
    ].filter(Boolean)
    return parts.join('；')
  }).join('\n')

  if (locale?.startsWith('en')) {
    return [
      '',
      'Casting still requirements:',
      'Generate this character as a casting contact sheet. Keep the same identity, facial structure, body profile, marks, assistive devices, scars, and tattoos consistent across every panel. Include neutral identity views plus the following expression, alternate costume, prop, and background stills. Costume stills must visibly change outfit materials, layers, or styling while preserving the same role identity. At least one background still must use a concrete non-white story setting, and no panel may be blank. These stills are casting material only; do not let props, costumes, or backgrounds replace the core character design.',
      details,
    ].join('\n')
  }

  return [
    '',
    '【选角定妆素材要求】',
    '请将该角色生成成一张选角定妆 contact sheet。每个小图必须保持同一角色身份、五官结构、体型、标记、辅助器具、疤痕和纹身一致。除中性身份照外，补充以下表情、换装、道具和背景定妆照。换装定妆必须清楚呈现服装材质、层次或穿搭变化，但角色身份不能变。至少一个背景定妆必须使用具体的非白底故事场景，所有小图都不能留空。它们只作为选角素材，不得让道具、服装或背景覆盖核心人物设计。',
    details,
  ].join('\n')
}

interface CharacterAppearanceWithCharacter extends CharacterAppearanceRecord {
  character: {
    name: string
  }
}

interface CharacterRecord {
  id: string
  name: string
  appearances: CharacterAppearanceRecord[]
}

interface PrimaryAppearanceRecord {
  imageUrl: string | null
  imageUrls: string | null
  selectedIndex: number | null
}

interface ScreenplayTextRecord {
  screenplayText: string | null
}

interface CharacterImageDb {
  characterAppearance: {
    findUnique(args: Record<string, unknown>): Promise<CharacterAppearanceWithCharacter | null>
    findFirst(args: Record<string, unknown>): Promise<PrimaryAppearanceRecord | null>
    update(args: Record<string, unknown>): Promise<unknown>
  }
  projectCharacter: {
    findUnique(args: Record<string, unknown>): Promise<CharacterRecord | null>
  }
  projectEditScreenplay: {
    findFirst(args: Record<string, unknown>): Promise<ScreenplayTextRecord | null>
  }
}

function isEnglishLocale(locale: string | null | undefined): boolean {
  return locale?.startsWith('en') === true
}

function compactText(value: string, limit: number): string {
  const normalized = value.replace(/\s+/g, ' ').trim()
  if (normalized.length <= limit) return normalized
  return `${normalized.slice(0, limit).trim()}...`
}

function buildCharacterRequestForCastingPlan(input: {
  readonly characterName: string
  readonly baseDescriptions: readonly string[]
  readonly screenplayText: string | null
  readonly locale: string | null | undefined
}): string {
  const english = isEnglishLocale(input.locale)
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

function shouldUseCastingPlanForCharacterImages(input: {
  readonly appearanceIndex: number
  readonly indexes: readonly number[]
}): boolean {
  return input.appearanceIndex === PRIMARY_APPEARANCE_INDEX
    && input.indexes.length > 0
    && input.indexes.every((index) => Number.isInteger(index) && index >= 0 && index < 3)
}

function describeAppearanceDescriptor(descriptor: CharacterAppearanceDescriptor): string {
  return [
    `faceShape: ${descriptor.faceShape}`,
    `boneStructure: ${descriptor.boneStructure}`,
    `eyes: ${descriptor.eyes}`,
    `nose: ${descriptor.nose}`,
    `lips: ${descriptor.lips}`,
    `skinTexture: ${descriptor.skinTexture}`,
    `hairstyle: ${descriptor.hairstyle}`,
    `bodyType: ${descriptor.bodyType}`,
    `posture: ${descriptor.posture}`,
    `wardrobe: ${descriptor.wardrobe}`,
    `visualKeywords: ${descriptor.visualKeywords.join('；')}`,
  ].join('\n')
}

function buildCastingPlanDescription(
  plan: CharacterCastingCandidatePlan,
  locale: string | null | undefined,
): string {
  if (isEnglishLocale(locale)) {
    return [
      `Casting direction ${plan.id}: ${plan.directionName}`,
      `Interpretation logic: ${plan.interpretationLogic}`,
      `Face family: ${plan.faceFamily}`,
      `Body direction: ${plan.bodyType}`,
      `Emotional temperature: ${plan.emotionalTemperature}`,
      `Screen presence: ${plan.screenPresence}`,
      describeAppearanceDescriptor(plan.appearanceDescriptor),
    ].join('\n')
  }

  return [
    `选角方向 ${plan.id}: ${plan.directionName}`,
    `解释逻辑：${plan.interpretationLogic}`,
    `脸部家族：${plan.faceFamily}`,
    `体型方向：${plan.bodyType}`,
    `情绪温度：${plan.emotionalTemperature}`,
    `银幕存在感：${plan.screenPresence}`,
    describeAppearanceDescriptor(plan.appearanceDescriptor),
  ].join('\n')
}

function buildCastingPlanMetadata(
  plans: CharacterCastingPlanSet,
  locale: string | null | undefined,
): CharacterAppearanceCandidateMetadata[] {
  return plans.map((plan) => {
    const descriptor = plan.appearanceDescriptor
    return {
      description: buildCastingPlanDescription(plan, locale),
      visualTraits: {
        face: [
          descriptor.faceShape,
          descriptor.boneStructure,
          descriptor.eyes,
          descriptor.nose,
          descriptor.lips,
        ].join('；'),
        hair: descriptor.hairstyle,
        body: [descriptor.bodyType, descriptor.posture].join('；'),
        costume: descriptor.wardrobe,
        makeupAndAccessories: descriptor.visualKeywords.join('；'),
        skin: descriptor.skinTexture,
        visibleState: [plan.emotionalTemperature, plan.screenPresence].join('；'),
        accessibility: '',
        tattoosAndMarks: '',
        scars: '',
      },
      castingNotes: {
        score: null,
        strengths: [
          isEnglishLocale(locale)
            ? `Character DNA stays fixed; direction ${plan.id} uses distinct face family / body type / screen presence.`
            : `Character DNA 保持一致，方案 ${plan.id} 使用独立 face family / body type / screen presence。`,
        ],
        risks: [],
        recommendation: plan.interpretationLogic,
        fitTags: [
          `direction:${plan.id}`,
          `faceFamily:${plan.faceFamily}`,
          `screenPresence:${plan.screenPresence}`,
        ],
      },
      castingStills: [],
    }
  })
}

async function readScreenplayText(input: {
  readonly db: CharacterImageDb
  readonly projectId: string
  readonly episodeId?: string | null
}): Promise<string | null> {
  const row = await input.db.projectEditScreenplay.findFirst({
    where: {
      projectId: input.projectId,
      ...(input.episodeId ? { episodeId: input.episodeId } : {}),
      status: 'ready',
    },
    orderBy: { updatedAt: 'desc' },
    select: { screenplayText: true },
  })
  const text = row?.screenplayText?.trim()
  return text || null
}

export async function handleCharacterImageTask(job: Job<TaskJobData>) {
  const db = prisma as unknown as CharacterImageDb
  const payload = (job.data.payload || {}) as AnyObj
  const projectId = job.data.projectId
  const userId = job.data.userId
  const models = await getProjectModels(projectId, userId)
  const modelId = models.characterModel
  if (!modelId) throw new Error('Character model not configured')

  const appearanceId = pickFirstString(job.data.targetId, payload.appearanceId)
  let appearance: CharacterAppearanceRecord | null = null
  let characterName = ''

  if (appearanceId) {
    const appearanceWithCharacter = await db.characterAppearance.findUnique({
      where: { id: appearanceId },
      include: { character: true },
    })
    if (appearanceWithCharacter) {
      appearance = appearanceWithCharacter
      characterName = appearanceWithCharacter.character.name
    }
  }

  const characterId = typeof payload.id === 'string' ? payload.id : null
  if (!appearance && characterId) {
    const character = await db.projectCharacter.findUnique({
      where: { id: characterId },
      include: { appearances: { orderBy: { appearanceIndex: 'asc' } } },
    })
    appearance = character?.appearances?.[0] || null
    characterName = character?.name || characterName
  }

  if (!appearance) throw new Error('Character appearance not found')

  const selectedVisualReferenceStyle = await requireSelectedVisualReferenceStyle({
    projectId,
    episodeId: job.data.episodeId,
  })
  const descriptions = parseJsonStringArray(appearance.descriptions)
  const baseDescriptions = descriptions.length > 0 ? descriptions : [appearance.description || '']
  const candidateMetadata = parseAppearanceCandidateMetadata(appearance.descriptionMetadata)

  // 子形象（不是主形象）生成时，引用主形象图片保持一致性
  const primaryReferenceInputs: string[] = []
  if (appearance.appearanceIndex > PRIMARY_APPEARANCE_INDEX) {
    const primaryAppearance = await db.characterAppearance.findFirst({
      where: {
        characterId: appearance.characterId,
        appearanceIndex: PRIMARY_APPEARANCE_INDEX,
      },
      select: { imageUrl: true, imageUrls: true, selectedIndex: true },
    })
    if (primaryAppearance) {
      const primaryImageUrls = parseImageUrls(primaryAppearance.imageUrls, 'primaryAppearance.imageUrls')
      const selectedIndex = primaryAppearance.selectedIndex
      const selectedKey = typeof selectedIndex === 'number' ? primaryImageUrls[selectedIndex] : null
      const fallbackKey = primaryImageUrls.find((value) => typeof value === 'string' && value) || primaryAppearance.imageUrl
      const primaryKey = (typeof selectedKey === 'string' && selectedKey) ? selectedKey : fallbackKey
      const primaryMainUrl = primaryKey ? toSignedUrlIfCos(primaryKey, 3600) : null
      if (primaryMainUrl) primaryReferenceInputs.push(primaryMainUrl)
    }
  }
  const visualStyleReferenceInputs = selectedVisualReferenceStyle?.imageUrl
    ? [selectedVisualReferenceStyle.imageUrl]
    : []
  const primaryReferenceImages = await normalizeOptionalReferenceImagesForGeneration([
    ...visualStyleReferenceInputs,
    ...primaryReferenceInputs,
  ], {
    context: { taskType: String(job.data.type), scope: 'character.primaryAppearance' },
  })

  const singleIndex = payload.imageIndex ?? payload.descriptionIndex
  const count = normalizeImageGenerationCount('character', payload.count)
  const indexes = singleIndex !== undefined
    ? [Number(singleIndex)]
    : Array.from({ length: count }, (_value, index) => index)

  let castingPlanDocument: CharacterCastingPlanDocument | null = null
  let castingPlans: CharacterCastingPlanSet | null = null
  if (shouldUseCastingPlanForCharacterImages({
    appearanceIndex: appearance.appearanceIndex,
    indexes,
  })) {
    const analysisModel = models.analysisModel
    if (!analysisModel) throw new Error('Analysis model not configured')
    const screenplayText = await readScreenplayText({
      db,
      projectId,
      episodeId: job.data.episodeId,
    })
    castingPlanDocument = await generateCharacterCastingPlanDocument({
      userId,
      projectId,
      locale: job.data.locale,
      analysisModel,
      characterRequest: buildCharacterRequestForCastingPlan({
        characterName: characterName || (isEnglishLocale(job.data.locale) ? 'Unnamed character' : '未命名角色'),
        baseDescriptions,
        screenplayText,
        locale: job.data.locale,
      }),
      selectedVisualReferenceStyle,
    })
    castingPlans = castingPlanDocument.castingDirections
  }

  const imageUrls = parseImageUrls(appearance.imageUrls, 'characterAppearance.imageUrls')
  const nextImageUrls = [...imageUrls]

  for (let i = 0; i < indexes.length; i++) {
    const index = indexes[i]
    const castingPlan = castingPlans?.[index]
    const raw = castingPlan?.imagePrompt || baseDescriptions[index] || baseDescriptions[0]
    const metadata = candidateMetadata[index] ?? candidateMetadata[0] ?? null
    const rawWithCastingStills = castingPlan
      ? [
          raw,
          '',
          job.data.locale === 'en'
            ? 'This prompt was produced by the Character DNA -> Casting Directions -> Appearance Descriptors -> Image Prompts -> Diversity Judge pipeline.'
            : '该提示词来自 Character DNA -> Casting Directions -> Appearance Descriptors -> Image Prompts -> Diversity Judge 流程。',
          buildCastingPlanDescription(castingPlan, job.data.locale),
        ].join('\n')
      : `${raw}${buildCastingStillPromptBlock(metadata, job.data.locale)}`
    const promptBase = addCharacterPromptSuffix(rawWithCastingStills)
    const prompt = appendSelectedVisualReferenceStylePromptBlock({
      prompt: promptBase,
      style: selectedVisualReferenceStyle,
      locale: job.data.locale,
    })

    await reportTaskProgress(job, 15 + Math.floor((i / Math.max(indexes.length, 1)) * 55), {
      stage: 'generate_character_image',
      index,
    })

    const options: {
      referenceImages?: string[]
      aspectRatio: string
    } = {
      aspectRatio: CHARACTER_ASSET_IMAGE_RATIO,
    }
    if (primaryReferenceImages.length > 0) {
      options.referenceImages = primaryReferenceImages
    }

    const imageKey = await generateCleanImageToStorage({
      job,
      userId,
      modelId,
      prompt,
      targetId: `${appearance.id}-${index}`,
      keyPrefix: 'character',
      options,
    })

    while (nextImageUrls.length <= index) {
      nextImageUrls.push('')
    }
    nextImageUrls[index] = imageKey
  }

  const selectedIndex = appearance.selectedIndex
  const fallbackMain = nextImageUrls.find((url) => typeof url === 'string' && url) || appearance.imageUrl
  const mainImage = selectedIndex !== null && selectedIndex !== undefined && nextImageUrls[selectedIndex]
    ? nextImageUrls[selectedIndex]
    : fallbackMain

  await assertTaskActive(job, 'persist_character_image')
  await db.characterAppearance.update({
    where: { id: appearance.id },
    data: {
      imageUrls: encodeImageUrls(nextImageUrls),
      imageUrl: mainImage || null,
      ...(castingPlans
        ? {
            description: buildCastingPlanDescription(castingPlans[selectedIndex ?? 0] ?? castingPlans[0], job.data.locale),
            descriptions: JSON.stringify(castingPlans.map((plan) => buildCastingPlanDescription(plan, job.data.locale))),
            descriptionMetadata: stringifyAppearanceCandidateMetadata(buildCastingPlanMetadata(castingPlans, job.data.locale)),
            changeReason: isEnglishLocale(job.data.locale) ? 'Casting look' : '选角定妆',
          }
        : {}),
    },
  })

  return {
    appearanceId: appearance.id,
    imageCount: nextImageUrls.filter(Boolean).length,
    imageUrl: mainImage || null,
    ...(castingPlanDocument ? { castingPlan: castingPlanDocument } : {}),
  }
}
