import type { NextRequest } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { ApiError } from '@/lib/api-errors'
import type { Locale } from '@/i18n/routing'
import { executeAiTextStep } from '@/lib/ai-exec/engine'
import { getProjectModelConfig } from '@/lib/config-service'
import { submitAssetGenerateTask } from '@/lib/assets/services/asset-actions'
import { TASK_TYPE } from '@/lib/task/types'
import { decodeImageUrlsFromDb, encodeImageUrls } from '@/lib/contracts/image-urls-contract'
import { PRIMARY_APPEARANCE_INDEX } from '@/lib/constants'

const screenplayAssetKindSchema = z.enum(['character', 'location', 'prop'])
type ScreenplayAssetKind = z.infer<typeof screenplayAssetKindSchema>

const screenplayAssetRequirementSchema = z.object({
  kind: screenplayAssetKindSchema,
  name: z.string().trim().min(1),
  description: z.string().trim().min(8),
}).strict()

const screenplayAssetRequirementsSchema = z.object({
  assets: z.array(screenplayAssetRequirementSchema).min(1).max(40),
}).strict()

type ScreenplayAssetRequirement = z.infer<typeof screenplayAssetRequirementSchema>

type ExistingAssetRef = {
  readonly id: string
  readonly hasOutput: boolean
  readonly taskType: typeof TASK_TYPE.IMAGE_CHARACTER | typeof TASK_TYPE.IMAGE_LOCATION
  readonly targetType: 'CharacterAppearance' | 'LocationImage'
  readonly targetId: string
}

export interface ScreenplayAssetGenerationTask {
  readonly kind: ScreenplayAssetKind
  readonly name: string
  readonly taskId: string
  readonly status: string
  readonly runId: string | null
  readonly deduped: boolean
  readonly taskType: typeof TASK_TYPE.IMAGE_CHARACTER | typeof TASK_TYPE.IMAGE_LOCATION
  readonly targetType: 'CharacterAppearance' | 'LocationImage'
  readonly targetId: string
}

export interface ScreenplayAssetGenerationResult {
  readonly success: true
  readonly async: boolean
  readonly total: number
  readonly taskIds: readonly string[]
  readonly submittedTasks: readonly ScreenplayAssetGenerationTask[]
  readonly assets: readonly {
    readonly kind: ScreenplayAssetKind
    readonly name: string
    readonly targetId: string
    readonly status: 'completed' | 'generating'
  }[]
}

type ScreenplayAssetGenerationResultAsset = ScreenplayAssetGenerationResult['assets'][number]

function normalizeName(value: string): string {
  return value.trim().toLocaleLowerCase()
}

