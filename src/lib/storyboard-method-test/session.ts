import type { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { encodeImageUrls } from '@/lib/contracts/image-urls-contract'
import { createDevStoryboardProjectShell } from '@/lib/dev-ab-test/project-shell'
import {
  createStoryboardBatchBranches,
  type SharedStoryboardSetup,
  type StoryboardBatchProjectResult,
} from '@/lib/dev-ab-test/storyboard-project-batch'
import { rollbackStoryboardBatchProject, toError } from '@/lib/dev-ab-test/storyboard-batch-rollback'
import { generateProjectEditScreenplay } from '@/lib/edit-script/service'
import { submitAssetGenerateTask } from '@/lib/assets/services/asset-actions'
import { submitProjectVisualReferenceCases } from '@/lib/visual-reference-cases/service'
import { stringifyAppearanceCandidateMetadata, type CharacterAppearanceCandidateMetadata } from '@/types/character-casting'
import type { Locale } from '@/i18n/routing'

export interface CreateStoryboardMethodTestSessionInput {
  readonly request: NextRequest
  readonly userId: string
  readonly locale: Locale
  readonly requestId?: string | null
  readonly creativeBrief: string
  readonly styleReferenceNote: string
  readonly projectName: string
  readonly videoRatio: '9:16' | '16:9' | '21:9'
  readonly artStyle: string
  readonly panelCount: number
}

export interface StoryboardMethodTestTaskRef {
  readonly stage: 'style-reference' | 'character-asset' | 'scene-asset'
  readonly label: string
  readonly targetId: string
  readonly taskId: string
  readonly status: string
}

export interface StoryboardMethodTestSessionResult {
  readonly projectId: string
  readonly episodeId: string
  readonly screenplayId: string
  readonly projectName: string
  readonly upstreamTasks: StoryboardMethodTestTaskRef[]
  readonly storyboardBranches: StoryboardBatchProjectResult[]
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value)
}

function readString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

function readTaskRef(value: unknown, input: {
  readonly stage: StoryboardMethodTestTaskRef['stage']
  readonly label: string
  readonly targetId: string
}): StoryboardMethodTestTaskRef {
  if (!isRecord(value)) throw new Error(`STORYBOARD_METHOD_TEST_TASK_SUBMISSION_INVALID:${input.stage}`)
  const taskId = readString(value.taskId)
  if (!taskId) throw new Error(`STORYBOARD_METHOD_TEST_TASK_ID_MISSING:${input.stage}`)
  return {
    stage: input.stage,
    label: input.label,
    targetId: input.targetId,
    taskId,
    status: readString(value.status) || 'queued',
  }
}

function baseProjectDescription(locale: Locale): string {
  return locale === 'en'
    ? 'Dedicated storyboard method test project with a normal upstream screenplay, isolated style reference, character asset sheets, and 360 scene references before storyboard branching.'
    : '独立分镜方法测试项目：先走剧本、独立风格示意、人物定妆资产、360 场景资产，再进入三种分镜方案分叉。'
}

function buildScreenplayPrompt(input: CreateStoryboardMethodTestSessionInput): string {
  const styleNote = input.styleReferenceNote.trim()
  if (input.locale === 'en') {
    return [
      input.creativeBrief.trim(),
      `Aspect ratio: ${input.videoRatio}.`,
      'Visual direction: restrained realist cinema inspired by Hou Hsiao-hsien: long-take observation, emotional distance, natural light, quiet hometown textures.',
      styleNote ? `User style indication note: ${styleNote}. This note is only for the standalone style indication stage; do not bind it to character identity or storyboard continuity.` : '',
    ].filter(Boolean).join('\n')
  }
  return [
    input.creativeBrief.trim(),
    `画幅：${input.videoRatio}。`,
    '视觉方向：侯孝贤式克制写实电影，长镜头观察感、情绪距离、自然光、安静的老家生活质地。',
    styleNote ? `用户风格示意说明：${styleNote}。该说明只用于独立风格示意阶段，不绑定后续人物身份或分镜连续性。` : '',
  ].filter(Boolean).join('\n')
}

