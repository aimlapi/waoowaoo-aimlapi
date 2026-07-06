import { Prisma } from '@prisma/client'
import { z } from 'zod'
import type { Locale } from '@/i18n/routing'
import { ApiError } from '@/lib/api-errors'
import { chatCompletionStream } from '@/lib/ai-exec/engine'
import { getCompletionParts } from '@/lib/ai-exec/llm-helpers'
import { getProjectModelConfig } from '@/lib/config-service'
import { decodeImageUrlsFromDb } from '@/lib/contracts/image-urls-contract'
import { prisma } from '@/lib/prisma'
import { submitTask } from '@/lib/task/submitter'
import { TASK_TYPE } from '@/lib/task/types'
import { parseNullableEditScriptStyleBible } from '@/lib/edit-script/style-bible-prompt'
import type { ChatMessageContent, TextContentPart } from '@/lib/ai-registry/message-content'
import {
  directShotBlockingSchema,
  formatSceneZonesForStorage,
  sceneZoneSchema,
  validateSceneContinuity,
  type DirectShotBlocking,
  type SceneZone,
} from './scene-continuity'
import {
  formatProductionLocationsForStorage,
  panelContinuityStateSchema,
  productionLocationGroupSchema,
  productionSegmentSchema,
  sceneContinuityLoopSchema,
  segmentContinuityBibleSchema,
  validateProductionLocationGroups,
  validateProductionSegments,
  validateSceneContinuityLoops,
  validateSegmentContinuityBibles,
  type PanelContinuityState,
  type ProductionLocationGroup,
  type ProductionSegment,
  type SceneContinuityLoop,
  type SegmentContinuityBible,
} from './production-continuity'
import {
  storyboardPanelGroupSchema,
  validateStoryboardPanelGroups,
  type ValidatedStoryboardPanelGroup,
} from './panel-groups'
import {
  omittedSceneAssetSchema,
  type OmittedSceneAsset,
} from './scene-assets'

export interface GenerateScreenplayStoryboardInput {
  readonly projectId: string
  readonly episodeId: string
  readonly userId: string
  readonly locale: Locale
  readonly panelLimit?: number
  readonly generationMode?: 'replace' | 'append'
  readonly requestId?: string | null
}

export interface GenerateScreenplayStoryboardResult {
  readonly storyboardId: string
  readonly panelCount: number
  readonly panelIds: readonly string[]
  readonly imageTaskIds: readonly string[]
}

interface CharacterAsset {
  readonly characterId: string
  readonly name: string
  readonly appearanceId: string
  readonly appearanceIndex: number
  readonly appearance: string
  readonly description: string | null
  readonly imageUrl: string | null
}

interface LocationAsset {
  readonly locationId: string
  readonly name: string
  readonly summary: string | null
  readonly selectedImageId: string | null
  readonly imageUrl: string | null
  readonly imageDescription: string | null
  readonly spatialProfileJson: Prisma.JsonValue | null
  readonly spatialProfileStatus: string | null
}

interface PropAsset {
  readonly propId: string
  readonly name: string
  readonly summary: string | null
  readonly selectedImageId: string | null
  readonly imageUrl: string | null
  readonly imageDescription: string | null
}

interface PanelDraft {
  readonly panelIndex: number
  readonly panelNumber: number
  readonly productionSegmentId: string
  readonly originalOrderKey: string
  readonly screenplaySceneNumber: number
  readonly productionLocationId: string
  readonly description: string
  readonly location: string
  readonly locationId: string
  readonly sceneZoneId: string
  readonly characters: string | null
  readonly props: string | null
  readonly omittedSceneAssets: readonly OmittedSceneAsset[]
  readonly srtSegment: string
  readonly srtStart: number
  readonly srtEnd: number
  readonly duration: number
  readonly shotType: string
  readonly cameraMove: string
  readonly imagePrompt: string
  readonly videoPrompt: string
  readonly photographyRules: string
  readonly actingNotes: string | null
  readonly shotBlocking: DirectShotBlocking
  readonly panelContinuity: PanelContinuityState
}

const directPanelSchema = z.object({
  panelNumber: z.number().int().positive(),
  productionSegmentId: z.string().trim().min(1),
  sourceText: z.string().trim().min(1),
  description: z.string().trim().min(8),
  locationId: z.string().trim().min(1),
  sceneZoneId: z.string().trim().min(1),
  characters: z.array(z.string().trim().min(1)).default([]),
  props: z.array(z.string().trim().min(1)).default([]),
  omittedSceneAssets: z.array(omittedSceneAssetSchema).default([]),
  shotType: z.string().trim().min(1),
  cameraMove: z.string().trim().min(1),
  duration: z.number().positive().max(12),
  imagePrompt: z.string().trim().min(8).nullable().optional(),
  videoPrompt: z.string().trim().min(8).nullable().optional(),
  shotBlocking: directShotBlockingSchema,
  panelContinuity: panelContinuityStateSchema,
  actingNotes: z.string().trim().min(1).nullable().optional(),
}).strict()

const directStoryboardOutputSchema = z.object({
  productionLocations: z.array(productionLocationGroupSchema).min(1).max(80),
  productionSegments: z.array(productionSegmentSchema).min(1).max(80),
  segmentContinuityBibles: z.array(segmentContinuityBibleSchema).min(1).max(80),
  sceneZones: z.array(sceneZoneSchema).min(1).max(80),
  panels: z.array(directPanelSchema).min(1).max(120),
  panelGroups: z.array(storyboardPanelGroupSchema).min(1).max(120),
  sceneContinuityLoops: z.array(sceneContinuityLoopSchema).min(1).max(80),
}).strict()

type DirectStoryboardOutput = z.infer<typeof directStoryboardOutputSchema>

interface ValidatedDirectStoryboardOutput {
  readonly parsed: DirectStoryboardOutput
  readonly panelGroups: readonly ValidatedStoryboardPanelGroup[]
  readonly productionLocations: readonly ProductionLocationGroup[]
  readonly productionSegments: readonly ProductionSegment[]
  readonly segmentContinuityBibles: readonly SegmentContinuityBible[]
  readonly sceneContinuityLoops: readonly SceneContinuityLoop[]
}

const DIRECT_STORYBOARD_MAX_ATTEMPTS = 4
const DIRECT_STORYBOARD_MAX_TOKENS = 16000
const PANELS_PER_OPENING_SCENE_ESTIMATE = 6
const MIN_OPENING_SCREENPLAY_SCENES = 2
const MAX_OPENING_SCREENPLAY_SCENES = 12

interface StoryboardContinuationContext {
  readonly existingPanelCount: number
  readonly nextPanelNumber: number
  readonly nextPanelIndex: number
  readonly nextPanelGroupNumber: number
  readonly nextSrtStart: number
  readonly lastOriginalOrderKey: string
  readonly lastScreenplaySceneNumber: number
  readonly previousProductionLocations: readonly Record<string, unknown>[]
  readonly previousProductionSegments: readonly Record<string, unknown>[]
  readonly previousSceneZones: readonly Record<string, unknown>[]
  readonly productionLocationRegistry: readonly ProductionLocationRegistryEntry[]
}

interface ProductionLocationRegistryEntry {
  readonly productionLocationId: string
  readonly locationId: string
  readonly locationName: string | null
  readonly aliases: readonly string[]
  readonly stableSpatialFacts: readonly string[]
  readonly reusableAnchors: readonly string[]
  readonly stableSetDressing: readonly string[]
  readonly nonPersistentStateBans: readonly string[]
  readonly permanentSpatialLocks: {
    readonly anchorLayout: readonly string[]
    readonly screenDirectionLocks: readonly string[]
    readonly depthLayoutLocks: readonly string[]
    readonly cameraSideLocks: readonly string[]
    readonly subjectPlacementLocks: readonly string[]
    readonly forbiddenSpatialChanges: readonly string[]
  }
}

async function executeDirectStoryboardTextStep(input: {
  readonly userId: string
  readonly projectId: string
  readonly model: string
  readonly prompt: ChatMessageContent
  readonly attempt: number
}): Promise<{ readonly text: string }> {
  const completion = await chatCompletionStream(
    input.userId,
    input.model,
    [{ role: 'user', content: input.prompt }],
    {
      temperature: 0.35,
      reasoning: false,
      maxTokens: DIRECT_STORYBOARD_MAX_TOKENS,
      projectId: input.projectId,
      action: 'screenplay-storyboard-panels',
      streamStepId: 'screenplay-storyboard-panels',
      streamStepTitle: input.attempt === 1
        ? 'Generate screenplay storyboard panels'
        : 'Repair screenplay storyboard panels',
      streamStepIndex: input.attempt,
      streamStepTotal: DIRECT_STORYBOARD_MAX_ATTEMPTS,
    },
  )
  const parts = getCompletionParts(completion)
  return { text: parts.text }
}

function normalizePanelLimit(value: number | undefined): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return 12
  return Math.max(1, Math.min(120, Math.floor(value)))
}

function stringifyForPrompt(value: unknown): string {
  return JSON.stringify(value, null, 2)
}

function cacheablePromptPart(text: string): TextContentPart {
  return {
    type: 'text',
    text,
    cacheControl: { type: 'ephemeral', ttl: '1h' },
  }
}

function dynamicPromptPart(text: string): TextContentPart {
  return {
    type: 'text',
    text,
  }
}

export function selectOpeningScreenplayTextForStoryboard(input: {
  readonly screenplayText: string
  readonly panelLimit: number
}): string {
  const normalized = input.screenplayText.trim()
  const sceneWindow = Math.max(
    MIN_OPENING_SCREENPLAY_SCENES,
    Math.min(MAX_OPENING_SCREENPLAY_SCENES, Math.ceil(input.panelLimit / PANELS_PER_OPENING_SCENE_ESTIMATE)),
  )
  const headingPattern = /^##\s*场景\s*\d+[^\n]*$/gmu
  const headings = Array.from(normalized.matchAll(headingPattern))
  if (headings.length <= sceneWindow) return normalized
  const cutoff = headings[sceneWindow].index
  if (typeof cutoff !== 'number' || cutoff <= 0) return normalized
  return normalized.slice(0, cutoff).trim()
}

export function selectContinuationScreenplayTextForStoryboard(input: {
  readonly screenplayText: string
  readonly panelLimit: number
  readonly startAfterScreenplaySceneNumber: number
}): string {
  const normalized = input.screenplayText.trim()
  const sceneWindow = Math.max(
    MIN_OPENING_SCREENPLAY_SCENES,
    Math.min(MAX_OPENING_SCREENPLAY_SCENES, Math.ceil(input.panelLimit / PANELS_PER_OPENING_SCENE_ESTIMATE)),
  )
  const headingPattern = /^##\s*场景\s*(\d+)[^\n]*$/gmu
  const headings = Array.from(normalized.matchAll(headingPattern))
  if (headings.length === 0) return normalized
  const startHeadingIndex = headings.findIndex((heading) => Number(heading[1]) > input.startAfterScreenplaySceneNumber)
  if (startHeadingIndex === -1) {
    throw new Error(`SCREENPLAY_STORYBOARD_APPEND_NO_REMAINING_SCENE:${input.startAfterScreenplaySceneNumber}`)
  }
  const firstSceneStart = headings[0].index
  const start = headings[startHeadingIndex].index
  const endHeading = headings[startHeadingIndex + sceneWindow]
  const end = endHeading?.index
  if (typeof start !== 'number' || start < 0) return normalized
  const preamble = typeof firstSceneStart === 'number' && firstSceneStart > 0
    ? normalized.slice(0, firstSceneStart).trim()
    : ''
  const selectedScenes = normalized.slice(start, typeof end === 'number' ? end : undefined).trim()
  return [preamble, selectedScenes].filter((part) => part.length > 0).join('\n\n')
}

