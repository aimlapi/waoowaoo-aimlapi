import { Prisma } from '@prisma/client'
import { z } from 'zod'
import type { Locale } from '@/i18n/routing'
import { ApiError } from '@/lib/api-errors'
import { executeAiTextStep } from '@/lib/ai-exec/engine'
import { getProjectModelConfig } from '@/lib/config-service'
import { decodeImageUrlsFromDb } from '@/lib/contracts/image-urls-contract'
import { prisma } from '@/lib/prisma'
import { submitTask } from '@/lib/task/submitter'
import { TASK_TYPE } from '@/lib/task/types'
import { parseNullableEditScriptStyleBible } from '@/lib/edit-script/style-bible-prompt'
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
  imagePrompt: z.string().trim().min(20),
  videoPrompt: z.string().trim().min(20),
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

function normalizePanelLimit(value: number | undefined): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return 12
  return Math.max(1, Math.min(120, Math.floor(value)))
}

function stringifyForPrompt(value: unknown): string {
  return JSON.stringify(value, null, 2)
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

function buildPrompt(input: {
  readonly screenplayText: string
  readonly storyDevelopmentJson: Prisma.JsonValue | null
  readonly visualStyle: Record<string, unknown>
  readonly videoRatio: string
  readonly panelLimit: number
  readonly characters: readonly CharacterAsset[]
  readonly locations: readonly LocationAsset[]
  readonly props: readonly PropAsset[]
}) {
  return [
    '你是直接分镜 Panel Agent。禁止生成或依赖导演拆镜、剪辑表、edit table、shotsJson、videoBlocksJson 或独立摄影指导方案。',
    '你只能从剧本正文、剧作开发 JSON、纯视觉风格、项目角色资产、项目场景资产和轻量空间事实生成 storyboard panels。',
    `请从剧本开头按叙事顺序生成前 ${input.panelLimit} 个 storyboard panel，不得跳选，不得重排，不得提前抽后文高潮。`,
    '每个 panel 必须是一张可直接生成分镜图的画面，不是剪辑表镜头。',
    '输出严格 JSON，不要 Markdown。',
    '',
    'JSON 格式：',
    '{"productionLocations":[{"productionLocationId":"","locationId":"","stableSpatialFacts":[""],"reusableAnchors":[""],"stableSetDressing":[""],"nonPersistentStateBans":[""]}],"productionSegments":[{"productionSegmentId":"","order":1,"originalOrderKey":"001.001","screenplaySceneNumber":1,"productionLocationId":"","locationId":"","environment":"","sourceText":"","characterNames":[""],"propNames":[""]}],"segmentContinuityBibles":[{"productionSegmentId":"","originalOrderKey":"001.001","screenplaySceneNumber":1,"dramaticContext":"","temporalState":"","atmosphereState":"","crowdState":"","spatialContinuity":[""],"persistentSetState":[{"name":"","kind":"set_dressing","continuityRule":""}],"characterContinuity":[{"characterName":"","initialPosition":"","blockingArc":"","eyelineRules":[""]}],"screenDirectionRules":[""],"forbiddenChanges":[""]}],"sceneZones":[{"sceneZoneId":"","locationId":"","name":"","overallPosition":"","fixedAnchors":[""]}],"panels":[{"panelNumber":1,"productionSegmentId":"","sourceText":"","description":"","locationId":"","sceneZoneId":"","characters":[""],"props":[""],"omittedSceneAssets":[{"name":"","kind":"character","reason":""}],"shotType":"","cameraMove":"","duration":4,"imagePrompt":"","videoPrompt":"","shotBlocking":{"sceneZoneId":"","subjectPosition":"","cameraPosition":"","screenComposition":"","characterPlacements":[{"characterName":"","subjectPosition":"","facing":"","eyeline":""}]},"panelContinuity":{"inheritedContinuity":[""],"changedContinuity":[""],"visibleContinuityElements":[""],"forbiddenDiscontinuity":[""]},"actingNotes":""}],"panelGroups":[{"groupNumber":1,"panelNumbers":[1,2],"sceneZoneIds":[""],"continuityRule":""}],"sceneContinuityLoops":[{"productionSegmentId":"","auditRound":1,"checkedPanelNumbers":[1,2],"checkedContinuityAxes":["space","character_blocking","eyeline"],"detectedIssues":[""],"repairActions":[""],"locked":true}]}',
    '',
    '字段要求：',
    '- panelNumber 从 1 连续递增。',
    '- 剧作 Scene 保持剧本原有结构；productionSegments 必须在每个剧作 Scene 内按制片物理场景拆分，不得把剧作 Scene 当作制片场景。',
    '- productionSegments 必须只按剧本时间顺序中的当下发生场景切分：同一连续环境、同一现实空间、同一段正在发生的剧情为一个 productionSegment。',
    '- 禁止因为人物/道具出入画、人物/道具增减、剧情强弱转折、电话威胁升级、反应变化，把同一当下发生场景拆成多个 productionSegment。',
    '- originalOrderKey 格式必须是 001.001：前三位是剧作 Scene 编号，后三位是该剧作 Scene 内的制片物理场景片段序号。',
    '- screenplaySceneNumber 必须是该片段所属的剧作 Scene 编号。',
    '- productionLocationId 必须引用 productionLocations.productionLocationId；locationId 必须复制对应项目场景资产的 locationId。',
    '- 同一 productionLocation 只共享长期空间资产和稳定布景，不共享剧情状态、时间状态、桌面状态、群众状态或人物关系状态。',
    '- productionSegments.characterNames / propNames 是该当下发生场景内出现过的人物和道具汇总结果；场景边界只能由剧情正在发生的连续环境和现实空间决定。',
    '- panel.productionSegmentId 必须引用 productionSegments 中的 productionSegmentId。',
    '- productionSegment 的 characterNames / propNames 默认每张 panel 都应入画。',
    '- 禁止用空镜、纯环境镜头、纯道具插入镜头替代剧情 panel；每个 panel 必须承载人物处境、动作或反应。',
    '- 远景、全景、中景、近景都必须让所属 productionSegment 的全部 characterNames / propNames 入画；可以放在前景、背景、焦外或阴影里，但不能画外。',
    '- 只有极近景、很小景别特写、插入细节镜头，才允许因为构图裁切省略部分 productionSegment 资产。',
    '- 即使是极近景/插入细节镜头，也必须至少包含一个所属 productionSegment 的人物或道具资产；禁止 characters=[] 且 props=[] 的空资产 panel。',
    '- 电话通话、威胁、反应、对白场面优先拍人物关系；不要只拍手机屏幕、桌面、灯、门、积水等环境物件。',
    '- 每个 panel 的 characters / props 是该镜头实际入画的资产，必须来自所属 productionSegment 的 characterNames / propNames，不得跨场景段借人或借物。',
    '- 如果某个 productionSegment 资产因景别、遮挡、画外声、构图裁切等原因没有出现在当前 panel，必须逐项写入 omittedSceneAssets，并给出具体 reason。',
    '- omittedSceneAssets 只能包含所属 productionSegment 的资产；已经写入 characters / props 的资产不能再写入 omittedSceneAssets。',
    '- characters / props 与 omittedSceneAssets 合并后，必须完整覆盖所属 productionSegment 的 characterNames / propNames；没有显式 omission 就视为漏资产。',
    '- 若做电话两端、异地反应，必须拆成不同 productionSegment，不得在同一个 productionSegment 中用 omission 混过。',
    '- sourceText 必须来自剧本开头对应段落，可压缩但不能改写剧情事实。',
    '- description 写画面里实际可见的动作、人物位置、情绪和空间关系。',
    '- characters 只能使用项目角色资产中的 name；没有出现角色就空数组。',
    '- locationId 必须复制对应项目场景资产的 locationId。',
    '- sceneZoneId 必须引用 sceneZones 中的 sceneZoneId。',
    '- imagePrompt 必须包含画幅、角色、场景、动作、景别、光线、地域/生活纹理，不要字幕、水印、Logo。',
    '- videoPrompt 可以在 imagePrompt 基础上加入运动和声音，但不要新增剧情。',
    '- actingNotes 只写表演状态、身体动作、眼神/停顿。',
    '',
    'Production Location Grouping 要求：',
    '- productionLocations 只记录同一制片物理场景的长期稳定事实：空间结构、稳定锚点、长期布景、不能跨场景段继承的状态禁令。',
    '- stableSpatialFacts / reusableAnchors 只能来自项目场景资产、空间事实或剧本明确描述；不得把气氛、海报、红光、赛事氛围升级成路牌、招牌、霓虹灯等新硬锚点。',
    '- nonPersistentStateBans 必须说明哪些内容不能因为同一地点而跨剧情段继承，例如夜晚人群、桌上菜、当前现金、某次比赛状态。',
    '',
    'Segment Continuity Bible 要求：',
    '- 每个 productionSegment 必须有且只有一个 segmentContinuityBible；这是当前这幕戏的短期连续性状态表。',
    '- dramaticContext 写这段戏的戏剧压力；temporalState 写日夜/时间阶段；atmosphereState 写当前气氛；crowdState 写群众密度与变化。',
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
    '- checkedContinuityAxes 至少包含 space、character_blocking、eyeline、persistent_props、crowd_state 中的三项。',
    '- 若发现断裂，必须在 repairActions 写明已如何修正 panel 的 sceneZone、shotBlocking、panelContinuity 或 imagePrompt；最终 locked 必须为 true。',
    '',
    `画幅：${input.videoRatio}`,
    '',
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
    '剧作开发 JSON：',
    stringifyForPrompt(input.storyDevelopmentJson),
    '',
    '剧本正文：',
    input.screenplayText,
  ].join('\n')
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

function buildPanelDrafts(input: {
  readonly panels: readonly z.infer<typeof directPanelSchema>[]
  readonly characters: readonly CharacterAsset[]
  readonly locations: readonly LocationAsset[]
  readonly productionSegments: readonly ProductionSegment[]
  readonly segmentContinuityBibles: readonly SegmentContinuityBible[]
  readonly sceneZones: readonly SceneZone[]
  readonly panelGroups: readonly ValidatedStoryboardPanelGroup[]
  readonly screenplayId: string
}): PanelDraft[] {
  let cursor = 0
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
    const sourceVideoBlockId = `${input.screenplayId}:panelGroup:${group.groupNumber}`
    const source = {
      source: 'edit_screenplay',
      sourceType: 'directScreenplayStoryboardPanel',
      screenplayId: input.screenplayId,
      panelNumber: panel.panelNumber,
      productionSegmentId: panel.productionSegmentId,
      originalOrderKey: productionSegment.originalOrderKey,
      screenplaySceneNumber: productionSegment.screenplaySceneNumber,
      productionLocationId: productionSegment.productionLocationId,
      sourceVideoBlockKind: group.panelNumbers.length > 1 ? 'group' : 'single',
      sourceVideoBlockId,
      locationId: panel.locationId,
      sceneZoneId: panel.sceneZoneId,
      sceneZone: {
        sceneZoneId: sceneZone.sceneZoneId,
        locationId: sceneZone.locationId,
        name: sceneZone.name,
        overallPosition: sceneZone.overallPosition,
        fixedAnchors: sceneZone.fixedAnchors,
      },
      omittedSceneAssets: panel.omittedSceneAssets,
      shotBlocking: panel.shotBlocking,
      segmentContinuityBible,
      panelContinuity: panel.panelContinuity,
      continuityRule: group.continuityRule,
    }
    return {
      panelIndex: index,
      panelNumber: index + 1,
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
      imagePrompt: panel.imagePrompt,
      videoPrompt: panel.videoPrompt,
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
    panels: input.panelDrafts.map((panel) => ({
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
    })),
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

export async function generateScreenplayStoryboardPanels(input: GenerateScreenplayStoryboardInput): Promise<GenerateScreenplayStoryboardResult> {
  const panelLimit = normalizePanelLimit(input.panelLimit)
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

  const prompt = buildPrompt({
    screenplayText: screenplay.screenplayText,
    storyDevelopmentJson: screenplay.storyDevelopmentJson,
    visualStyle: visualStylePromptBlock(screenplay.styleBibleJson),
    videoRatio: project.videoRatio,
    panelLimit,
    characters,
    locations,
    props,
  })
  const completion = await executeAiTextStep({
    userId: input.userId,
    projectId: input.projectId,
    model: config.analysisModel,
    messages: [{ role: 'user', content: prompt }],
    temperature: 0.35,
    action: 'screenplay-storyboard-panels',
    meta: {
      stepId: 'screenplay-storyboard-panels',
      stepTitle: 'Generate screenplay storyboard panels',
      stepIndex: 1,
      stepTotal: 1,
    },
  })
  if (!completion.text.trim()) throw new Error('SCREENPLAY_STORYBOARD_LLM_EMPTY')
  const parsed = directStoryboardOutputSchema.parse(parseJsonObjectResponse(completion.text))
  if (parsed.panels.length !== panelLimit) {
    throw new Error(`SCREENPLAY_STORYBOARD_PANEL_COUNT_MISMATCH: expected ${panelLimit}, got ${parsed.panels.length}`)
  }
  const panelGroups = validateStoryboardPanelGroups({
    groups: parsed.panelGroups,
    panelNumbers: parsed.panels.map((panel) => panel.panelNumber),
  })
  const productionLocations = validateProductionLocationGroups({
    productionLocations: parsed.productionLocations,
    locations,
  })
  const productionSegments = validateProductionSegments({
    productionSegments: parsed.productionSegments,
    productionLocations,
    characters,
    props,
    locations,
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
    locations,
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
    loops: parsed.sceneContinuityLoops,
    panelNumbersBySegment,
  })
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
  })
  const storyboard = await upsertDirectStoryboard({
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
  readonly requestId?: string | null
}) {
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
    },
    dedupeKey: `direct_screenplay_storyboard:${input.projectId}:${input.episodeId}:${screenplay.id}`,
  })
  return {
    ...submitted,
    screenplayId: screenplay.id,
  }
}