function buildCharacterCandidateMetadata(input: {
  readonly role: 'protagonist' | 'mother' | 'old-classmate'
  readonly description: string
  readonly locale: Locale
  readonly score: number
}): CharacterAppearanceCandidateMetadata {
  const zh = input.locale !== 'en'
  const neutral = zh ? '中性正面身份照' : 'neutral front identity'
  const emotional = zh ? '情绪崩溃/克制泪痕' : 'restrained emotional breakdown'
  const recovery = zh ? '轻微和解后的安静表情' : 'quiet expression after partial reconciliation'
  const costume = zh ? '返乡途中换装定妆' : 'homecoming travel costume'
  const prop = zh ? '关键随身物件定妆' : 'key carried prop'
  const background = zh ? '老家真实环境定妆' : 'hometown environment still'
  return {
    description: input.description,
    visualTraits: {
      face: zh ? '真实亚洲面孔，五官疲惫但不过度戏剧化' : 'realistic Asian face, tired but not melodramatic',
      hair: zh ? '自然黑发，生活化整理，不精致摆拍' : 'natural black hair, lived-in, not glamour-styled',
      body: zh ? '普通人身形，姿态含蓄' : 'ordinary body profile, restrained posture',
      costume: zh ? '现实生活服装，材质朴素，层次清楚' : 'realistic everyday clothing, plain materials, clear layers',
      makeupAndAccessories: zh ? '弱化妆感，少量生活配饰' : 'minimal makeup, few lived-in accessories',
      skin: zh ? '自然肤质，保留疲惫和细节' : 'natural skin texture with fatigue and detail',
      visibleState: zh ? '失业、返乡和自我整理之间的状态' : 'between job loss, homecoming, and self-composure',
      accessibility: '',
      tattoosAndMarks: '',
      scars: '',
    },
    castingNotes: {
      score: input.score,
      strengths: zh ? ['生活感强', '适合克制表演', '身份连续性清晰'] : ['lived-in realism', 'restrained performance', 'clear identity continuity'],
      risks: zh ? ['避免商业硬照感', '避免过度漂亮化'] : ['avoid glossy fashion portraiture', 'avoid over-beautification'],
      recommendation: zh ? '优先作为定妆候选；每个小图必须是同一人物。' : 'Recommended as a casting candidate; every tile must preserve the same person.',
      fitTags: zh ? ['写实', '返乡', '克制'] : ['realist', 'homecoming', 'restrained'],
    },
    castingStills: [
      { kind: 'neutral', title: neutral, prompt: `${input.description}; ${neutral}`, expression: zh ? '平静疲惫' : 'calm and tired', prop: '', background: zh ? '白墙自然光' : 'white wall natural light', purpose: neutral },
      { kind: 'crying', title: emotional, prompt: `${input.description}; ${emotional}`, expression: zh ? '刚哭过但克制' : 'recently cried but controlled', prop: '', background: zh ? '灰白墙面' : 'plain gray-white wall', purpose: emotional },
      { kind: 'smiling', title: recovery, prompt: `${input.description}; ${recovery}`, expression: zh ? '很轻的笑意' : 'very slight smile', prop: '', background: zh ? '老家窗边' : 'hometown window side', purpose: recovery },
      { kind: 'costume', title: costume, prompt: `${input.description}; ${costume}`, expression: zh ? '沉默站立' : 'silent standing', prop: '', background: zh ? '室内全身白底' : 'indoor full-body white background', purpose: costume },
      { kind: 'prop', title: prop, prompt: `${input.description}; ${prop}`, expression: zh ? '低头看物件' : 'looking down at the object', prop: zh ? '旧行李箱、离职文件或车票' : 'old suitcase, resignation papers, or train ticket', background: zh ? '桌面近景' : 'tabletop close view', purpose: prop },
      { kind: 'background', title: background, prompt: `${input.description}; ${background}`, expression: zh ? '站在老家街口' : 'standing at hometown street corner', prop: zh ? '行李箱' : 'suitcase', background: zh ? '县城街口或旧居民楼' : 'county-town street or old residential building', purpose: background },
    ],
  }
}