function parseJsonObjectResponse(responseText: string): Record<string, unknown> {
  let jsonText = responseText.trim()
  jsonText = jsonText.replace(/^```json\s*/i, '').replace(/^```\s*/, '').replace(/\s*```$/, '')
  const firstBrace = jsonText.indexOf('{')
  const lastBrace = jsonText.lastIndexOf('}')
  if (firstBrace === -1 || lastBrace === -1 || lastBrace <= firstBrace) {
    throw new Error('SCREENPLAY_STORYBOARD_JSON_INVALID')
  }
  const parsed = JSON.parse(jsonText.substring(firstBrace, lastBrace + 1)) as unknown
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('SCREENPLAY_STORYBOARD_JSON_OBJECT_REQUIRED')
  }
  return parsed as Record<string, unknown>
}

function formatDirectStoryboardGenerationError(error: unknown): string {
  const sanitizeForRepair = (message: string): string =>
    message.replace(/变形\s+of\s+啤酒瓶盖/gu, '包含英文连接词的啤酒瓶盖错误资产名')
  if (error instanceof z.ZodError) {
    return sanitizeForRepair(error.issues.map((issue) => {
      const path = issue.path.length > 0 ? issue.path.join('.') : '<root>'
      return `${path}: ${issue.message}`
    }).join('\n'))
  }
  if (error instanceof Error) return sanitizeForRepair(error.message)
  return sanitizeForRepair(String(error))
}

function resolveCharacterImageUrl(input: {
  readonly imageUrlsRaw: string | null
  readonly selectedIndex: number | null
  readonly fallbackImageUrl: string | null
}): string | null {
  const imageUrls = decodeImageUrlsFromDb(input.imageUrlsRaw, 'screenplayStoryboard.character.imageUrls')
  if (typeof input.selectedIndex === 'number') {
    const selected = imageUrls[input.selectedIndex]
    if (selected && selected.trim()) return selected
  }
  return imageUrls.find((url) => url.trim().length > 0) ?? input.fallbackImageUrl
}

async function loadCharacterAssets(projectId: string): Promise<CharacterAsset[]> {
  const characters = await prisma.projectCharacter.findMany({
    where: { projectId },
    orderBy: { createdAt: 'asc' },
    select: {
      id: true,
      name: true,
      appearances: {
        orderBy: { appearanceIndex: 'asc' },
        take: 1,
        select: {
          id: true,
          appearanceIndex: true,
          changeReason: true,
          description: true,
          imageUrl: true,
          imageUrls: true,
          selectedIndex: true,
        },
      },
    },
  })
  return characters.flatMap((character): CharacterAsset[] => {
    const appearance = character.appearances[0]
    if (!appearance) return []
    return [{
      characterId: character.id,
      name: character.name,
      appearanceId: appearance.id,
      appearanceIndex: appearance.appearanceIndex,
      appearance: appearance.changeReason || 'primary',
      description: appearance.description,
      imageUrl: resolveCharacterImageUrl({
        imageUrlsRaw: appearance.imageUrls,
        selectedIndex: appearance.selectedIndex,
        fallbackImageUrl: appearance.imageUrl,
      }),
    }]
  })
}

async function loadLocationAssets(projectId: string): Promise<LocationAsset[]> {
  const locations = await prisma.projectLocation.findMany({
    where: { projectId, assetKind: 'location' },
    orderBy: { createdAt: 'asc' },
    select: {
      id: true,
      name: true,
      summary: true,
      selectedImageId: true,
      images: {
        orderBy: { imageIndex: 'asc' },
        select: {
          id: true,
          imageUrl: true,
          description: true,
          spatialProfileJson: true,
          spatialProfileStatus: true,
          isSelected: true,
        },
      },
    },
  })
  return locations.map((location): LocationAsset => {
    const selectedImage = location.images.find((image) => image.id === location.selectedImageId)
      ?? location.images.find((image) => image.isSelected)
      ?? location.images.find((image) => Boolean(image.imageUrl))
      ?? null
    return {
      locationId: location.id,
      name: location.name,
      summary: location.summary,
      selectedImageId: selectedImage?.id ?? null,
      imageUrl: selectedImage?.imageUrl ?? null,
      imageDescription: selectedImage?.description ?? null,
      spatialProfileJson: selectedImage?.spatialProfileJson ?? null,
      spatialProfileStatus: selectedImage?.spatialProfileStatus ?? null,
    }
  })
}

async function loadPropAssets(projectId: string): Promise<PropAsset[]> {
  const props = await prisma.projectLocation.findMany({
    where: { projectId, assetKind: 'prop' },
    orderBy: { createdAt: 'asc' },
    select: {
      id: true,
      name: true,
      summary: true,
      selectedImageId: true,
      images: {
        orderBy: { imageIndex: 'asc' },
        select: {
          id: true,
          imageUrl: true,
          description: true,
          isSelected: true,
        },
      },
    },
  })
  return props.map((prop): PropAsset => {
    const selectedImage = prop.images.find((image) => image.id === prop.selectedImageId)
      ?? prop.images.find((image) => image.isSelected)
      ?? prop.images.find((image) => Boolean(image.imageUrl))
      ?? null
    return {
      propId: prop.id,
      name: prop.name,
      summary: prop.summary,
      selectedImageId: selectedImage?.id ?? null,
      imageUrl: selectedImage?.imageUrl ?? null,
      imageDescription: selectedImage?.description ?? null,
    }
  })
}

function characterPromptAssets(characters: readonly CharacterAsset[]) {
  return characters.map((character) => ({
    characterId: character.characterId,
    name: character.name,
    appearanceId: character.appearanceId,
    appearanceIndex: character.appearanceIndex,
    appearance: character.appearance,
    description: character.description,
    hasImage: Boolean(character.imageUrl),
  }))
}

function locationPromptAssets(locations: readonly LocationAsset[]) {
  return locations.map((location) => ({
    locationId: location.locationId,
    name: location.name,
    summary: location.summary,
    selectedImageId: location.selectedImageId,
    hasImage: Boolean(location.imageUrl),
    imageDescription: location.imageDescription,
    spatialProfileStatus: location.spatialProfileStatus,
    spatialFacts: location.spatialProfileJson
      ? {
        sceneSummary: (location.spatialProfileJson as Record<string, unknown>).sceneSummary ?? null,
        anchors: (location.spatialProfileJson as Record<string, unknown>).anchors ?? null,
        depthLayout: (location.spatialProfileJson as Record<string, unknown>).depthLayout ?? null,
        lightingDirection: (location.spatialProfileJson as Record<string, unknown>).lightingDirection ?? null,
      }
      : null,
  }))
}

function propPromptAssets(props: readonly PropAsset[]) {
  return props.map((prop) => ({
    propId: prop.propId,
    name: prop.name,
    summary: prop.summary,
    selectedImageId: prop.selectedImageId,
    hasImage: Boolean(prop.imageUrl),
    imageDescription: prop.imageDescription,
  }))
}

function visualStylePromptBlock(styleBibleJson: unknown): Record<string, unknown> {
  const styleBible = parseNullableEditScriptStyleBible(styleBibleJson)
  if (!styleBible) return {}
  return {
    styleSummary: styleBible.styleSummary,
    visual: styleBible.stylePolicy.visual,
    lensAndDepth: styleBible.stylePolicy.camera.lensAndDepthPrompt,
    hardBans: styleBible.stylePolicy.hardBans,
  }
}

export function compactStoryDevelopmentForStoryboard(storyDevelopmentJson: Prisma.JsonValue | null): Record<string, string> {
  return storyDevelopmentJson
    ? {
      sourcePolicy: '分镜阶段为节省 token，不读取完整剧作开发 JSON；剧本文本、视觉风格、角色资产和场景空间事实是当前分镜的权威输入。',
    }
    : {
      sourcePolicy: '当前项目没有可用剧作开发 JSON；剧本文本、视觉风格、角色资产和场景空间事实是当前分镜的权威输入。',
    }
}

function buildPromptContent(input: {
  readonly screenplayText: string
  readonly storyDevelopmentJson: Prisma.JsonValue | null
  readonly visualStyle: Record<string, unknown>
  readonly videoRatio: string
  readonly panelLimit: number
  readonly characters: readonly CharacterAsset[]
  readonly locations: readonly LocationAsset[]
  readonly props: readonly PropAsset[]
  readonly continuationContext?: StoryboardContinuationContext | null
}): ChatMessageContent {
  const continuationContext = input.continuationContext ?? null
  const instructions = [
    '你是直接分镜 Panel Agent。禁止生成或依赖导演拆镜、剪辑表、edit table、shotsJson、videoBlocksJson 或独立摄影指导方案。',
    '你只能从剧本正文、剧作开发摘要、纯视觉风格、项目角色资产、项目场景资产和轻量空间事实生成 storyboard panels。',
    continuationContext
      ? `这是分镜续跑批次。现有分镜已经覆盖到全局 panel ${continuationContext.existingPanelCount}、originalOrderKey ${continuationContext.lastOriginalOrderKey}、剧作 Scene ${continuationContext.lastScreenplaySceneNumber}；请只从下方剧本窗口继续生成后续 ${input.panelLimit} 个 storyboard panel，不得重复已覆盖内容，不得回到剧本开头。`
      : `请从剧本开头按叙事顺序生成前 ${input.panelLimit} 个 storyboard panel，不得跳选，不得重排，不得提前抽后文高潮。`,
    continuationContext
      ? '续跑输出里的 panelNumber 必须仍从 1 连续递增；系统会在持久化时转换为全局 panelNumber，不要自行写全局编号。'
      : 'panelNumber 从 1 连续递增。',
    '每个 panel 必须是一张可直接生成分镜图的画面，不是剪辑表镜头。',
    '输出严格 JSON，不要 Markdown。',
    '',
    'JSON 格式：',
    '{"productionLocations":[{"productionLocationId":"","locationId":"","stableSpatialFacts":[""],"reusableAnchors":[""],"stableSetDressing":[""],"nonPersistentStateBans":[""]}],"productionSegments":[{"productionSegmentId":"","order":1,"originalOrderKey":"001.001","screenplaySceneNumber":1,"productionLocationId":"","locationId":"","environment":"","sourceText":"","characterNames":[""],"propNames":[""]}],"segmentContinuityBibles":[{"productionSegmentId":"","originalOrderKey":"001.001","screenplaySceneNumber":1,"dramaticContext":"","temporalState":"","atmosphereState":"","crowdState":"","spatialContinuity":[""],"persistentSetState":[{"name":"","kind":"set_dressing","continuityRule":""}],"characterContinuity":[{"characterName":"","initialPosition":"","blockingArc":"","eyelineRules":[""]}],"screenDirectionRules":[""],"forbiddenChanges":[""]}],"sceneZones":[{"sceneZoneId":"","locationId":"","name":"","overallPosition":"","fixedAnchors":[""],"spatialHardLocks":{"anchorLayout":[""],"screenDirectionLocks":[""],"depthLayoutLocks":[""],"cameraSideLocks":[""],"subjectPlacementLocks":[""],"forbiddenSpatialChanges":[""]}}],"panels":[{"panelNumber":1,"productionSegmentId":"","sourceText":"","description":"","locationId":"","sceneZoneId":"","characters":[""],"props":[""],"omittedSceneAssets":[{"name":"","kind":"character","reason":""}],"shotType":"","cameraMove":"","duration":4,"shotBlocking":{"sceneZoneId":"","subjectPosition":"","cameraPosition":"","screenComposition":"","characterPlacements":[{"characterName":"","subjectPosition":"","facing":"","eyeline":""}]},"panelContinuity":{"inheritedContinuity":[""],"changedContinuity":[],"visibleContinuityElements":[""],"forbiddenDiscontinuity":[""]}}],"panelGroups":[{"groupNumber":1,"panelNumbers":[1,2],"sceneZoneIds":[""],"continuityRule":""}],"sceneContinuityLoops":[{"productionSegmentId":"","auditRound":1,"checkedPanelNumbers":[1,2],"checkedContinuityAxes":["space","character_blocking","eyeline"],"detectedIssues":[],"repairActions":[],"locked":true}]}',
    '',
    '字段要求：',
    '- panelNumber 从本批次 1 连续递增。',
    '- 所有文本字段必须是有意义中文内容；禁止写空字符串、空格、无、暂无、N/A、none、null 或单字占位。',
    '- 输出要精炼：每个中文说明字段优先写 1 句短句，不要长篇解释。',
    '- panels 不需要输出 imagePrompt、videoPrompt、actingNotes；后续图像编译器会从已校验的 panel 事实编译最终提示词。',
    '- 剧作 Scene 保持剧本原有结构；productionSegments 必须在每个剧作 Scene 内按制片物理场景拆分，不得把剧作 Scene 当作制片场景。',
    '- productionSegments 必须只按剧本时间顺序中的当下发生场景切分：同一连续环境、同一现实空间、同一段正在发生的剧情为一个 productionSegment。',
    '- 同一个剧作 Scene 内，相邻片段如果 locationId 相同，必须合并为同一个 productionSegment；不得按人物入场、下注、赢钱、对话转折、看手机或反应拆段。',
    '- 禁止因为人物/道具出入画、人物/道具增减、剧情强弱转折、电话威胁升级、反应变化，把同一当下发生场景拆成多个 productionSegment。',
    '- originalOrderKey 格式必须是 001.001：前三位是剧作 Scene 编号，后三位是该剧作 Scene 内的制片物理场景片段序号。',
    '- screenplaySceneNumber 必须是该片段所属的剧作 Scene 编号。',
    '- productionLocationId 必须引用 productionLocations.productionLocationId；locationId 必须复制对应项目场景资产的 locationId。',
    '- 同一 productionLocation 只共享长期空间资产和稳定布景，不共享剧情状态、时间状态、桌面状态、群众状态或人物关系状态。',
    '- productionSegments.characterNames / propNames 是该当下发生场景内出现过的人物和道具汇总结果；场景边界只能由剧情正在发生的连续环境和现实空间决定。',
    '- panel.productionSegmentId 必须引用 productionSegments 中的 productionSegmentId。',
    '- productionSegment 的 characterNames / propNames 是整段 roster，不等于每张 panel 都已经入画；每张 panel 必须通过 characters / props 与 omittedSceneAssets 显式说明可见或未入画状态。',
    '- 禁止用空镜、纯环境镜头、纯道具插入镜头替代剧情 panel；每个 panel 必须承载人物处境、动作或反应。',
    '- 远景、全景、中景、近景必须优先保持当前 beat 已经建立的人物、道具、群众和桌面状态；尚未登场、已经离场、合理处于画外空间的资产必须写入 omittedSceneAssets 说明具体原因。',
    '- 极近景、很小景别特写、插入细节镜头允许因为构图裁切省略部分 productionSegment 资产。',
    '- 即使是极近景/插入细节镜头，也必须至少包含一个所属 productionSegment 的人物或道具资产；禁止 characters=[] 且 props=[] 的空资产 panel。',
    '- 电话通话、威胁、反应、对白场面优先拍人物关系；不要只拍手机屏幕、桌面、灯、门、积水等环境物件。',
    '- 每个 panel 的 characters / props 是该镜头实际入画的资产，必须来自所属 productionSegment 的 characterNames / propNames，不得跨场景段借人或借物。',
    '- 如果某个 productionSegment 资产因景别、遮挡、画外声、构图裁切等原因没有出现在当前 panel，必须逐项写入 omittedSceneAssets，并给出具体 reason。',
    '- omittedSceneAssets 只能包含所属 productionSegment 的资产；已经写入 characters / props 的资产不能再写入 omittedSceneAssets。',
    '- characters / props 与 omittedSceneAssets 合并后，必须完整覆盖所属 productionSegment 的 characterNames / propNames；没有显式 omission 就视为漏资产。',
    '- 若做电话两端、异地反应，必须拆成不同 productionSegment，不得在同一个 productionSegment 中用 omission 混过。',
    '- sourceText 必须来自下方剧本正文窗口里的对应段落，可压缩但不能改写剧情事实。',
    '- description 写画面里实际可见的动作、人物位置、情绪和空间关系。',
    '- characters 只能使用项目角色资产中的 name；没有出现角色就空数组。',
    '- characters / props / omittedSceneAssets.name 必须逐字复制项目资产 name，禁止翻译、改写、加英文、删字或中英混写。',
    '- 剧本里出现但没有对应项目资产的物件只能作为 description、persistentSetState 或画面布景描述，严禁写入 productionSegments.propNames、panels.props 或 omittedSceneAssets；例如请柬、现金、点钞机、小龙虾、赛程表、相框、手机界面都不能冒充项目道具资产。',
    '- locationId 必须复制对应项目场景资产的 locationId。',
    '- sceneZoneId 必须引用 sceneZones 中的 sceneZoneId。',
    '',
    'Production Location Grouping 要求：',
    '- productionLocations 只记录同一制片物理场景的长期稳定事实：空间结构、稳定锚点、长期布景、不能跨场景段继承的状态禁令。',
    '- stableSpatialFacts / reusableAnchors 只能来自项目场景资产、空间事实或剧本明确描述；不得把气氛、海报、红光、赛事氛围升级成路牌、招牌、霓虹灯等新硬锚点。',
    '- nonPersistentStateBans 必须说明哪些内容不能因为同一地点而跨剧情段继承，例如夜晚人群、桌上菜、当前现金、某次比赛状态。',
    '',
    'Segment Continuity Bible 要求：',
    '- 每个 productionSegment 必须有且只有一个 segmentContinuityBible；这是当前这幕戏的短期连续性状态表。',
    '- dramaticContext 写这段戏的戏剧压力；temporalState 写日夜/时间阶段，允许夜晚、白天、傍晚、深夜这类明确短状态；atmosphereState 写当前气氛；crowdState 写群众密度与变化，允许无人、零散人群、满场人群这类明确状态。',
    '- spatialContinuity 锁定该段内入口、桌子、幕布、出口、出餐档口等相对关系。',
    '- persistentSetState 必须列出这段戏内需要跨 panel 持续的桌面物、菜、酒、手机、行李箱、工具包、现金、笔记本、瓶盖、人群等元素。',
    '- characterContinuity 必须说明人物初始站位、坐站关系、位置弧线、视线规则；不要让人物在无剧情原因时换边、换朝向或丢失视线对象。',
    '- screenDirectionRules 必须锁住镜头轴线、出口方向、幕布方向、人物左右关系或前后景关系。',
    '- forbiddenChanges 必须列出本段内严禁发生的断裂，例如人群突然消失、桌面物突然重置、同一张桌变成另一张桌、布景锚点被发明。',
    '',
    'Scene Zone 要求：',
    '- sceneZones 是实际分镜会使用的拍摄空间子区域，不是泛泛世界观地点。',
    '- 每个 sceneZone 只保留一个 overallPosition：一句话说明该区域在整个场景里的整体位置。',
    '- fixedAnchors 最多 5 个，只写本镜头区域内必须出现的硬空间锚点；软布景、气氛、桌面状态、人群状态必须放入 Segment Continuity Bible 或 panelContinuity。',
    '- spatialHardLocks 是该 sceneZone 的不可违反空间锁，必须输出 anchorLayout、screenDirectionLocks、depthLayoutLocks、cameraSideLocks、subjectPlacementLocks、forbiddenSpatialChanges 六组数组。',
    '- anchorLayout 必须写清固定锚点之间的绝对关系，例如窗户在画面左侧、床头在画面右侧、桌面前缘在下方、入口在后景。',
    '- screenDirectionLocks 必须写清同一 sceneZone 内镜头不可反转的银幕方向、人物左右关系、视线方向或前后景关系。',
    '- depthLayoutLocks 必须写清固定锚点在前景/中景/后景、床头/床尾、靠墙边/靠镜头边、入口/出口纵深中的占地关系。',
    '- cameraSideLocks 必须写清镜头固定站在哪一侧拍摄，例如始终在靠门侧、靠床前沿侧或桌子同一侧，禁止切到相反侧。',
    '- subjectPlacementLocks 必须写清人物动作状态和固定空间实体的关系，例如坐在同一条前景床沿、头靠同一侧床头、身体沿同一床轴延伸。',
    '- forbiddenSpatialChanges 必须写清禁止发生的空间错误，例如不得镜像翻转床头窗户关系、不得把同一张桌改到另一侧、不得让背景锚点互换位置。',
    '- 禁止在 sceneZone 里重复描述同一空间关系；不要写长篇空间说明。',
    '- 禁止把“世界杯海报/直播氛围/红光”改写成剧本没有明确写出的路牌、霓虹招牌或文字标识。',
    '',
    'shotBlocking 要求：',
    '- 每个 panel 只写主体整体位置、镜头整体位置、画面构图关系和角色视线。',
    '- 有角色的 panel，characterPlacements 必须覆盖每个 characters 里的角色名。',
    '- 无角色空镜必须使用 characterPlacements: []。',
    '- eyeline 必须写角色看向的场内对象或方向；不要写看向观众、看向镜头、面对观众。',
    '- 人物关系镜头里，人物站坐高低、左右关系、视线对象优先级高于桌面道具；除非 sourceText 明确要求插入镜头，不要让桌面/手机压过人物关系。',
    '',
    'Panel Continuity State 要求：',
    '- 每个 panel 必须写 panelContinuity。',
    '- inheritedContinuity 写从同一 productionSegment 前文继承的空间、人物、道具、群众状态。',
    '- changedContinuity 只写本 panel 相对上一 panel 的真实变化；没有变化可以空数组。',
    '- changedContinuity 没有变化必须写 []，绝对不要写 ["无"]、["暂无"] 或任何占位词。',
    '- visibleContinuityElements 写本画面中能看见或明确读出的持续元素。',
    '- forbiddenDiscontinuity 写本 panel 绝对不能发生的断裂。',
    '',
    'Panel Group 要求：',
    '- panelGroups 是后续分镜图连续性单位，必须按顺序连续覆盖所有 panel，不得跳选、乱序、重复或遗漏。',
    '- continuityRule 只用一句话说明该组必须保持不变的空间/角色连续性。',
    '',
    'Scene Continuity Loop 要求：',
    '- sceneContinuityLoops 必须在 panels 规划完成后，对每个 productionSegment 分别自检一次。',
    '- checkedPanelNumbers 必须连续覆盖该 productionSegment 下的所有 panel。',
    '- checkedContinuityAxes 至少包含 space、character_blocking、eyeline、persistent_props、crowd_state 中的三项；即使该 productionSegment 只有 1 个 panel，也必须写满至少 3 项。',
    '- 若发现断裂，必须在 repairActions 写明已如何修正 panel 的 sceneZone、shotBlocking 或 panelContinuity；最终 locked 必须为 true。',
    '',
    `画幅：${input.videoRatio}`,
  ].join('\n')

  return [
    cacheablePromptPart(`${instructions}\n\n`),
    cacheablePromptPart([
      '纯视觉风格（只管画面风格，不是导演意图）：',
      stringifyForPrompt(input.visualStyle),
      '',
      '项目角色资产：',
      stringifyForPrompt(characterPromptAssets(input.characters)),
      '',
      '项目道具资产：',
      stringifyForPrompt(propPromptAssets(input.props)),
      '',
      '项目场景资产与轻量空间事实：',
      stringifyForPrompt(locationPromptAssets(input.locations)),
      '',
      '剧作开发 JSON 摘要：',
      stringifyForPrompt(compactStoryDevelopmentForStoryboard(input.storyDevelopmentJson)),
      '',
    ].join('\n')),
    ...(continuationContext
      ? [dynamicPromptPart([
        '续跑上下文（只用于避免重复与复用长期物理场景归档，不得继承剧情状态；所有 nextGlobal* 字段仅供系统持久化参考，严禁写入输出 JSON）：',
        stringifyForPrompt({
          existingPanelCount: continuationContext.existingPanelCount,
          nextGlobalPanelNumber: continuationContext.nextPanelNumber,
          nextGlobalPanelIndex: continuationContext.nextPanelIndex,
          nextSrtStart: continuationContext.nextSrtStart,
          lastOriginalOrderKey: continuationContext.lastOriginalOrderKey,
          lastScreenplaySceneNumber: continuationContext.lastScreenplaySceneNumber,
          previousProductionLocations: continuationContext.previousProductionLocations,
          previousProductionSegments: continuationContext.previousProductionSegments,
          productionLocationRegistry: continuationContext.productionLocationRegistry,
        }),
        '',
        '续跑规则：',
        '- 不得生成 lastOriginalOrderKey 及其之前已经覆盖的剧情。',
        '- 输出里的 panelGroups.groupNumber 必须从 1 开始连续递增；不要使用任何全局 group 编号。',
        '- 遇到 productionLocationRegistry 中已注册的同一制片物理场景，必须复用 canonical productionLocationId 与 canonical locationId；禁止创建 *_new 之类的新制片地点身份。',
        '- productionLocationRegistry.permanentSpatialLocks 是同一制片场景跨剧情段必须保持的长期空间法则；床、窗、门、桌、床头床尾、入口出口等固定关系不得因为剧情段变化而重建。',
        '- 同一制片场景只共享长期空间资产和稳定布景；白天/夜晚、桌上临时物、赛程表、人群、手机屏幕、人物站位属于当前 Segment 状态，可以在 Segment Continuity Bible 中变化。',
        '- 新的 productionSegments.order 从 1 开始；originalOrderKey 必须使用它在完整剧本中的真实剧作 Scene 编号。',
        '- Scene Continuity Loop、Segment Continuity Bible、sceneZone.spatialHardLocks 六组字段仍然必须完整输出。',
        '',
      ].join('\n'))]
      : []),
    cacheablePromptPart([
      '剧本正文：',
      input.screenplayText,
    ].join('\n')),
  ]
}

function buildRepairPromptContent(input: {
  readonly basePrompt: ChatMessageContent
  readonly attempt: number
  readonly validationError: string
}): ChatMessageContent {
  const baseParts = typeof input.basePrompt === 'string'
    ? [cacheablePromptPart(input.basePrompt)]
    : input.basePrompt
  return [
    ...baseParts,
    dynamicPromptPart([
      '',
      `这是第 ${input.attempt} 次修复重试。上一版输出没有通过系统校验，禁止解释，必须重新输出完整 JSON。`,
      '修复目标：保持同一剧本顺序、同一项目资产、同一 panelLimit，只修正 schema、资产覆盖、制片场景连续性与 scene continuity loop 的错误。',
      '严禁放宽规则、严禁减少 panel 数、严禁把错误字段继续放进 panels。',
      '所有文本字段必须写成有意义中文内容，不能写空字符串、空格、无、暂无、N/A、none、null 或单字占位。',
      '所有 min(1) 的数组必须至少写一个有意义条目，不能用空数组规避连续性约束。',
      'changedContinuity / detectedIssues / repairActions 如果没有真实内容必须写 []，绝对不要写 ["无"]、["暂无"] 或任何占位词。',
      'segmentContinuityBibles.temporalState / crowdState 必须明确写当前时间阶段与群众状态；夜晚、白天、傍晚、深夜、无人、零散人群是有效短状态；persistentSetState 必须列出本段跨 panel 持续的布景、道具、群众或空间锚点。',
      'sceneZones.overallPosition 必须用一句完整中文说明该拍摄区域在整体场景里的相对位置。',
      'sceneZones.spatialHardLocks 必须写满 anchorLayout、screenDirectionLocks、depthLayoutLocks、cameraSideLocks、subjectPlacementLocks、forbiddenSpatialChanges；同一 sceneZone 被多个 panel 复用时，必须明确禁止床头/窗户/桌面/入口/人物左右关系发生镜像翻转、床体旋转、床头床尾互换或摄影机换侧。',
      '续跑时，如果当前片段发生在 productionLocationRegistry 已注册的同一制片场景，必须复用该 registry 的 productionLocationId/locationId；不得换成另一个项目 locationId，也不得创造 *_new productionLocationId。',
      '同一制片场景的床、窗、桌、门、柜、入口、床头床尾等永久空间关系必须继承 productionLocationRegistry.permanentSpatialLocks；白天夜晚、赛程表、桌面临时物和人物站位才允许作为当前 Segment 状态变化。',
      'panelGroups.groupNumber 必须从 1 开始连续递增，禁止使用任何全局 group 编号；sceneContinuityLoops.checkedContinuityAxes 每个 loop 至少写 3 项，即使该 productionSegment 只有 1 个 panel。',
      'panels.panelContinuity.inheritedContinuity 必须至少写一条继承状态；每条不少于四个中文字符，必须来自同一 productionSegment 的前文空间、人物、道具或群众状态。',
      '如果某个 productionSegment 的角色或道具属于当前段汇总资产，但当前 panel 中尚未登场、已经离场、处于合理画外空间或因景别裁切不可见，必须写入 omittedSceneAssets 并给出具体物理原因。',
      '所有角色名、道具名必须逐字复制项目资产 name；禁止在资产名中夹英文连接词、翻译、改写、加字或删字。',
      '啤酒瓶盖道具的唯一合法资产名是“变形的啤酒瓶盖”。',
      '没有对应项目道具资产的请柬、现金、点钞机、小龙虾、赛程表、相框、手机界面等只能作为画面布景或 persistentSetState 描述，严禁写入 propNames、props 或 omittedSceneAssets。',
      '如果角色或道具剧情上尚未出现，但你又把它放进 productionSegment.characterNames / propNames，则必须重新规划 panel，让非特写镜头仍能合理看见它，或把当前 panel 改成允许裁切的细节镜头。',
      '同一个剧作 Scene 内，相邻片段如果 locationId 相同，必须合并为同一个 productionSegment；不得按人物入场、下注、赢钱、对话转折、看手机或反应拆段。',
      'panels 里的字段只能使用 JSON 格式中声明过的字段；不要把 order、originalOrderKey、screenplaySceneNumber、productionLocationId、imagePrompt、videoPrompt、actingNotes 写入 panel 对象。',
      '',
      '上一版校验错误：',
      input.validationError,
    ].join('\n')),
  ]
}

function bindCharacters(input: {
  readonly names: readonly string[]
  readonly characters: readonly CharacterAsset[]
  readonly panelNumber: number
}): string | null {
  const refs = input.names.map((name) => {
    const character = input.characters.find((item) => item.name === name)
    if (!character) {
      throw new Error(`SCREENPLAY_STORYBOARD_CHARACTER_NOT_FOUND:panel_${input.panelNumber}:${name}`)
    }
    return {
      characterId: character.characterId,
      name: character.name,
      appearanceId: character.appearanceId,
      appearanceIndex: character.appearanceIndex,
      appearance: character.appearance,
    }
  })
  return refs.length > 0 ? JSON.stringify(refs) : null
}

function validatePanelGroupSceneZones(input: {
  readonly panelGroups: readonly ValidatedStoryboardPanelGroup[]
  readonly panels: readonly z.infer<typeof directPanelSchema>[]
}) {
  const panelZoneByNumber = new Map(input.panels.map((panel) => [panel.panelNumber, panel.sceneZoneId]))
  for (const group of input.panelGroups) {
    const expectedZoneIds = Array.from(new Set(group.panelNumbers.map((panelNumber) => {
      const sceneZoneId = panelZoneByNumber.get(panelNumber)
      if (!sceneZoneId) {
        throw new Error(`SCREENPLAY_STORYBOARD_GROUP_PANEL_SCENE_ZONE_MISSING:group_${group.groupNumber}:panel_${panelNumber}`)
      }
      return sceneZoneId
    })))
    for (const sceneZoneId of expectedZoneIds) {
      if (!group.sceneZoneIds.includes(sceneZoneId)) {
        throw new Error(`SCREENPLAY_STORYBOARD_GROUP_SCENE_ZONE_MISSING:group_${group.groupNumber}:${sceneZoneId}`)
      }
    }
    for (const sceneZoneId of group.sceneZoneIds) {
      if (!expectedZoneIds.includes(sceneZoneId)) {
        throw new Error(`SCREENPLAY_STORYBOARD_GROUP_SCENE_ZONE_UNUSED:group_${group.groupNumber}:${sceneZoneId}`)
      }
    }
  }
}

function groupForPanel(panelNumber: number, groups: readonly ValidatedStoryboardPanelGroup[]): ValidatedStoryboardPanelGroup {
  const group = groups.find((item) => item.panelNumbers.includes(panelNumber))
  if (!group) throw new Error(`SCREENPLAY_STORYBOARD_PANEL_GROUP_MISSING:${panelNumber}`)
  return group
}

function optionalTrimmedText(value: string | null | undefined): string | null {
  const trimmed = typeof value === 'string' ? value.trim() : ''
  return trimmed.length > 0 ? trimmed : null
}

function compilePanelImageIntent(input: {
  readonly panel: z.infer<typeof directPanelSchema>
  readonly location: LocationAsset
  readonly sceneZone: SceneZone
  readonly segmentContinuityBible: SegmentContinuityBible
}): string {
  const visibleCharacters = input.panel.characters.length > 0
    ? `可见角色：${input.panel.characters.join('、')}`
    : '无可见角色'
  const visibleProps = input.panel.props.length > 0
    ? `可见道具：${input.panel.props.join('、')}`
    : '无可见道具'
  const continuityElements = input.panel.panelContinuity.visibleContinuityElements.slice(0, 4).join('、')
  const spatialHardLocks = [
    ...input.sceneZone.spatialHardLocks.anchorLayout,
    ...input.sceneZone.spatialHardLocks.screenDirectionLocks,
    ...input.sceneZone.spatialHardLocks.depthLayoutLocks,
    ...input.sceneZone.spatialHardLocks.cameraSideLocks,
    ...input.sceneZone.spatialHardLocks.subjectPlacementLocks,
    ...input.sceneZone.spatialHardLocks.forbiddenSpatialChanges,
  ].slice(0, 6).join('；')
  return [
    `${input.panel.shotType}，${input.location.name}，${input.sceneZone.name}。`,
    input.panel.description,
    `空间硬锁：${spatialHardLocks}。`,
    visibleCharacters,
    visibleProps,
    `连续性：${continuityElements || input.segmentContinuityBible.atmosphereState}。`,
  ].join(' ')
}

function compilePanelVideoIntent(input: {
  readonly panel: z.infer<typeof directPanelSchema>
  readonly segmentContinuityBible: SegmentContinuityBible
}): string {
  return [
    `${input.panel.cameraMove}镜头，保持${input.segmentContinuityBible.temporalState}与${input.segmentContinuityBible.crowdState}连续性。`,
    input.panel.description,
  ].join(' ')
}

function buildPanelDrafts(input: {
  readonly panels: readonly z.infer<typeof directPanelSchema>[]
  readonly characters: readonly CharacterAsset[]
  readonly locations: readonly LocationAsset[]
  readonly productionSegments: readonly ProductionSegment[]
  readonly segmentContinuityBibles: readonly SegmentContinuityBible[]
  readonly sceneZones: readonly SceneZone[]
  readonly panelGroups: readonly ValidatedStoryboardPanelGroup[]
  readonly screenplayId: string
  readonly panelIndexOffset?: number
  readonly panelNumberOffset?: number
  readonly panelGroupNumberOffset?: number
  readonly srtOffset?: number
}): PanelDraft[] {
  const panelIndexOffset = input.panelIndexOffset ?? 0
  const panelNumberOffset = input.panelNumberOffset ?? 0
  const panelGroupNumberOffset = input.panelGroupNumberOffset ?? 0
  let cursor = input.srtOffset ?? 0
  const locationById = new Map(input.locations.map((location) => [location.locationId, location]))
  const productionSegmentById = new Map(input.productionSegments.map((segment) => [segment.productionSegmentId, segment]))
  const segmentContinuityById = new Map(input.segmentContinuityBibles.map((bible) => [bible.productionSegmentId, bible]))
  const sceneZoneById = new Map(input.sceneZones.map((zone) => [zone.sceneZoneId, zone]))
  return input.panels.map((panel, index) => {
    const location = locationById.get(panel.locationId)
    if (!location) {
      throw new Error(`SCREENPLAY_STORYBOARD_PANEL_LOCATION_NOT_FOUND:panel_${panel.panelNumber}:${panel.locationId}`)
    }
    const productionSegment = productionSegmentById.get(panel.productionSegmentId)
    if (!productionSegment) {
      throw new Error(`SCREENPLAY_STORYBOARD_PANEL_PRODUCTION_SEGMENT_NOT_FOUND:panel_${panel.panelNumber}:${panel.productionSegmentId}`)
    }
    const segmentContinuityBible = segmentContinuityById.get(panel.productionSegmentId)
    if (!segmentContinuityBible) {
      throw new Error(`SCREENPLAY_STORYBOARD_PANEL_SEGMENT_CONTINUITY_MISSING:panel_${panel.panelNumber}:${panel.productionSegmentId}`)
    }
    const sceneZone = sceneZoneById.get(panel.sceneZoneId)
    if (!sceneZone) {
      throw new Error(`SCREENPLAY_STORYBOARD_PANEL_SCENE_ZONE_NOT_FOUND:panel_${panel.panelNumber}:${panel.sceneZoneId}`)
    }
    const duration = Number(panel.duration.toFixed(2))
    const srtStart = cursor
    const srtEnd = Number((cursor + duration).toFixed(2))
    cursor = srtEnd
    const group = groupForPanel(panel.panelNumber, input.panelGroups)
    const globalPanelNumber = panel.panelNumber + panelNumberOffset
    const globalPanelGroupNumber = group.groupNumber + panelGroupNumberOffset
    const sourceVideoBlockId = `${input.screenplayId}:panelGroup:${globalPanelGroupNumber}`
    const source = {
      source: 'edit_screenplay',
      sourceType: 'directScreenplayStoryboardPanel',
      screenplayId: input.screenplayId,
      panelNumber: globalPanelNumber,
      productionSegmentId: panel.productionSegmentId,
      originalOrderKey: productionSegment.originalOrderKey,
      screenplaySceneNumber: productionSegment.screenplaySceneNumber,
      productionLocationId: productionSegment.productionLocationId,
      sourceVideoBlockKind: 'group',
      sourceVideoBlockId,
      locationId: panel.locationId,
      sceneZoneId: panel.sceneZoneId,
      sceneZone: {
        sceneZoneId: sceneZone.sceneZoneId,
        locationId: sceneZone.locationId,
        name: sceneZone.name,
        overallPosition: sceneZone.overallPosition,
        fixedAnchors: sceneZone.fixedAnchors,
        spatialHardLocks: sceneZone.spatialHardLocks,
      },
      omittedSceneAssets: panel.omittedSceneAssets,
      shotBlocking: panel.shotBlocking,
      segmentContinuityBible,
      panelContinuity: panel.panelContinuity,
      continuityRule: group.continuityRule,
    }
    return {
      panelIndex: panelIndexOffset + index,
      panelNumber: globalPanelNumber,
      productionSegmentId: panel.productionSegmentId,
      originalOrderKey: productionSegment.originalOrderKey,
      screenplaySceneNumber: productionSegment.screenplaySceneNumber,
      productionLocationId: productionSegment.productionLocationId,
      description: panel.description,
      location: location.name,
      locationId: panel.locationId,
      sceneZoneId: panel.sceneZoneId,
      characters: bindCharacters({
        names: panel.characters,
        characters: input.characters,
        panelNumber: panel.panelNumber,
      }),
      props: panel.props.length > 0 ? JSON.stringify(panel.props) : null,
      omittedSceneAssets: panel.omittedSceneAssets,
      srtSegment: panel.sourceText,
      srtStart,
      srtEnd,
      duration,
      shotType: panel.shotType,
      cameraMove: panel.cameraMove,
      imagePrompt: optionalTrimmedText(panel.imagePrompt) ?? compilePanelImageIntent({
        panel,
        location,
        sceneZone,
        segmentContinuityBible,
      }),
      videoPrompt: optionalTrimmedText(panel.videoPrompt) ?? compilePanelVideoIntent({
        panel,
        segmentContinuityBible,
      }),
      photographyRules: JSON.stringify(source),
      actingNotes: panel.actingNotes ?? null,
      shotBlocking: panel.shotBlocking,
      panelContinuity: panel.panelContinuity,
    }
  })
}

function buildStoryboardMarker(screenplayId: string): string {
  return JSON.stringify({
    source: 'edit_screenplay',
    sourceType: 'directScreenplayStoryboard',
    screenplayId,
  })
}

function readStoredRecord(value: unknown, context: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`SCREENPLAY_STORYBOARD_STORED_RECORD_REQUIRED:${context}`)
  }
  return value as Record<string, unknown>
}

function parseStoredRecordJson(value: string | null, context: string): Record<string, unknown> {
  if (!value) return {}
  const parsed = JSON.parse(value) as unknown
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error(`SCREENPLAY_STORYBOARD_STORED_JSON_OBJECT_REQUIRED:${context}`)
  }
  return parsed as Record<string, unknown>
}

function readStoredRecordArray(value: unknown, context: string): readonly Record<string, unknown>[] {
  if (value === undefined) return []
  if (!Array.isArray(value)) throw new Error(`SCREENPLAY_STORYBOARD_STORED_ARRAY_REQUIRED:${context}`)
  return value.map((item, index) => readStoredRecord(item, `${context}.${index}`))
}

function readRequiredString(value: unknown, context: string): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new Error(`SCREENPLAY_STORYBOARD_STRING_REQUIRED:${context}`)
  }
  return value.trim()
}

function readRequiredPositiveInteger(value: unknown, context: string): number {
  if (typeof value !== 'number' || !Number.isInteger(value) || value <= 0) {
    throw new Error(`SCREENPLAY_STORYBOARD_POSITIVE_INTEGER_REQUIRED:${context}`)
  }
  return value
}

function readRequiredFiniteNumber(value: unknown, context: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new Error(`SCREENPLAY_STORYBOARD_NUMBER_REQUIRED:${context}`)
  }
  return value
}

function readOptionalStringArray(value: unknown): readonly string[] {
  if (!Array.isArray(value)) return []
  return value
    .map((item) => (typeof item === 'string' ? item.trim() : ''))
    .filter((item) => item.length > 0)
}

function normalizeLocationAlias(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/^pl[_\-\s]*/u, '')
    .replace(/[_\-\s]*(new|新版|新)$/u, '')
    .replace(/[^\p{Script=Han}a-z0-9]+/gu, '')
}

function addLocationAlias(aliases: Set<string>, value: unknown) {
  if (typeof value !== 'string') return
  const normalized = normalizeLocationAlias(value)
  if (normalized.length >= 2) aliases.add(normalized)
}

const LOCATION_KEYWORD_PATTERN = /(?:出租屋|大排档|银行网点|银行|物业办公室|办公室|麻将馆|里屋|茶台|便利店|小区|家中|卧室|客厅|厨房|走廊|楼道|街巷|巷道|路边|门口|柜台|出租房|单人房|房间)/gu

function addLocationKeywordAliases(aliases: Set<string>, value: unknown) {
  if (typeof value !== 'string') return
  for (const match of value.matchAll(LOCATION_KEYWORD_PATTERN)) {
    addLocationAlias(aliases, match[0])
  }
}

function readRecordString(value: Record<string, unknown>, key: string): string {
  const raw = value[key]
  return typeof raw === 'string' ? raw.trim() : ''
}

function hasSharedAlias(left: readonly string[], right: readonly string[]): boolean {
  const rightSet = new Set(right)
  return left.some((alias) => rightSet.has(alias))
}

function uniqueStrings(values: readonly string[], max = 16): readonly string[] {
  const output: string[] = []
  const seen = new Set<string>()
  for (const value of values) {
    const trimmed = value.trim()
    if (!trimmed || seen.has(trimmed)) continue
    output.push(trimmed)
    seen.add(trimmed)
    if (output.length >= max) break
  }
  return output
}

function isPermanentSpatialLock(value: string, characterNames: readonly string[]): boolean {
  if (/panel\s*\d+/iu.test(value)) return false
  if (/人物|角色/u.test(value)) return false
  if (characterNames.some((name) => value.includes(name))) return false
  return /床|床头|床尾|床沿|窗|门|桌|柜|墙|入口|出口|幕布|投影|鱼缸|椅|柜台|通道|房间|空间/u.test(value)
}

function appendPermanentLocks(input: {
  readonly target: ProductionLocationRegistryEntry['permanentSpatialLocks']
  readonly sceneZone: Record<string, unknown>
  readonly characterNames: readonly string[]
}) {
  const rawLocks = input.sceneZone.spatialHardLocks
  if (!rawLocks || typeof rawLocks !== 'object' || Array.isArray(rawLocks)) return
  const locks = rawLocks as Record<string, unknown>
  const merge = (field: keyof ProductionLocationRegistryEntry['permanentSpatialLocks']) => {
    const values = readOptionalStringArray(locks[field])
      .filter((value) => isPermanentSpatialLock(value, input.characterNames))
    return [...uniqueStrings([...input.target[field], ...values], 8)]
  }
  const mutableTarget = input.target as {
    anchorLayout: string[]
    screenDirectionLocks: string[]
    depthLayoutLocks: string[]
    cameraSideLocks: string[]
    subjectPlacementLocks: string[]
    forbiddenSpatialChanges: string[]
  }
  mutableTarget.anchorLayout = merge('anchorLayout')
  mutableTarget.screenDirectionLocks = merge('screenDirectionLocks')
  mutableTarget.depthLayoutLocks = merge('depthLayoutLocks')
  mutableTarget.cameraSideLocks = merge('cameraSideLocks')
  mutableTarget.subjectPlacementLocks = merge('subjectPlacementLocks')
  mutableTarget.forbiddenSpatialChanges = merge('forbiddenSpatialChanges')
}

function createEmptyPermanentSpatialLocks(): ProductionLocationRegistryEntry['permanentSpatialLocks'] {
  return {
    anchorLayout: [],
    screenDirectionLocks: [],
    depthLayoutLocks: [],
    cameraSideLocks: [],
    subjectPlacementLocks: [],
    forbiddenSpatialChanges: [],
  }
}

function buildProductionLocationRegistry(input: {
  readonly previousProductionLocations: readonly Record<string, unknown>[]
  readonly previousProductionSegments: readonly Record<string, unknown>[]
  readonly previousSceneZones: readonly Record<string, unknown>[]
  readonly locations: readonly LocationAsset[]
  readonly characters: readonly CharacterAsset[]
}): readonly ProductionLocationRegistryEntry[] {
  const locationById = new Map(input.locations.map((location) => [location.locationId, location]))
  const characterNames = input.characters.map((character) => character.name)
  const registryByProductionLocationId = new Map<string, {
    productionLocationId: string
    locationId: string
    locationName: string | null
    aliases: Set<string>
    stableSpatialFacts: string[]
    reusableAnchors: string[]
    stableSetDressing: string[]
    nonPersistentStateBans: string[]
    permanentSpatialLocks: ProductionLocationRegistryEntry['permanentSpatialLocks']
  }>()
  const registryByLocationId = new Map<string, {
    productionLocationId: string
    locationId: string
    locationName: string | null
    aliases: Set<string>
    stableSpatialFacts: string[]
    reusableAnchors: string[]
    stableSetDressing: string[]
    nonPersistentStateBans: string[]
    permanentSpatialLocks: ProductionLocationRegistryEntry['permanentSpatialLocks']
  }>()

  const ensureEntry = (productionLocationId: string, locationId: string) => {
    const existingByProductionLocationId = registryByProductionLocationId.get(productionLocationId)
    if (existingByProductionLocationId) return existingByProductionLocationId
    const existingByLocationId = registryByLocationId.get(locationId)
    if (existingByLocationId) return existingByLocationId
    const location = locationById.get(locationId) ?? null
    const entry = {
      productionLocationId,
      locationId,
      locationName: location?.name ?? null,
      aliases: new Set<string>(),
      stableSpatialFacts: [] as string[],
      reusableAnchors: [] as string[],
      stableSetDressing: [] as string[],
      nonPersistentStateBans: [] as string[],
      permanentSpatialLocks: createEmptyPermanentSpatialLocks(),
    }
    addLocationAlias(entry.aliases, productionLocationId)
    addLocationAlias(entry.aliases, location?.name)
    addLocationKeywordAliases(entry.aliases, location?.name)
    addLocationKeywordAliases(entry.aliases, location?.summary)
    registryByProductionLocationId.set(productionLocationId, entry)
    registryByLocationId.set(locationId, entry)
    return entry
  }

  for (const location of input.previousProductionLocations) {
    const productionLocationId = readRecordString(location, 'productionLocationId')
    const locationId = readRecordString(location, 'locationId')
    if (!productionLocationId || !locationId) continue
    const entry = ensureEntry(productionLocationId, locationId)
    entry.stableSpatialFacts = [...entry.stableSpatialFacts, ...readOptionalStringArray(location.stableSpatialFacts)]
    entry.reusableAnchors = [...entry.reusableAnchors, ...readOptionalStringArray(location.reusableAnchors)]
    entry.stableSetDressing = [...entry.stableSetDressing, ...readOptionalStringArray(location.stableSetDressing)]
    entry.nonPersistentStateBans = [...entry.nonPersistentStateBans, ...readOptionalStringArray(location.nonPersistentStateBans)]
    for (const value of [...entry.stableSpatialFacts, ...entry.stableSetDressing, ...entry.reusableAnchors]) {
      addLocationKeywordAliases(entry.aliases, value)
    }
  }

  for (const segment of input.previousProductionSegments) {
    const productionLocationId = readRecordString(segment, 'productionLocationId')
    const locationId = readRecordString(segment, 'locationId')
    if (!productionLocationId || !locationId) continue
    const entry = ensureEntry(productionLocationId, locationId)
    addLocationAlias(entry.aliases, productionLocationId)
    addLocationKeywordAliases(entry.aliases, readRecordString(segment, 'environment'))
    addLocationKeywordAliases(entry.aliases, readRecordString(segment, 'sourceText'))
  }

  for (const sceneZone of input.previousSceneZones) {
    const locationId = readRecordString(sceneZone, 'locationId')
    const entry = registryByLocationId.get(locationId)
    if (!entry) continue
    addLocationKeywordAliases(entry.aliases, readRecordString(sceneZone, 'name'))
    addLocationKeywordAliases(entry.aliases, readRecordString(sceneZone, 'overallPosition'))
    appendPermanentLocks({
      target: entry.permanentSpatialLocks,
      sceneZone,
      characterNames,
    })
  }

  return Array.from(registryByProductionLocationId.values()).map((entry) => ({
    productionLocationId: entry.productionLocationId,
    locationId: entry.locationId,
    locationName: entry.locationName,
    aliases: Array.from(entry.aliases).sort(),
    stableSpatialFacts: uniqueStrings(entry.stableSpatialFacts),
    reusableAnchors: uniqueStrings(entry.reusableAnchors),
    stableSetDressing: uniqueStrings(entry.stableSetDressing),
    nonPersistentStateBans: uniqueStrings(entry.nonPersistentStateBans),
    permanentSpatialLocks: {
      anchorLayout: uniqueStrings(entry.permanentSpatialLocks.anchorLayout, 8),
      screenDirectionLocks: uniqueStrings(entry.permanentSpatialLocks.screenDirectionLocks, 8),
      depthLayoutLocks: uniqueStrings(entry.permanentSpatialLocks.depthLayoutLocks, 8),
      cameraSideLocks: uniqueStrings(entry.permanentSpatialLocks.cameraSideLocks, 8),
      subjectPlacementLocks: uniqueStrings(entry.permanentSpatialLocks.subjectPlacementLocks, 8),
      forbiddenSpatialChanges: uniqueStrings(entry.permanentSpatialLocks.forbiddenSpatialChanges, 8),
    },
  }))
}

function aliasesForIncomingProductionLocation(input: {
  readonly productionLocation: ProductionLocationGroup | null
  readonly segment: ProductionSegment
  readonly locations: readonly LocationAsset[]
}): readonly string[] {
  const aliases = new Set<string>()
  const location = input.locations.find((item) => item.locationId === input.segment.locationId) ?? null
  addLocationAlias(aliases, input.segment.productionLocationId)
  addLocationAlias(aliases, input.segment.environment)
  addLocationKeywordAliases(aliases, input.segment.environment)
  addLocationKeywordAliases(aliases, input.segment.sourceText)
  addLocationAlias(aliases, input.productionLocation?.productionLocationId)
  addLocationKeywordAliases(aliases, input.productionLocation?.stableSpatialFacts.join('、'))
  addLocationKeywordAliases(aliases, input.productionLocation?.stableSetDressing.join('、'))
  addLocationAlias(aliases, location?.name)
  addLocationKeywordAliases(aliases, location?.name)
  addLocationKeywordAliases(aliases, location?.summary)
  return Array.from(aliases).sort()
}

function resolveCanonicalProductionLocation(input: {
  readonly productionLocation: ProductionLocationGroup | null
  readonly segment: ProductionSegment
  readonly locations: readonly LocationAsset[]
  readonly registry: readonly ProductionLocationRegistryEntry[]
}): ProductionLocationRegistryEntry | null {
  const exactLocationMatch = input.registry.find((entry) => entry.locationId === input.segment.locationId)
  if (exactLocationMatch) return exactLocationMatch
  const exactProductionLocationMatch = input.registry.find((entry) => entry.productionLocationId === input.segment.productionLocationId)
  if (exactProductionLocationMatch) return exactProductionLocationMatch
  const aliases = aliasesForIncomingProductionLocation({
    productionLocation: input.productionLocation,
    segment: input.segment,
    locations: input.locations,
  })
  return input.registry.find((entry) => hasSharedAlias(entry.aliases, aliases)) ?? null
}

function mergeSpatialLockField(input: {
  readonly existing: readonly string[]
  readonly inherited: readonly string[]
  readonly max?: number
}): string[] {
  return uniqueStrings([...input.inherited, ...input.existing], input.max ?? 8) as string[]
}

function applyPermanentLocationBibleToSceneZone(input: {
  readonly sceneZone: SceneZone
  readonly registryEntry: ProductionLocationRegistryEntry
}): SceneZone {
  const locks = input.registryEntry.permanentSpatialLocks
  return {
    ...input.sceneZone,
    locationId: input.registryEntry.locationId,
    spatialHardLocks: {
      anchorLayout: mergeSpatialLockField({
        existing: input.sceneZone.spatialHardLocks.anchorLayout,
        inherited: locks.anchorLayout,
      }),
      screenDirectionLocks: mergeSpatialLockField({
        existing: input.sceneZone.spatialHardLocks.screenDirectionLocks,
        inherited: locks.screenDirectionLocks,
      }),
      depthLayoutLocks: mergeSpatialLockField({
        existing: input.sceneZone.spatialHardLocks.depthLayoutLocks,
        inherited: locks.depthLayoutLocks,
      }),
      cameraSideLocks: mergeSpatialLockField({
        existing: input.sceneZone.spatialHardLocks.cameraSideLocks,
        inherited: locks.cameraSideLocks,
      }),
      subjectPlacementLocks: mergeSpatialLockField({
        existing: input.sceneZone.spatialHardLocks.subjectPlacementLocks,
        inherited: locks.subjectPlacementLocks,
      }),
      forbiddenSpatialChanges: mergeSpatialLockField({
        existing: input.sceneZone.spatialHardLocks.forbiddenSpatialChanges,
        inherited: [
          ...locks.forbiddenSpatialChanges,
          ...locks.anchorLayout.map((lock) => `不得违反同一制片场景长期空间锁：${lock}`),
        ],
      }),
    },
  }
}

export function normalizeDirectStoryboardOutputWithProductionLocationRegistry(input: {
  readonly parsed: DirectStoryboardOutput
  readonly continuationContext: StoryboardContinuationContext | null
  readonly locations: readonly LocationAsset[]
}): DirectStoryboardOutput {
  const registry = input.continuationContext?.productionLocationRegistry ?? []
  if (registry.length === 0) return input.parsed

  const productionLocationById = new Map(input.parsed.productionLocations.map((location) => [location.productionLocationId, location]))
  const segmentCanonicalById = new Map<string, ProductionLocationRegistryEntry>()
  const productionSegments = input.parsed.productionSegments.map((segment) => {
    const canonical = resolveCanonicalProductionLocation({
      productionLocation: productionLocationById.get(segment.productionLocationId) ?? null,
      segment,
      locations: input.locations,
      registry,
    })
    if (!canonical) return segment
    segmentCanonicalById.set(segment.productionSegmentId, canonical)
    return {
      ...segment,
      productionLocationId: canonical.productionLocationId,
      locationId: canonical.locationId,
    }
  })

  const panelLocationBySceneZoneId = new Map<string, string>()
  const panels = input.parsed.panels.map((panel) => {
    const canonical = segmentCanonicalById.get(panel.productionSegmentId)
    if (!canonical) return panel
    panelLocationBySceneZoneId.set(panel.sceneZoneId, canonical.locationId)
    return {
      ...panel,
      locationId: canonical.locationId,
    }
  })

  const sceneZones = input.parsed.sceneZones.map((sceneZone) => {
    const locationId = panelLocationBySceneZoneId.get(sceneZone.sceneZoneId) ?? sceneZone.locationId
    const canonical = registry.find((entry) => entry.locationId === locationId)
    const normalizedSceneZone = { ...sceneZone, locationId }
    return canonical
      ? applyPermanentLocationBibleToSceneZone({
        sceneZone: normalizedSceneZone,
        registryEntry: canonical,
      })
      : normalizedSceneZone
  })

  const referencedProductionLocationIds = new Set(productionSegments.map((segment) => segment.productionLocationId))
  const productionLocationOutput = new Map<string, ProductionLocationGroup>()
  for (const location of input.parsed.productionLocations) {
    if (referencedProductionLocationIds.has(location.productionLocationId)) {
      productionLocationOutput.set(location.productionLocationId, location)
    }
  }
  for (const canonical of registry) {
    if (!referencedProductionLocationIds.has(canonical.productionLocationId)) continue
    productionLocationOutput.set(canonical.productionLocationId, {
      productionLocationId: canonical.productionLocationId,
      locationId: canonical.locationId,
      stableSpatialFacts: [...canonical.stableSpatialFacts],
      reusableAnchors: [...canonical.reusableAnchors],
      stableSetDressing: [...canonical.stableSetDressing],
      nonPersistentStateBans: [...canonical.nonPersistentStateBans],
    })
  }

  return {
    ...input.parsed,
    productionLocations: Array.from(productionLocationOutput.values()),
    productionSegments,
    sceneZones,
    panels,
  }
}

function formatPanelDraftsForStorage(panelDrafts: readonly PanelDraft[]) {
  return panelDrafts.map((panel) => ({
    panelNumber: panel.panelNumber,
    productionSegmentId: panel.productionSegmentId,
    originalOrderKey: panel.originalOrderKey,
    screenplaySceneNumber: panel.screenplaySceneNumber,
    productionLocationId: panel.productionLocationId,
    description: panel.description,
    location: panel.location,
    locationId: panel.locationId,
    sceneZoneId: panel.sceneZoneId,
    characters: panel.characters,
    props: panel.props,
    omittedSceneAssets: panel.omittedSceneAssets,
    sourceText: panel.srtSegment,
    duration: panel.duration,
    shotBlocking: panel.shotBlocking,
    panelContinuity: panel.panelContinuity,
  }))
}

function offsetPanelGroups(input: {
  readonly panelGroups: readonly ValidatedStoryboardPanelGroup[]
  readonly panelNumberOffset: number
  readonly panelGroupNumberOffset: number
}): readonly ValidatedStoryboardPanelGroup[] {
  return input.panelGroups.map((group) => ({
    groupNumber: group.groupNumber + input.panelGroupNumberOffset,
    panelNumbers: group.panelNumbers.map((panelNumber) => panelNumber + input.panelNumberOffset),
    sceneZoneIds: [...group.sceneZoneIds],
    continuityRule: group.continuityRule,
  }))
}

function offsetSceneContinuityLoops(input: {
  readonly loops: readonly SceneContinuityLoop[]
  readonly panelNumberOffset: number
}): readonly SceneContinuityLoop[] {
  return input.loops.map((loop) => ({
    ...loop,
    checkedPanelNumbers: loop.checkedPanelNumbers.map((panelNumber) => panelNumber + input.panelNumberOffset),
  }))
}

function offsetProductionSegmentOrders(input: {
  readonly productionSegments: readonly ProductionSegment[]
  readonly orderOffset: number
}): readonly ProductionSegment[] {
  return input.productionSegments.map((segment) => ({
    ...segment,
    order: segment.order + input.orderOffset,
  }))
}

function mergeStoredRecordArraysByKey(input: {
  readonly existing: readonly Record<string, unknown>[]
  readonly incoming: readonly Record<string, unknown>[]
  readonly key: string
}): readonly Record<string, unknown>[] {
  const merged = new Map<string, Record<string, unknown>>()
  for (const item of input.existing) {
    merged.set(readRequiredString(item[input.key], `existing.${input.key}`), item)
  }
  for (const item of input.incoming) {
    merged.set(readRequiredString(item[input.key], `incoming.${input.key}`), item)
  }
  return Array.from(merged.values())
}

async function loadExistingDirectStoryboard(input: {
  readonly episodeId: string
  readonly screenplayId: string
}) {
  const markerNeedle = `"screenplayId":"${input.screenplayId}"`
  return await prisma.projectStoryboard.findFirst({
    where: {
      episodeId: input.episodeId,
      clip: {
        screenplay: {
          contains: markerNeedle,
        },
      },
    },
    include: {
      clip: true,
      panels: { orderBy: { panelIndex: 'asc' } },
    },
  })
}

function readPanelPhotographyRules(panel: { readonly photographyRules: string | null }): Record<string, unknown> {
  return parseStoredRecordJson(panel.photographyRules, 'panel.photographyRules')
}

function readPanelGroupNumberFromRules(rules: Record<string, unknown>): number {
  const sourceVideoBlockId = readRequiredString(rules.sourceVideoBlockId, 'panel.photographyRules.sourceVideoBlockId')
  const match = sourceVideoBlockId.match(/:panelGroup:(\d+)$/u)
  if (!match) throw new Error(`SCREENPLAY_STORYBOARD_PANEL_GROUP_ID_INVALID:${sourceVideoBlockId}`)
  return Number(match[1])
}

function buildContinuationContextFromExistingStoryboard(storyboard: Awaited<ReturnType<typeof loadExistingDirectStoryboard>>): StoryboardContinuationContext {
  if (!storyboard) throw new Error('SCREENPLAY_STORYBOARD_APPEND_REQUIRES_EXISTING_STORYBOARD')
  const lastPanel = storyboard.panels.at(-1)
  if (!lastPanel) throw new Error('SCREENPLAY_STORYBOARD_APPEND_REQUIRES_EXISTING_PANELS')
  const lastPanelNumber = readRequiredPositiveInteger(lastPanel.panelNumber, 'lastPanel.panelNumber')
  const lastRules = readPanelPhotographyRules(lastPanel)
  const panelGroupNumbers = storyboard.panels.map((panel) => readPanelGroupNumberFromRules(readPanelPhotographyRules(panel)))
  const storyboardText = parseStoredRecordJson(storyboard.storyboardTextJson, 'storyboard.storyboardTextJson')
  const previousProductionLocations = readStoredRecordArray(storyboardText.productionLocations, 'storyboard.productionLocations')
  const previousProductionSegments = readStoredRecordArray(storyboardText.productionSegments, 'storyboard.productionSegments')
  const previousSceneZones = readStoredRecordArray(storyboardText.sceneZones, 'storyboard.sceneZones')
  return {
    existingPanelCount: storyboard.panels.length,
    nextPanelNumber: lastPanelNumber + 1,
    nextPanelIndex: lastPanel.panelIndex + 1,
    nextPanelGroupNumber: Math.max(...panelGroupNumbers) + 1,
    nextSrtStart: readRequiredFiniteNumber(lastPanel.srtEnd, 'lastPanel.srtEnd'),
    lastOriginalOrderKey: readRequiredString(lastRules.originalOrderKey, 'panel.photographyRules.originalOrderKey'),
    lastScreenplaySceneNumber: readRequiredPositiveInteger(lastRules.screenplaySceneNumber, 'panel.photographyRules.screenplaySceneNumber'),
    previousProductionLocations,
    previousProductionSegments,
    previousSceneZones,
    productionLocationRegistry: [],
  }
}

function parseAndValidateDirectStoryboardOutput(input: {
  readonly completionText: string
  readonly panelLimit: number
  readonly characters: readonly CharacterAsset[]
  readonly locations: readonly LocationAsset[]
  readonly props: readonly PropAsset[]
  readonly continuationContext?: StoryboardContinuationContext | null
}): ValidatedDirectStoryboardOutput {
  if (!input.completionText.trim()) throw new Error('SCREENPLAY_STORYBOARD_LLM_EMPTY')
  const rawParsed = directStoryboardOutputSchema.parse(parseJsonObjectResponse(input.completionText))
  const parsed = normalizeDirectStoryboardOutputWithProductionLocationRegistry({
    parsed: rawParsed,
    continuationContext: input.continuationContext ?? null,
    locations: input.locations,
  })
  if (parsed.panels.length !== input.panelLimit) {
    throw new Error(`SCREENPLAY_STORYBOARD_PANEL_COUNT_MISMATCH: expected ${input.panelLimit}, got ${parsed.panels.length}`)
  }
  const panelGroups = validateStoryboardPanelGroups({
    groups: parsed.panelGroups,
    panelNumbers: parsed.panels.map((panel) => panel.panelNumber),
  })
  const productionLocations = validateProductionLocationGroups({
    productionLocations: parsed.productionLocations,
    locations: input.locations,
  })
  const productionSegments = validateProductionSegments({
    productionSegments: parsed.productionSegments,
    productionLocations,
    characters: input.characters,
    props: input.props,
    locations: input.locations,
    panels: parsed.panels.map((panel) => ({
      panelNumber: panel.panelNumber,
      productionSegmentId: panel.productionSegmentId,
      locationId: panel.locationId,
      shotType: panel.shotType,
      characterNames: panel.characters,
      propNames: panel.props,
      omittedSceneAssets: panel.omittedSceneAssets,
      panelContinuity: panel.panelContinuity,
    })),
  })
  const segmentContinuityBibles = validateSegmentContinuityBibles({
    productionSegments,
    segmentContinuityBibles: parsed.segmentContinuityBibles,
  })
  validateSceneContinuity({
    sceneZones: parsed.sceneZones,
    locations: input.locations,
    panels: parsed.panels.map((panel) => ({
      panelNumber: panel.panelNumber,
      characterNames: panel.characters,
      locationId: panel.locationId,
      sceneZoneId: panel.sceneZoneId,
      shotBlocking: panel.shotBlocking,
    })),
  })
  validatePanelGroupSceneZones({
    panelGroups,
    panels: parsed.panels,
  })
  const panelNumbersBySegment = new Map<string, number[]>()
  for (const panel of parsed.panels) {
    const existing = panelNumbersBySegment.get(panel.productionSegmentId) ?? []
    existing.push(panel.panelNumber)
    panelNumbersBySegment.set(panel.productionSegmentId, existing)
  }
  const sceneContinuityLoops = validateSceneContinuityLoops({
    productionSegments,
    panelNumbersBySegment,
    loops: parsed.sceneContinuityLoops,
  })

  return {
    parsed,
    panelGroups,
    productionLocations,
    productionSegments,
    segmentContinuityBibles,
    sceneContinuityLoops,
  }
}

async function upsertDirectStoryboard(input: {
  readonly projectId: string
  readonly episodeId: string
  readonly screenplayId: string
  readonly title: string
  readonly userPrompt: string
  readonly panelDrafts: readonly PanelDraft[]
  readonly productionLocations: readonly ProductionLocationGroup[]
  readonly productionSegments: readonly ProductionSegment[]
  readonly segmentContinuityBibles: readonly SegmentContinuityBible[]
  readonly sceneZones: readonly SceneZone[]
  readonly panelGroups: readonly ValidatedStoryboardPanelGroup[]
  readonly sceneContinuityLoops: readonly SceneContinuityLoop[]
}): Promise<{ readonly storyboardId: string; readonly panelIds: readonly string[] }> {
  const marker = buildStoryboardMarker(input.screenplayId)
  const markerNeedle = `"screenplayId":"${input.screenplayId}"`
  const existing = await prisma.projectStoryboard.findFirst({
    where: {
      episodeId: input.episodeId,
      clip: {
        screenplay: {
          contains: markerNeedle,
        },
      },
    },
    include: {
      clip: true,
      panels: { orderBy: { panelIndex: 'asc' } },
    },
  })
  const duration = Math.ceil(input.panelDrafts.reduce((sum, panel) => sum + panel.duration, 0))
  const commonClipData = {
    start: 0,
    end: duration,
    duration,
    summary: input.title,
    location: Array.from(new Set(input.panelDrafts.map((panel) => panel.location))).join('、') || null,
    characters: JSON.stringify([]),
    content: input.userPrompt,
    shotCount: input.panelDrafts.length,
    screenplay: marker,
    props: null,
  }
  const storyboardTextJson = JSON.stringify({
    source: 'edit_screenplay',
    sourceType: 'directScreenplayStoryboard',
    screenplayId: input.screenplayId,
    title: input.title,
    productionLocations: formatProductionLocationsForStorage(input.productionLocations),
    productionSegments: input.productionSegments,
    segmentContinuityBibles: input.segmentContinuityBibles,
    sceneZones: formatSceneZonesForStorage(input.sceneZones),
    panels: formatPanelDraftsForStorage(input.panelDrafts),
    panelGroups: input.panelGroups,
    sceneContinuityLoops: input.sceneContinuityLoops,
  })
  const photographyPlan = JSON.stringify({
    source: 'edit_screenplay',
    sourceType: 'directScreenplayStoryboard',
    consistencyMode: 'production_segment_continuity_storyboard',
    currentStage: 'panel_prompts_ready',
    screenplayId: input.screenplayId,
    productionLocations: formatProductionLocationsForStorage(input.productionLocations),
    productionSegments: input.productionSegments,
    segmentContinuityBibles: input.segmentContinuityBibles,
    sceneZones: formatSceneZonesForStorage(input.sceneZones),
    panelGroups: input.panelGroups,
    sceneContinuityLoops: input.sceneContinuityLoops,
  })

  const storyboard = existing
    ? await prisma.$transaction(async (tx) => {
      await tx.projectClip.update({
        where: { id: existing.clipId },
        data: commonClipData,
      })
      await tx.projectStoryboard.update({
        where: { id: existing.id },
        data: {
          panelCount: input.panelDrafts.length,
          storyboardTextJson,
          photographyPlan,
          lastError: null,
        },
      })
      return await tx.projectStoryboard.findUniqueOrThrow({
        where: { id: existing.id },
        include: { panels: { orderBy: { panelIndex: 'asc' } } },
      })
    })
    : await prisma.$transaction(async (tx) => {
      const clip = await tx.projectClip.create({
        data: {
          episodeId: input.episodeId,
          ...commonClipData,
        },
      })
      return await tx.projectStoryboard.create({
        data: {
          episodeId: input.episodeId,
          clipId: clip.id,
          panelCount: input.panelDrafts.length,
          storyboardTextJson,
          photographyPlan,
        },
        include: { panels: { orderBy: { panelIndex: 'asc' } } },
      })
    })

  const existingPanels = new Map(storyboard.panels.map((panel) => [panel.panelIndex, panel]))
  await prisma.projectPanel.deleteMany({
    where: {
      storyboardId: storyboard.id,
      panelIndex: { gte: input.panelDrafts.length },
    },
  })
  const panelIds: string[] = []
  for (const draft of input.panelDrafts) {
    const data = {
      panelNumber: draft.panelNumber,
      shotType: draft.shotType,
      cameraMove: draft.cameraMove,
      description: draft.description,
      location: draft.location,
      characters: draft.characters,
      props: draft.props,
      srtSegment: draft.srtSegment,
      srtStart: draft.srtStart,
      srtEnd: draft.srtEnd,
      duration: draft.duration,
      imagePrompt: draft.imagePrompt,
      imageUrl: null,
      imageMedia: { disconnect: true },
      candidateImages: null,
      videoPrompt: draft.videoPrompt,
      photographyRules: draft.photographyRules,
      actingNotes: draft.actingNotes,
    } satisfies Prisma.ProjectPanelUpdateInput
    const existingPanel = existingPanels.get(draft.panelIndex)
    if (existingPanel) {
      const panel = await prisma.projectPanel.update({
        where: { id: existingPanel.id },
        data,
      })
      panelIds.push(panel.id)
      continue
    }
    const panel = await prisma.projectPanel.create({
      data: {
        storyboardId: storyboard.id,
        panelIndex: draft.panelIndex,
        panelNumber: draft.panelNumber,
        shotType: draft.shotType,
        cameraMove: draft.cameraMove,
        description: draft.description,
        location: draft.location,
        characters: draft.characters,
        props: draft.props,
        srtSegment: draft.srtSegment,
        srtStart: draft.srtStart,
        srtEnd: draft.srtEnd,
        duration: draft.duration,
        imagePrompt: draft.imagePrompt,
        imageUrl: null,
        candidateImages: null,
        videoPrompt: draft.videoPrompt,
        photographyRules: draft.photographyRules,
        actingNotes: draft.actingNotes,
      },
    })
    panelIds.push(panel.id)
  }
  return { storyboardId: storyboard.id, panelIds }
}

async function appendDirectStoryboard(input: {
  readonly projectId: string
  readonly episodeId: string
  readonly screenplayId: string
  readonly panelDrafts: readonly PanelDraft[]
  readonly productionLocations: readonly ProductionLocationGroup[]
  readonly productionSegments: readonly ProductionSegment[]
  readonly segmentContinuityBibles: readonly SegmentContinuityBible[]
  readonly sceneZones: readonly SceneZone[]
  readonly panelGroups: readonly ValidatedStoryboardPanelGroup[]
  readonly sceneContinuityLoops: readonly SceneContinuityLoop[]
  readonly continuationContext: StoryboardContinuationContext
}): Promise<{ readonly storyboardId: string; readonly panelIds: readonly string[] }> {
  const existing = await loadExistingDirectStoryboard({
    episodeId: input.episodeId,
    screenplayId: input.screenplayId,
  })
  if (!existing) throw new Error('SCREENPLAY_STORYBOARD_APPEND_REQUIRES_EXISTING_STORYBOARD')

  const existingPanelIndices = new Set(existing.panels.map((panel) => panel.panelIndex))
  for (const draft of input.panelDrafts) {
    if (existingPanelIndices.has(draft.panelIndex)) {
      throw new Error(`SCREENPLAY_STORYBOARD_APPEND_PANEL_INDEX_COLLISION:${draft.panelIndex}`)
    }
  }

  const previousStoryboardText = parseStoredRecordJson(existing.storyboardTextJson, 'storyboard.storyboardTextJson')
  const previousPhotographyPlan = parseStoredRecordJson(existing.photographyPlan, 'storyboard.photographyPlan')
  const previousProductionLocations = readStoredRecordArray(previousStoryboardText.productionLocations, 'storyboard.productionLocations')
  const previousProductionSegments = readStoredRecordArray(previousStoryboardText.productionSegments, 'storyboard.productionSegments')
  const previousSegmentContinuityBibles = readStoredRecordArray(previousStoryboardText.segmentContinuityBibles, 'storyboard.segmentContinuityBibles')
  const previousSceneZones = readStoredRecordArray(previousStoryboardText.sceneZones, 'storyboard.sceneZones')
  const previousPanels = readStoredRecordArray(previousStoryboardText.panels, 'storyboard.panels')
  const previousPanelGroups = readStoredRecordArray(previousStoryboardText.panelGroups, 'storyboard.panelGroups')
  const previousSceneContinuityLoops = readStoredRecordArray(previousStoryboardText.sceneContinuityLoops, 'storyboard.sceneContinuityLoops')

  const panelNumberOffset = input.continuationContext.existingPanelCount
  const panelGroupNumberOffset = input.continuationContext.nextPanelGroupNumber - 1
  const productionSegmentOrderOffset = previousProductionSegments.length
  const newPanelGroups = offsetPanelGroups({
    panelGroups: input.panelGroups,
    panelNumberOffset,
    panelGroupNumberOffset,
  })
  const newSceneContinuityLoops = offsetSceneContinuityLoops({
    loops: input.sceneContinuityLoops,
    panelNumberOffset,
  })
  const newProductionSegments = offsetProductionSegmentOrders({
    productionSegments: input.productionSegments,
    orderOffset: productionSegmentOrderOffset,
  })

  const newProductionLocations = formatProductionLocationsForStorage(input.productionLocations)
  const newSceneZones = formatSceneZonesForStorage(input.sceneZones)
  const newPanels = formatPanelDraftsForStorage(input.panelDrafts)
  const storyboardTextJson = JSON.stringify({
    ...previousStoryboardText,
    source: 'edit_screenplay',
    sourceType: 'directScreenplayStoryboard',
    screenplayId: input.screenplayId,
    productionLocations: mergeStoredRecordArraysByKey({
      existing: previousProductionLocations,
      incoming: newProductionLocations,
      key: 'productionLocationId',
    }),
    productionSegments: [...previousProductionSegments, ...newProductionSegments],
    segmentContinuityBibles: [...previousSegmentContinuityBibles, ...input.segmentContinuityBibles],
    sceneZones: mergeStoredRecordArraysByKey({
      existing: previousSceneZones,
      incoming: newSceneZones,
      key: 'sceneZoneId',
    }),
    panels: [...previousPanels, ...newPanels],
    panelGroups: [...previousPanelGroups, ...newPanelGroups],
    sceneContinuityLoops: [...previousSceneContinuityLoops, ...newSceneContinuityLoops],
  })
  const photographyPlan = JSON.stringify({
    ...previousPhotographyPlan,
    source: 'edit_screenplay',
    sourceType: 'directScreenplayStoryboard',
    consistencyMode: 'production_segment_continuity_storyboard',
    currentStage: 'panel_prompts_ready',
    screenplayId: input.screenplayId,
    productionLocations: mergeStoredRecordArraysByKey({
      existing: readStoredRecordArray(previousPhotographyPlan.productionLocations, 'photographyPlan.productionLocations'),
      incoming: newProductionLocations,
      key: 'productionLocationId',
    }),
    productionSegments: [
      ...readStoredRecordArray(previousPhotographyPlan.productionSegments, 'photographyPlan.productionSegments'),
      ...newProductionSegments,
    ],
    segmentContinuityBibles: [
      ...readStoredRecordArray(previousPhotographyPlan.segmentContinuityBibles, 'photographyPlan.segmentContinuityBibles'),
      ...input.segmentContinuityBibles,
    ],
    sceneZones: mergeStoredRecordArraysByKey({
      existing: readStoredRecordArray(previousPhotographyPlan.sceneZones, 'photographyPlan.sceneZones'),
      incoming: newSceneZones,
      key: 'sceneZoneId',
    }),
    panelGroups: [
      ...readStoredRecordArray(previousPhotographyPlan.panelGroups, 'photographyPlan.panelGroups'),
      ...newPanelGroups,
    ],
    sceneContinuityLoops: [
      ...readStoredRecordArray(previousPhotographyPlan.sceneContinuityLoops, 'photographyPlan.sceneContinuityLoops'),
      ...newSceneContinuityLoops,
    ],
  })

  const appendedDuration = Math.ceil(input.panelDrafts.reduce((sum, panel) => sum + panel.duration, 0))
  const existingClipEnd = readRequiredFiniteNumber(existing.clip.end, 'existing.clip.end')
  const existingClipDuration = readRequiredFiniteNumber(existing.clip.duration, 'existing.clip.duration')
  const panelIds: string[] = []
  await prisma.$transaction(async (tx) => {
    await tx.projectClip.update({
      where: { id: existing.clipId },
      data: {
        end: existingClipEnd + appendedDuration,
        duration: existingClipDuration + appendedDuration,
        shotCount: existing.panels.length + input.panelDrafts.length,
        location: Array.from(new Set([
          ...(existing.clip.location?.split('、').map((value) => value.trim()).filter(Boolean) ?? []),
          ...input.panelDrafts.map((panel) => panel.location),
        ])).join('、') || null,
      },
    })
    await tx.projectStoryboard.update({
      where: { id: existing.id },
      data: {
        panelCount: existing.panels.length + input.panelDrafts.length,
        storyboardTextJson,
        photographyPlan,
        lastError: null,
      },
    })
    for (const draft of input.panelDrafts) {
      const panel = await tx.projectPanel.create({
        data: {
          storyboardId: existing.id,
          panelIndex: draft.panelIndex,
          panelNumber: draft.panelNumber,
          shotType: draft.shotType,
          cameraMove: draft.cameraMove,
          description: draft.description,
          location: draft.location,
          characters: draft.characters,
          props: draft.props,
          srtSegment: draft.srtSegment,
          srtStart: draft.srtStart,
          srtEnd: draft.srtEnd,
          duration: draft.duration,
          imagePrompt: draft.imagePrompt,
          videoPrompt: draft.videoPrompt,
          photographyRules: draft.photographyRules,
          actingNotes: draft.actingNotes,
        },
      })
      panelIds.push(panel.id)
    }
  })
  return { storyboardId: existing.id, panelIds }
}

export async function generateScreenplayStoryboardPanels(input: GenerateScreenplayStoryboardInput): Promise<GenerateScreenplayStoryboardResult> {
  const panelLimit = normalizePanelLimit(input.panelLimit)
  const generationMode = input.generationMode ?? 'replace'
  const [project, screenplay, config, characters, locations, props] = await Promise.all([
    prisma.project.findFirst({
      where: { id: input.projectId, userId: input.userId },
      select: { id: true, videoRatio: true },
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
        storyDevelopmentJson: true,
        screenplayText: true,
        styleBibleJson: true,
      },
    }),
    getProjectModelConfig(input.projectId, input.userId),
    loadCharacterAssets(input.projectId),
    loadLocationAssets(input.projectId),
    loadPropAssets(input.projectId),
  ])
  if (!project || !screenplay) throw new ApiError('NOT_FOUND')
  if (!config.analysisModel) {
    throw new ApiError('INVALID_PARAMS', { code: 'ANALYSIS_MODEL_REQUIRED', message: 'Analysis model is required' })
  }
  if (characters.length === 0 || locations.length === 0) {
    throw new ApiError('CONFLICT', { code: 'SCREENPLAY_STORYBOARD_ASSETS_REQUIRED', message: 'Project character and location assets are required' })
  }
  const missingLocationProfiles = locations.filter((location) => location.spatialProfileStatus !== 'ready' || !location.spatialProfileJson)
  if (missingLocationProfiles.length > 0) {
    throw new ApiError('CONFLICT', {
      code: 'SCREENPLAY_STORYBOARD_LOCATION_SPATIAL_FACTS_REQUIRED',
      message: `Ready location spatial facts are required: ${missingLocationProfiles.map((location) => location.name).join(', ')}`,
    })
  }
  const existingStoryboard = generationMode === 'append'
    ? await loadExistingDirectStoryboard({
      episodeId: input.episodeId,
      screenplayId: screenplay.id,
    })
    : null
  const baseContinuationContext = generationMode === 'append'
    ? buildContinuationContextFromExistingStoryboard(existingStoryboard)
    : null
  const continuationContext = baseContinuationContext
    ? {
      ...baseContinuationContext,
      productionLocationRegistry: buildProductionLocationRegistry({
        previousProductionLocations: baseContinuationContext.previousProductionLocations,
        previousProductionSegments: baseContinuationContext.previousProductionSegments,
        previousSceneZones: baseContinuationContext.previousSceneZones,
        locations,
        characters,
      }),
    }
    : null

  const prompt = buildPromptContent({
    screenplayText: continuationContext
      ? selectContinuationScreenplayTextForStoryboard({
        screenplayText: screenplay.screenplayText,
        panelLimit,
        startAfterScreenplaySceneNumber: continuationContext.lastScreenplaySceneNumber,
      })
      : selectOpeningScreenplayTextForStoryboard({
        screenplayText: screenplay.screenplayText,
        panelLimit,
      }),
    storyDevelopmentJson: screenplay.storyDevelopmentJson,
    visualStyle: visualStylePromptBlock(screenplay.styleBibleJson),
    videoRatio: project.videoRatio,
    panelLimit,
    characters,
    locations,
    props,
    continuationContext,
  })
  let promptForAttempt = prompt
  let validated: ValidatedDirectStoryboardOutput | null = null
  let lastValidationError = ''
  for (let attempt = 1; attempt <= DIRECT_STORYBOARD_MAX_ATTEMPTS; attempt += 1) {
    const completion = await executeDirectStoryboardTextStep({
      userId: input.userId,
      projectId: input.projectId,
      model: config.analysisModel,
      prompt: promptForAttempt,
      attempt,
    })
    try {
      validated = parseAndValidateDirectStoryboardOutput({
        completionText: completion.text,
        panelLimit,
        characters,
        locations,
        props,
        continuationContext,
      })
      break
    } catch (error: unknown) {
      lastValidationError = formatDirectStoryboardGenerationError(error)
      if (attempt === DIRECT_STORYBOARD_MAX_ATTEMPTS) {
        throw new Error(`SCREENPLAY_STORYBOARD_VALIDATION_FAILED_AFTER_REPAIR:${lastValidationError}`)
      }
      promptForAttempt = buildRepairPromptContent({
        basePrompt: prompt,
        attempt: attempt + 1,
        validationError: lastValidationError,
      })
    }
  }
  if (!validated) {
    throw new Error(`SCREENPLAY_STORYBOARD_VALIDATION_FAILED_AFTER_REPAIR:${lastValidationError || 'unknown'}`)
  }
  const {
    parsed,
    panelGroups,
    productionLocations,
    productionSegments,
    segmentContinuityBibles,
    sceneContinuityLoops,
  } = validated
  const title = screenplay.screenplayText.match(/《([^》]+)》/)?.[1] ?? '剧本分镜'
  const panelDrafts = buildPanelDrafts({
    panels: parsed.panels,
    characters,
    locations,
    productionSegments,
    segmentContinuityBibles,
    sceneZones: parsed.sceneZones,
    panelGroups,
    screenplayId: screenplay.id,
    panelIndexOffset: continuationContext?.nextPanelIndex,
    panelNumberOffset: continuationContext?.existingPanelCount,
    panelGroupNumberOffset: continuationContext ? continuationContext.nextPanelGroupNumber - 1 : undefined,
    srtOffset: continuationContext?.nextSrtStart,
  })
  const storyboard = continuationContext
    ? await appendDirectStoryboard({
      projectId: input.projectId,
      episodeId: input.episodeId,
      screenplayId: screenplay.id,
      panelDrafts,
      productionLocations,
      productionSegments,
      segmentContinuityBibles,
      sceneZones: parsed.sceneZones,
      panelGroups,
      sceneContinuityLoops,
      continuationContext,
    })
    : await upsertDirectStoryboard({
    projectId: input.projectId,
    episodeId: input.episodeId,
    screenplayId: screenplay.id,
    title,
    userPrompt: screenplay.userPrompt,
    panelDrafts,
    productionLocations,
    productionSegments,
    segmentContinuityBibles,
    sceneZones: parsed.sceneZones,
    panelGroups,
    sceneContinuityLoops,
  })
  return {
    storyboardId: storyboard.storyboardId,
    panelCount: storyboard.panelIds.length,
    panelIds: storyboard.panelIds,
    imageTaskIds: [],
  }
}

export async function submitScreenplayStoryboardTask(input: {
  readonly projectId: string
  readonly userId: string
  readonly episodeId: string
  readonly locale: Locale
  readonly generationMode?: 'replace' | 'append'
  readonly requestId?: string | null
}) {
  const generationMode = input.generationMode ?? 'replace'
  const screenplay = await prisma.projectEditScreenplay.findFirst({
    where: {
      projectId: input.projectId,
      episodeId: input.episodeId,
      status: 'ready',
    },
    orderBy: { updatedAt: 'desc' },
    select: { id: true },
  })
  if (!screenplay) throw new ApiError('NOT_FOUND')
  const submitted = await submitTask({
    userId: input.userId,
    locale: input.locale,
    projectId: input.projectId,
    episodeId: input.episodeId,
    type: TASK_TYPE.EDIT_SCRIPT_STORYBOARD_CAMERA_PLAN,
    targetType: 'ProjectEditScreenplay',
    targetId: screenplay.id,
    operationId: 'generate_edit_script_storyboard',
    operationSource: 'project-ui',
    requestId: input.requestId || null,
    payload: {
      mode: 'direct_screenplay_storyboard',
      screenplayId: screenplay.id,
      generationMode,
    },
    dedupeKey: `direct_screenplay_storyboard:${generationMode}:${input.projectId}:${input.episodeId}:${screenplay.id}`,
  })
  return {
    ...submitted,
    screenplayId: screenplay.id,
  }
}
