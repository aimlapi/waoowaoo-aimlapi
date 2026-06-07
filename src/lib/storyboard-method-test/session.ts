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
  const artStyle = input.artStyle.trim()
  if (input.locale === 'en') {
    return [
      input.creativeBrief.trim(),
      `Aspect ratio: ${input.videoRatio}.`,
      artStyle ? `Project visual direction: ${artStyle}.` : '',
      styleNote ? `User style indication note: ${styleNote}. This note is only for the standalone style indication stage; do not bind it to character identity or storyboard continuity.` : '',
    ].filter(Boolean).join('\n')
  }
  return [
    input.creativeBrief.trim(),
    `画幅：${input.videoRatio}。`,
    artStyle ? `项目视觉方向：${artStyle}。` : '',
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

type CharacterAssetProfile = {
  readonly name: string
  readonly introduction: string
  readonly descriptions: readonly string[]
  readonly role: 'protagonist' | 'mother' | 'old-classmate'
  readonly scoreBase: number
}

type LocationAssetProfile = {
  readonly name: string
  readonly summary: string
  readonly landmarks: readonly string[]
}

function compactForAssetPrompt(value: string, limit = 260): string {
  const normalized = value.replace(/\s+/g, ' ').trim()
  if (normalized.length <= limit) return normalized
  return `${normalized.slice(0, limit).trim()}...`
}

function parseCharacterTable(screenplayText: string): Array<{ readonly name: string; readonly description: string }> {
  const lines = screenplayText.split(/\r?\n/).map((line) => line.trim()).filter(Boolean)
  const rows: Array<{ readonly name: string; readonly description: string }> = []
  let insideCharacterTable = false
  for (const line of lines) {
    if (/^(角色表|Characters)\s*[:：]?/i.test(line)) {
      insideCharacterTable = true
      continue
    }
    if (insideCharacterTable && /^(场景|Scene)\s*\d+/i.test(line)) break
    if (!insideCharacterTable) continue
    const match = line.match(/^([^:：]{1,40})[:：](.+)$/)
    if (!match) continue
    const name = match[1]?.trim() ?? ''
    const description = match[2]?.trim() ?? ''
    if (!name || !description) continue
    if (/仅声音|O\.S\.|voice only/i.test(name) || /仅声音|O\.S\.|voice only/i.test(description)) continue
    rows.push({ name, description })
  }
  return rows
}

function fallbackCharacterRows(locale: Locale): Array<{ readonly name: string; readonly description: string }> {
  return locale === 'en'
    ? [
        { name: 'Protagonist', description: '35-year-old single woman who has just lost her job and returns to her hometown.' },
        { name: 'Mother', description: 'The protagonist’s mother, practical and emotionally reserved.' },
        { name: 'Hometown passerby', description: 'A grounded local person from the protagonist’s hometown environment.' },
      ]
    : [
        { name: '主角', description: '35 岁，刚失业的单身女性，带着行李回老家。' },
        { name: '母亲', description: '主角的母亲，务实、节制，不善表达。' },
        { name: '老家路人', description: '老家环境中的真实本地人，作为环境关系的补充角色。' },
      ]
}

function normalizeCharacterRows(
  rows: readonly { readonly name: string; readonly description: string }[],
  locale: Locale,
): Array<{ readonly name: string; readonly description: string }> {
  if (rows.length > 0) return rows.slice(0, 3)
  return fallbackCharacterRows(locale).slice(0, 1)
}

function characterDescriptions(input: {
  readonly locale: Locale
  readonly screenplayText: string
}): CharacterAssetProfile[] {
  const rows = normalizeCharacterRows(parseCharacterTable(input.screenplayText), input.locale)
  return rows.map((row, index) => {
    const base = compactForAssetPrompt(`${row.name}：${row.description}`)
    const zh = input.locale !== 'en'
    const descriptions = zh
      ? [
          `${base}。写实选角定妆 contact sheet 候选，保持与剧本角色表一致。`,
          `${base}。更脆弱疲惫的表演方案，生活化服装和自然状态，写实选角定妆 contact sheet 候选。`,
          `${base}。更收拢自持的表演方案，动作克制，写实选角定妆 contact sheet 候选。`,
        ]
      : [
          `${base}. Realistic casting contact sheet candidate, consistent with the screenplay character table.`,
          `${base}. More fragile and tired performance option, lived-in clothing and natural state, realistic casting contact sheet candidate.`,
          `${base}. More composed and guarded performance option, restrained body language, realistic casting contact sheet candidate.`,
        ]
    const role = index === 0 ? 'protagonist' : index === 1 ? 'mother' : 'old-classmate'
    return {
      name: row.name,
      introduction: row.description,
      descriptions,
      role,
      scoreBase: 92 - index * 4,
    }
  })
}

function parsePrimaryLocationProfile(screenplayText: string, locale: Locale): LocationAssetProfile {
  const sceneMatches = Array.from(screenplayText.matchAll(/场景\s*\d+\s*[｜|]\s*([^\n]+)/g))
  const finalScene = sceneMatches.at(-1)?.[1]?.trim()
  if (finalScene) {
    const name = finalScene.replace(/^(内景|外景|外景\/内景|INT\.|EXT\.)[.\s]*/i, '').trim()
    const lower = screenplayText
    const landmarks = [
      lower.includes('窗台') ? (locale === 'en' ? 'windowsill' : '窗台') : '',
      lower.includes('小凳') ? (locale === 'en' ? 'small stool' : '小凳') : '',
      lower.includes('菜') ? (locale === 'en' ? 'vegetable basin' : '菜盆') : '',
      lower.includes('行李箱') ? (locale === 'en' ? 'suitcase' : '行李箱') : '',
      lower.includes('拖鞋') ? (locale === 'en' ? 'old slippers' : '旧拖鞋') : '',
      lower.includes('小绿植') ? (locale === 'en' ? 'small green plant' : '小绿植') : '',
    ].filter(Boolean)
    return {
      name,
      summary: locale === 'en'
        ? `Primary story location extracted from the screenplay: ${name}.`
        : `从剧本中提取的主场景：${name}。`,
      landmarks: landmarks.length > 0 ? landmarks : [locale === 'en' ? 'fixed lived-in objects from the screenplay' : '剧本中的固定生活物件'],
    }
  }
  return locale === 'en'
    ? {
        name: 'Primary hometown location',
        summary: 'Primary story location extracted from the screenplay.',
        landmarks: ['fixed lived-in objects from the screenplay'],
      }
    : {
        name: '老家主场景',
        summary: '从剧本中提取的主场景。',
        landmarks: ['剧本中的固定生活物件'],
      }
}

function locationAngleDescriptions(input: {
  readonly locale: Locale
  readonly profile: LocationAssetProfile
}): readonly string[] {
  const landmarks = input.profile.landmarks.join(input.locale === 'en' ? ', ' : '、')
  if (input.locale === 'en') {
    return [
      `360 environment reference sheet angle FRONT: ${input.profile.name}. Fixed landmarks: ${landmarks}. Realistic location asset reference based only on the screenplay.`,
      `360 environment reference sheet angle FRONT-LEFT: same ${input.profile.name}, preserve all fixed landmarks and world layout, no mirrored layout.`,
      `360 environment reference sheet angle LEFT: same ${input.profile.name}, show spatial relation between landmarks, lived-in hometown texture.`,
      `360 environment reference sheet angle BACK: same ${input.profile.name} from the reverse side, unchanged landmark positions, no new room.`,
      `360 environment reference sheet angle RIGHT: same ${input.profile.name}, consistent light direction, materials, entrances, windows, and ground texture.`,
      `360 environment reference sheet detail board: close details of ${landmarks}, ceiling or sky edge, floor or ground texture, all belonging to the same location.`,
    ]
  }
  return [
    `360 场景参考板 FRONT 角度：${input.profile.name}。固定物件/地标：${landmarks}。只基于剧本生成的写实场景资产参考。`,
    `360 场景参考板 FRONT-LEFT 角度：同一个${input.profile.name}，保留所有固定物件和世界布局，不镜像。`,
    `360 场景参考板 LEFT 角度：同一个${input.profile.name}，展示固定物件之间的空间关系和老家生活质地。`,
    `360 场景参考板 BACK 角度：从反方向看同一个${input.profile.name}，固定物件位置不变，不生成新房间。`,
    `360 场景参考板 RIGHT 角度：同一个${input.profile.name}，光线方向、材质、门窗或地面质感保持一致。`,
    `360 场景细节板：${landmarks}、顶面或天空边缘、地面材质等细节，必须属于同一个场景。`,
  ]
}

async function createCharacterAssets(input: {
  readonly request: NextRequest
  readonly userId: string
  readonly locale: Locale
  readonly projectId: string
  readonly episodeId: string
  readonly artStyle: string
  readonly screenplayText: string
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

  for (const characterInput of characterDescriptions({
    locale: input.locale,
    screenplayText: input.screenplayText,
  })) {
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
  readonly screenplayText: string
}): Promise<{
  readonly locationId: string
  readonly tasks: readonly StoryboardMethodTestTaskRef[]
}> {
  const locationProfile = parsePrimaryLocationProfile(input.screenplayText, input.locale)
  const descriptions = locationAngleDescriptions({
    locale: input.locale,
    profile: locationProfile,
  })
  const location = await prisma.projectLocation.create({
    data: {
      projectId: input.projectId,
      name: input.locale === 'en'
        ? `${locationProfile.name} 360 reference`
        : `${locationProfile.name} 360 参考`,
      summary: locationProfile.summary,
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
      screenplayText: screenplay.screenplayText,
    })
    upstreamTasks.push(...characterAssets.tasks)

    const sceneAsset = await createSceneAsset({
      request: input.request,
      userId: input.userId,
      locale: input.locale,
      projectId: project.id,
      episodeId: episode.id,
      artStyle: input.artStyle,
      screenplayText: screenplay.screenplayText,
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