function characterDescriptions(locale: Locale) {
  if (locale === 'en') {
    return [
      {
        name: 'Lin Qing',
        introduction: '35-year-old single woman who has just lost her job and returns to her hometown.',
        descriptions: [
          'Lin Qing, female, 35, recently unemployed, restrained and tired, plain dark coat, muted sweater, old suitcase, realistic casting contact sheet candidate.',
          'Lin Qing, female, 35, thinner and more fragile option, slightly messy hair, gray T-shirt and dark trousers, visible fatigue, realistic casting contact sheet candidate.',
          'Lin Qing, female, 35, more composed option, short dark coat, simple backpack, guarded expression, realistic casting contact sheet candidate.',
        ],
        role: 'protagonist' as const,
        scoreBase: 92,
      },
      {
        name: 'Mother',
        introduction: 'The protagonist’s mother, practical and emotionally reserved.',
        descriptions: [
          'Mother, female, early 60s, hometown apartment clothes, apron or cardigan, quiet practical gaze, realistic casting contact sheet candidate.',
          'Mother, female, early 60s, rural-town everyday outfit, soft but guarded expression, realistic casting contact sheet candidate.',
          'Mother, female, early 60s, winter house jacket, slightly stooped posture, realistic casting contact sheet candidate.',
        ],
        role: 'mother' as const,
        scoreBase: 88,
      },
      {
        name: 'Old Classmate',
        introduction: 'A hometown acquaintance who reflects the protagonist’s changed relationship with the environment.',
        descriptions: [
          'Old classmate, male, late 30s, county-town worker jacket, kind but awkward presence, realistic casting contact sheet candidate.',
          'Old classmate, male, late 30s, practical dark coat, slightly weathered face, realistic casting contact sheet candidate.',
          'Old classmate, male, late 30s, casual sweater under work jacket, restrained smile, realistic casting contact sheet candidate.',
        ],
        role: 'old-classmate' as const,
        scoreBase: 84,
      },
    ]
  }
  return [
    {
      name: '林青',
      introduction: '35 岁，刚失业的单身女性，带着行李回老家。',
      descriptions: [
        '林青，女性，35 岁，刚失业，疲惫克制，素色深外套、暗色毛衣、旧行李箱，写实选角定妆 contact sheet 候选。',
        '林青，女性，35 岁，更脆弱清瘦的方案，头发略乱，灰 T 恤和深色长裤，疲惫明显，写实选角定妆 contact sheet 候选。',
        '林青，女性，35 岁，更收拢自持的方案，短款深色外套、简单双肩包，表情防备，写实选角定妆 contact sheet 候选。',
      ],
      role: 'protagonist' as const,
      scoreBase: 92,
    },
    {
      name: '母亲',
      introduction: '主角的母亲，务实、节制，不善表达。',
      descriptions: [
        '母亲，女性，60 岁出头，老家居家服、围裙或针织开衫，眼神务实安静，写实选角定妆 contact sheet 候选。',
        '母亲，女性，60 岁出头，县城日常穿着，柔和但有防备的表情，写实选角定妆 contact sheet 候选。',
        '母亲，女性，60 岁出头，冬季居家棉服，身体微微佝偻，写实选角定妆 contact sheet 候选。',
      ],
      role: 'mother' as const,
      scoreBase: 88,
    },
    {
      name: '老同学',
      introduction: '老家的旧识，映照主角与环境关系的变化。',
      descriptions: [
        '老同学，男性，30 岁后半，县城工装夹克，善意但笨拙的存在感，写实选角定妆 contact sheet 候选。',
        '老同学，男性，30 岁后半，实用深色外套，脸有一点风霜感，写实选角定妆 contact sheet 候选。',
        '老同学，男性，30 岁后半，毛衣外搭工作夹克，克制微笑，写实选角定妆 contact sheet 候选。',
      ],
      role: 'old-classmate' as const,
      scoreBase: 84,
    },
  ]
}

function locationAngleDescriptions(locale: Locale): readonly string[] {
  if (locale === 'en') {
    return [
      '360 environment reference sheet angle FRONT: old county-town family apartment living-dining room, dining table center, sofa left wall, door back-right, window back-left, muted winter daylight, realistic location asset reference.',
      '360 environment reference sheet angle FRONT-LEFT: same room, show left wall sofa, window, table relation, unchanged door position, realistic location asset reference.',
      '360 environment reference sheet angle LEFT: same room, table and sofa alignment, visible window wall and lived-in objects, realistic location asset reference.',
      '360 environment reference sheet angle BACK: same room from back side, door remains back-right in world layout, table center, sofa left wall, no mirrored layout, realistic location asset reference.',
      '360 environment reference sheet angle RIGHT: same room, door side and table relation, window remains back-left in world layout, realistic location asset reference.',
      '360 environment reference sheet detail board: door, window, table, sofa, ceiling light, floor texture, old apartment materials, consistent with the same room.',
    ]
  }
  return [
    '360 场景参考板 FRONT 角度：老家县城小公寓客餐厅，餐桌在中心，沙发在左墙，门在后右，窗在后左，冬天自然光，写实场景资产参考。',
    '360 场景参考板 FRONT-LEFT 角度：同一房间，清楚展示左墙沙发、窗、餐桌关系，门的位置不变，写实场景资产参考。',
    '360 场景参考板 LEFT 角度：同一房间，餐桌与沙发的轴线关系明确，窗墙和生活杂物可见，写实场景资产参考。',
    '360 场景参考板 BACK 角度：同一房间从背面看，世界坐标中门仍在后右，餐桌居中，沙发在左墙，不镜像，写实场景资产参考。',
    '360 场景参考板 RIGHT 角度：同一房间，门侧和餐桌关系明确，窗仍属于世界坐标后左，写实场景资产参考。',
    '360 场景细节板：门、窗、餐桌、沙发、顶灯、地面材质、老公寓生活痕迹，必须属于同一个房间。',
  ]
}

