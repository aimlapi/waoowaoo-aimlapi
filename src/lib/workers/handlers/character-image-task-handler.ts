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
  type CharacterAppearanceCandidateMetadata,
} from '@/types/character-casting'

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

interface CharacterImageDb {
  characterAppearance: {
    findUnique(args: Record<string, unknown>): Promise<CharacterAppearanceWithCharacter | null>
    findFirst(args: Record<string, unknown>): Promise<PrimaryAppearanceRecord | null>
    update(args: Record<string, unknown>): Promise<unknown>
  }
  projectCharacter: {
    findUnique(args: Record<string, unknown>): Promise<CharacterRecord | null>
  }
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

  if (appearanceId) {
    const appearanceWithCharacter = await db.characterAppearance.findUnique({
      where: { id: appearanceId },
      include: { character: true },
    })
    if (appearanceWithCharacter) {
      appearance = appearanceWithCharacter
    }
  }

  const characterId = typeof payload.id === 'string' ? payload.id : null
  if (!appearance && characterId) {
    const character = await db.projectCharacter.findUnique({
      where: { id: characterId },
      include: { appearances: { orderBy: { appearanceIndex: 'asc' } } },
    })
    appearance = character?.appearances?.[0] || null
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

  const imageUrls = parseImageUrls(appearance.imageUrls, 'characterAppearance.imageUrls')
  const nextImageUrls = [...imageUrls]

  for (let i = 0; i < indexes.length; i++) {
    const index = indexes[i]
    const raw = baseDescriptions[index] || baseDescriptions[0]
    const metadata = candidateMetadata[index] ?? candidateMetadata[0] ?? null
    const rawWithCastingStills = `${raw}${buildCastingStillPromptBlock(metadata, job.data.locale)}`
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
    },
  })

  return {
    appearanceId: appearance.id,
    imageCount: nextImageUrls.filter(Boolean).length,
    imageUrl: mainImage || null,
  }
}