function parseJsonObjectResponse(responseText: string): Record<string, unknown> {
  let jsonText = responseText.trim()
  jsonText = jsonText.replace(/^```json\s*/i, '').replace(/^```\s*/, '').replace(/\s*```$/, '')
  const firstBrace = jsonText.indexOf('{')
  const lastBrace = jsonText.lastIndexOf('}')
  if (firstBrace === -1 || lastBrace === -1 || lastBrace <= firstBrace) {
    throw new Error('SCREENPLAY_ASSET_JSON_INVALID')
  }
  const parsed = JSON.parse(jsonText.substring(firstBrace, lastBrace + 1)) as unknown
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('SCREENPLAY_ASSET_JSON_OBJECT_REQUIRED')
  }
  return parsed as Record<string, unknown>
}

async function extractScreenplayAssets(input: {
  readonly userId: string
  readonly projectId: string
  readonly model: string
  readonly locale: Locale
  readonly screenplayText: string
  readonly userPrompt: string
}): Promise<ScreenplayAssetRequirement[]> {
  const prompt = [
    '你是影视资产规划 Agent。只从剧本事实里抽取后续分镜必须复用的项目资产。',
    '只输出 JSON，不要 markdown。',
    '资产类型只能是 character、location、prop。',
    'character 描述角色稳定外观，不写临时动作、表情、镜头或剧情功能。',
    'location 描述可复用空场景，必须适合生成 720 度全景场景资产，不写主角动作。',
    'prop 描述需要持续出现、需要单独保持一致的道具；普通背景物不要抽成 prop。',
    '不要抽取导演意图、剪辑术语、摄影方案或观众视角。',
    'JSON Schema: {"assets":[{"kind":"character|location|prop","name":"string","description":"string"}]}',
    '',
    `用户创意：${input.userPrompt}`,
    '',
    '剧本正文：',
    input.screenplayText,
  ].join('\n')
  const completion = await executeAiTextStep({
    userId: input.userId,
    projectId: input.projectId,
    model: input.model,
    messages: [{ role: 'user', content: prompt }],
    temperature: 0.25,
    action: 'screenplay-assets',
    meta: {
      stepId: 'screenplay-assets',
      stepTitle: 'Extract screenplay assets',
      stepIndex: 1,
      stepTotal: 1,
    },
  })
  if (!completion.text.trim()) throw new Error('SCREENPLAY_ASSET_LLM_EMPTY')
  const parsed = screenplayAssetRequirementsSchema.parse(parseJsonObjectResponse(completion.text))
  const deduped = new Map<string, ScreenplayAssetRequirement>()
  for (const asset of parsed.assets) {
    const key = `${asset.kind}:${normalizeName(asset.name)}`
    if (deduped.has(key)) continue
    deduped.set(key, asset)
  }
  return Array.from(deduped.values())
}

async function findExistingAsset(input: {
  readonly projectId: string
  readonly kind: ScreenplayAssetKind
  readonly name: string
}): Promise<ExistingAssetRef | null> {
  const normalizedName = normalizeName(input.name)
  if (input.kind === 'character') {
    const characters = await prisma.projectCharacter.findMany({
      where: { projectId: input.projectId },
      select: {
        id: true,
        name: true,
        appearances: {
          orderBy: { appearanceIndex: 'asc' },
          take: 1,
          select: {
            id: true,
            imageUrl: true,
            imageMediaId: true,
            imageUrls: true,
          },
        },
      },
    })
    const character = characters.find((item) => normalizeName(item.name) === normalizedName)
    if (!character) return null
    const appearance = character.appearances[0]
    const imageUrls = appearance ? decodeImageUrlsFromDb(appearance.imageUrls, 'screenplayAssets.existing.character.imageUrls') : []
    const previewImageUrl = appearance?.imageUrl || imageUrls[0] || null
    return {
      id: character.id,
      hasOutput: Boolean(appearance?.imageMediaId || previewImageUrl),
      taskType: TASK_TYPE.IMAGE_CHARACTER,
      targetType: 'CharacterAppearance',
      targetId: appearance?.id ?? character.id,
    }
  }

  const locations = await prisma.projectLocation.findMany({
    where: { projectId: input.projectId, assetKind: input.kind },
    select: {
      id: true,
      name: true,
      images: {
        orderBy: { imageIndex: 'asc' },
        take: 1,
        select: {
          imageUrl: true,
          imageMediaId: true,
        },
      },
    },
  })
  const location = locations.find((item) => normalizeName(item.name) === normalizedName)
  if (!location) return null
  const image = location.images[0]
  return {
    id: location.id,
    hasOutput: Boolean(image?.imageMediaId || image?.imageUrl),
    taskType: TASK_TYPE.IMAGE_LOCATION,
    targetType: 'LocationImage',
    targetId: location.id,
  }
}

async function createRequiredAsset(input: {
  readonly projectId: string
  readonly kind: ScreenplayAssetKind
  readonly name: string
  readonly description: string
}): Promise<ExistingAssetRef> {
  if (input.kind === 'character') {
    const character = await prisma.projectCharacter.create({
      data: {
        projectId: input.projectId,
        name: input.name,
        aliases: null,
        appearances: {
          create: {
            appearanceIndex: PRIMARY_APPEARANCE_INDEX,
            changeReason: 'primary',
            description: input.description,
            descriptions: JSON.stringify([input.description]),
            imageUrls: encodeImageUrls([]),
            previousImageUrls: encodeImageUrls([]),
          },
        },
      },
      select: {
        id: true,
        appearances: {
          orderBy: { appearanceIndex: 'asc' },
          take: 1,
          select: { id: true },
        },
      },
    })
    return {
      id: character.id,
      hasOutput: false,
      taskType: TASK_TYPE.IMAGE_CHARACTER,
      targetType: 'CharacterAppearance',
      targetId: character.appearances[0]?.id ?? character.id,
    }
  }

  const location = await prisma.projectLocation.create({
    data: {
      projectId: input.projectId,
      name: input.name,
      summary: input.description,
      assetKind: input.kind,
      images: {
        create: {
          imageIndex: 0,
          description: input.description,
        },
      },
    },
    select: { id: true },
  })
  return {
    id: location.id,
    hasOutput: false,
    taskType: TASK_TYPE.IMAGE_LOCATION,
    targetType: 'LocationImage',
    targetId: location.id,
  }
}

async function submitAssetImageTask(input: {
  readonly request: NextRequest
  readonly projectId: string
  readonly episodeId: string
  readonly userId: string
  readonly locale: Locale
  readonly kind: ScreenplayAssetKind
  readonly assetId: string
}): Promise<Omit<ScreenplayAssetGenerationTask, 'kind' | 'name'>> {
  const appearance = input.kind === 'character'
    ? await prisma.characterAppearance.findFirst({
      where: { characterId: input.assetId },
      orderBy: { appearanceIndex: 'asc' },
      select: { id: true, appearanceIndex: true },
    })
    : null
  if (input.kind === 'character' && !appearance) {
    throw new Error('SCREENPLAY_ASSET_CHARACTER_APPEARANCE_NOT_FOUND')
  }

  const result = await submitAssetGenerateTask({
    request: input.request,
    kind: input.kind,
    assetId: input.assetId,
    episodeId: input.episodeId,
    body: {
      count: 1,
      ...(appearance ? {
        appearanceId: appearance.id,
        appearanceIndex: appearance.appearanceIndex,
      } : {}),
      meta: { locale: input.locale },
    },
    access: {
      scope: 'project',
      userId: input.userId,
      projectId: input.projectId,
    },
  })

  if (input.kind === 'character') {
    if (!appearance) throw new Error('SCREENPLAY_ASSET_CHARACTER_APPEARANCE_NOT_FOUND')
    return {
      taskId: result.taskId,
      status: result.status,
      runId: result.runId,
      deduped: result.deduped,
      taskType: TASK_TYPE.IMAGE_CHARACTER,
      targetType: 'CharacterAppearance',
      targetId: appearance.id,
    }
  }
  return {
    taskId: result.taskId,
    status: result.status,
    runId: result.runId,
    deduped: result.deduped,
    taskType: TASK_TYPE.IMAGE_LOCATION,
    targetType: 'LocationImage',
    targetId: input.assetId,
  }
}

export async function generateScreenplayAssets(input: {
  readonly request: NextRequest
  readonly projectId: string
  readonly userId: string
  readonly episodeId: string
  readonly locale: Locale
}): Promise<ScreenplayAssetGenerationResult> {
  const [project, screenplay, config] = await Promise.all([
    prisma.project.findFirst({
      where: { id: input.projectId, userId: input.userId },
      select: { id: true },
    }),
    prisma.projectEditScreenplay.findFirst({
      where: {
        projectId: input.projectId,
        episodeId: input.episodeId,
        status: 'ready',
      },
      orderBy: { updatedAt: 'desc' },
      select: {
        id: true,
        userPrompt: true,
        screenplayText: true,
      },
    }),
    getProjectModelConfig(input.projectId, input.userId),
  ])
  if (!project || !screenplay) throw new ApiError('NOT_FOUND')
  if (!config.analysisModel) {
    throw new ApiError('INVALID_PARAMS', { code: 'ANALYSIS_MODEL_REQUIRED', message: 'Analysis model is required' })
  }

  const requirements = await extractScreenplayAssets({
    userId: input.userId,
    projectId: input.projectId,
    model: config.analysisModel,
    locale: input.locale,
    screenplayText: screenplay.screenplayText,
    userPrompt: screenplay.userPrompt,
  })

  const submittedTasks: ScreenplayAssetGenerationTask[] = []
  const assets: ScreenplayAssetGenerationResultAsset[] = []
  for (const requirement of requirements) {
    const existing = await findExistingAsset({
      projectId: input.projectId,
      kind: requirement.kind,
      name: requirement.name,
    })
    const asset = existing ?? await createRequiredAsset({
      projectId: input.projectId,
      kind: requirement.kind,
      name: requirement.name,
      description: requirement.description,
    })
    if (asset.hasOutput) {
      assets.push({
        kind: requirement.kind,
        name: requirement.name,
        targetId: asset.id,
        status: 'completed',
      })
      continue
    }

    const submitted = await submitAssetImageTask({
      request: input.request,
      projectId: input.projectId,
      episodeId: input.episodeId,
      userId: input.userId,
      locale: input.locale,
      kind: requirement.kind,
      assetId: asset.id,
    })
    submittedTasks.push({
      kind: requirement.kind,
      name: requirement.name,
      ...submitted,
    })
    assets.push({
      kind: requirement.kind,
      name: requirement.name,
      targetId: asset.id,
      status: 'generating',
    })
  }

  return {
    success: true,
    async: submittedTasks.length > 0,
    total: requirements.length,
    taskIds: submittedTasks.map((task) => task.taskId),
    submittedTasks,
    assets,
  }
}