async function createCharacterAssets(input: {
  readonly request: NextRequest
  readonly userId: string
  readonly locale: Locale
  readonly projectId: string
  readonly episodeId: string
  readonly artStyle: string
}): Promise<{
  readonly characterIds: readonly string[]
  readonly appearanceIds: readonly string[]
  readonly characterNames: readonly string[]
  readonly tasks: readonly StoryboardMethodTestTaskRef[]
}> {
  const characterIds: string[] = []
  const appearanceIds: string[] = []
  const characterNames: string[] = []
  const tasks: StoryboardMethodTestTaskRef[] = []

  for (const characterInput of characterDescriptions(input.locale)) {
    const metadata = characterInput.descriptions.map((description, index) => buildCharacterCandidateMetadata({
      role: characterInput.role,
      description,
      locale: input.locale,
      score: characterInput.scoreBase - index * 4,
    }))
    const character = await prisma.projectCharacter.create({
      data: {
        projectId: input.projectId,
        name: characterInput.name,
        introduction: characterInput.introduction,
        profileConfirmed: true,
        appearances: {
          create: {
            appearanceIndex: 0,
            changeReason: input.locale === 'en' ? 'storyboard method test casting sheet' : '分镜方法测试定妆板',
            description: characterInput.descriptions[0],
            descriptions: JSON.stringify(characterInput.descriptions),
            descriptionMetadata: stringifyAppearanceCandidateMetadata(metadata),
            imageUrls: encodeImageUrls([]),
            previousImageUrls: encodeImageUrls([]),
          },
        },
      },
      include: { appearances: { orderBy: { appearanceIndex: 'asc' } } },
    })
    const appearanceId = character.appearances[0]?.id
    if (!appearanceId) throw new Error(`STORYBOARD_METHOD_TEST_APPEARANCE_MISSING:${characterInput.name}`)
    characterIds.push(character.id)
    appearanceIds.push(appearanceId)
    characterNames.push(character.name)
    const result = await submitAssetGenerateTask({
      request: input.request,
      kind: 'character',
      assetId: character.id,
      episodeId: input.episodeId,
      body: {
        meta: { locale: input.locale },
        appearanceId,
        count: characterInput.descriptions.length,
        artStyle: input.artStyle,
      },
      access: {
        scope: 'project',
        userId: input.userId,
        projectId: input.projectId,
      },
    })
    tasks.push(readTaskRef(result, {
      stage: 'character-asset',
      label: character.name,
      targetId: appearanceId,
    }))
  }

  return { characterIds, appearanceIds, characterNames, tasks }
}

async function createSceneAsset(input: {
  readonly request: NextRequest
  readonly userId: string
  readonly locale: Locale
  readonly projectId: string
  readonly episodeId: string
  readonly artStyle: string
}): Promise<{
  readonly locationId: string
  readonly tasks: readonly StoryboardMethodTestTaskRef[]
}> {
  const locationName = input.locale === 'en' ? 'Hometown apartment dining room 360 reference' : '老家小公寓客餐厅 360 参考'
  const descriptions = locationAngleDescriptions(input.locale)
  const location = await prisma.projectLocation.create({
    data: {
      projectId: input.projectId,
      name: locationName,
      summary: input.locale === 'en'
        ? 'A single 360-degree scene reference asset with fixed table, sofa, door, and window positions for storyboard continuity testing.'
        : '用于分镜连续性测试的单一 360 度场景参考资产：餐桌、沙发、门、窗位置固定。',
      assetKind: 'location',
      images: {
        create: descriptions.map((description, index) => ({
          imageIndex: index,
          description,
        })),
      },
    },
  })
  const result = await submitAssetGenerateTask({
    request: input.request,
    kind: 'location',
    assetId: location.id,
    episodeId: input.episodeId,
    body: {
      meta: { locale: input.locale },
      count: descriptions.length,
      artStyle: input.artStyle,
    },
    access: {
      scope: 'project',
      userId: input.userId,
      projectId: input.projectId,
    },
  })
  return {
    locationId: location.id,
    tasks: [
      readTaskRef(result, {
        stage: 'scene-asset',
        label: location.name,
        targetId: location.id,
      }),
    ],
  }
}

export async function createStoryboardMethodTestSession(
  input: CreateStoryboardMethodTestSessionInput,
): Promise<StoryboardMethodTestSessionResult> {
  const creativeBrief = input.creativeBrief.trim()
  const projectName = input.projectName.trim()
  if (!creativeBrief) throw new Error('STORYBOARD_METHOD_TEST_CREATIVE_BRIEF_REQUIRED')
  if (!projectName) throw new Error('STORYBOARD_METHOD_TEST_PROJECT_NAME_REQUIRED')

  const upstreamTasks: StoryboardMethodTestTaskRef[] = []
  const storyboardBranches: StoryboardBatchProjectResult[] = []
  let projectIdToCleanup: string | null = null
  try {
    const project = await createDevStoryboardProjectShell({
      userId: input.userId,
      name: projectName,
      description: baseProjectDescription(input.locale),
      videoRatio: input.videoRatio,
      artStyle: input.artStyle,
    })
    projectIdToCleanup = project.id
    const episode = await prisma.projectEpisode.create({
      data: {
        projectId: project.id,
        episodeNumber: 1,
        name: input.locale === 'en' ? 'Storyboard method test' : '分镜方法测试',
        description: creativeBrief,
        novelText: creativeBrief,
      },
    })
    await prisma.project.update({ where: { id: project.id }, data: { lastEpisodeId: episode.id } })

    const screenplay = await generateProjectEditScreenplay({
      request: input.request,
      projectId: project.id,
      episodeId: episode.id,
      userId: input.userId,
      locale: input.locale,
      prompt: buildScreenplayPrompt(input),
      videoRatio: input.videoRatio,
      artStyle: input.artStyle,
    })

    const visualReferenceTask = await submitProjectVisualReferenceCases({
      request: input.request,
      projectId: project.id,
      episodeId: episode.id,
      userId: input.userId,
      locale: input.locale,
      count: 3,
    })
    upstreamTasks.push(readTaskRef(visualReferenceTask, {
      stage: 'style-reference',
      label: input.locale === 'en' ? 'Standalone style indication only' : '独立风格示意图（只示意风格）',
      targetId: episode.id,
    }))

    const characterAssets = await createCharacterAssets({
      request: input.request,
      userId: input.userId,
      locale: input.locale,
      projectId: project.id,
      episodeId: episode.id,
      artStyle: input.artStyle,
    })
    upstreamTasks.push(...characterAssets.tasks)

    const sceneAsset = await createSceneAsset({
      request: input.request,
      userId: input.userId,
      locale: input.locale,
      projectId: project.id,
      episodeId: episode.id,
      artStyle: input.artStyle,
    })
    upstreamTasks.push(...sceneAsset.tasks)

    const setup: SharedStoryboardSetup = {
      projectId: project.id,
      projectName: project.name,
      episodeId: episode.id,
      characterIds: characterAssets.characterIds,
      appearanceIds: characterAssets.appearanceIds,
      characterNames: characterAssets.characterNames,
    }
    storyboardBranches.push(...await createStoryboardBatchBranches({
      userId: input.userId,
      locale: input.locale,
      requestId: input.requestId,
      storyText: screenplay.screenplayText,
      projectNamePrefix: project.name,
      videoRatio: input.videoRatio,
      artStyle: input.artStyle,
      panelCount: input.panelCount,
      setup,
    }))

    return {
      projectId: project.id,
      episodeId: episode.id,
      screenplayId: screenplay.id,
      projectName: project.name,
      upstreamTasks,
      storyboardBranches,
    }
  } catch (error) {
    const originalError = toError(error)
    try {
      await rollbackStoryboardBatchProject({
        projectId: projectIdToCleanup,
        taskIds: [
          ...upstreamTasks.map((task) => task.taskId),
          ...storyboardBranches.flatMap((branch) => branch.tasks.map((task) => task.taskId)),
        ],
      })
    } catch (rollbackError) {
      throw new AggregateError(
        [originalError, toError(rollbackError)],
        'STORYBOARD_METHOD_TEST_CREATE_FAILED_WITH_PARTIAL_ROLLBACK_FAILURE',
      )
    }
    throw originalError
  }
}
