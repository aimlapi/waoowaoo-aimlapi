import { Prisma } from '@prisma/client'
import type { ProjectPanel } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import {
  getProjectModelConfig,
  resolveProjectModelCapabilityGenerationOptions,
} from '@/lib/config-service'
import { resolveProjectImageStyleSignatureForTask } from '@/lib/image-generation/style'
import { DEFAULT_GROUP_VIDEO_MODEL } from '@/lib/ai-exec/video-defaults'
import { encodeImageUrls } from '@/lib/contracts/image-urls-contract'
import {
  buildCharacterRefs,
  buildScreenLockBlock,
  buildStoryboardBatchPanelPrompt,
  buildTopDownBlock,
  clampPanelCount,
  PANEL_SEEDS,
  schemeById,
  type SchemeDefinition,
  type StoryboardBatchSchemeId,
} from './storyboard-batch-prompts'
import { rollbackStoryboardBatchProject, toError } from './storyboard-batch-rollback'
import { submitStoryboardPanelTask } from './storyboard-batch-submit'
import type { Locale } from '@/i18n/routing'

export interface CreateStoryboardBatchInput {
  readonly userId: string
  readonly locale: Locale
  readonly requestId?: string | null
  readonly storyText: string
  readonly projectNamePrefix: string
  readonly videoRatio: '9:16' | '16:9' | '21:9'
  readonly artStyle: string
  readonly panelCount: number
}

export interface StoryboardBatchTaskRef {
  readonly panelNumber: number
  readonly panelId: string
  readonly taskId: string
  readonly status: string
}

export interface StoryboardBatchProjectResult {
  readonly schemeId: StoryboardBatchSchemeId
  readonly schemeTitle: string
  readonly schemeSummary: string
  readonly projectId: string
  readonly episodeId: string
  readonly storyboardId: string
  readonly projectName: string
  readonly tasks: StoryboardBatchTaskRef[]
}

export interface StoryboardBatchResult {
  readonly projects: StoryboardBatchProjectResult[]
}

type SharedStoryboardSetup = {
  readonly projectId: string
  readonly projectName: string
  readonly episodeId: string
  readonly characterIds: readonly string[]
  readonly appearanceIds: readonly string[]
}

async function createProjectShell(input: {
  readonly userId: string
  readonly name: string
  readonly description: string
  readonly videoRatio: string
  readonly artStyle: string
}) {
  const userPreference = await prisma.userPreference.findUnique({ where: { userId: input.userId } })
  const projectData: Prisma.ProjectUncheckedCreateInput = {
    name: input.name,
    description: input.description,
    userId: input.userId,
    ...(userPreference
      ? {
          analysisModel: userPreference.analysisModel,
          characterModel: userPreference.characterModel,
          locationModel: userPreference.locationModel,
          storyboardModel: userPreference.storyboardModel,
          editModel: userPreference.editModel,
          videoModel: userPreference.videoModel,
          singleShotVideoModel: userPreference.videoModel,
          sequenceVideoModel: DEFAULT_GROUP_VIDEO_MODEL,
          audioModel: userPreference.audioModel,
          musicModel: userPreference.musicModel,
          videoResolution: userPreference.videoResolution,
          imageResolution: userPreference.imageResolution,
        }
      : {}),
    videoRatio: input.videoRatio,
    artStyle: input.artStyle,
    visualStylePresetSource: 'system',
    visualStylePresetId: input.artStyle,
  }
  return await prisma.project.create({ data: projectData })
}

async function createSharedStoryboardSetup(input: CreateStoryboardBatchInput & {
  readonly storyText: string
  readonly projectNamePrefix: string
}): Promise<SharedStoryboardSetup> {
  const project = await createProjectShell({
    userId: input.userId,
    name: input.projectNamePrefix,
    description: input.locale === 'en'
      ? 'Shared upstream project for storyboard method testing.'
      : '用于分镜方法测试的共享上游项目。',
    videoRatio: input.videoRatio,
    artStyle: input.artStyle,
  })
  const episode = await prisma.projectEpisode.create({
    data: {
      projectId: project.id,
      episodeNumber: 1,
      name: input.locale === 'en' ? 'Storyboard test' : '分镜测试',
      description: input.storyText,
      novelText: input.storyText,
    },
  })
  await prisma.project.update({ where: { id: project.id }, data: { lastEpisodeId: episode.id } })

  const characterIds: string[] = []
  const appearanceIds: string[] = []
  for (const name of ['Character A', 'Character B', 'Character C']) {
    const character = await prisma.projectCharacter.create({
      data: {
        projectId: project.id,
        name,
        introduction: `${name} from storyboard test source.`,
        profileConfirmed: true,
        appearances: {
          create: {
            appearanceIndex: 0,
            changeReason: 'storyboard test appearance',
            description: `${name}; derived from the story source; realistic short-film casting continuity reference.`,
            descriptions: JSON.stringify([`${name}; realistic short-film casting continuity reference.`]),
            imageUrls: encodeImageUrls([]),
            previousImageUrls: encodeImageUrls([]),
          },
        },
      },
      include: { appearances: { orderBy: { appearanceIndex: 'asc' } } },
    })
    characterIds.push(character.id)
    const appearanceId = character.appearances[0]?.id
    if (!appearanceId) throw new Error(`STORYBOARD_BATCH_APPEARANCE_MISSING:${name}`)
    appearanceIds.push(appearanceId)
  }

  for (const locationName of ['story opening space', 'meeting space', 'closing interior']) {
    await prisma.projectLocation.create({
      data: {
        projectId: project.id,
        name: locationName,
        summary: `${locationName}; reusable storyboard test environment derived from the source story.`,
        assetKind: 'location',
      },
    })
  }

  return {
    projectId: project.id,
    projectName: project.name,
    episodeId: episode.id,
    characterIds,
    appearanceIds,
  }
}

async function createStoryboardBranch(input: CreateStoryboardBatchInput & {
  readonly scheme: SchemeDefinition
  readonly setup: SharedStoryboardSetup
  readonly projectModelConfig: Awaited<ReturnType<typeof getProjectModelConfig>>
  readonly capabilityOptions: Awaited<ReturnType<typeof resolveProjectModelCapabilityGenerationOptions>>
  readonly styleSignature: string
}): Promise<StoryboardBatchProjectResult> {
  const seeds = PANEL_SEEDS.slice(0, clampPanelCount(input.panelCount))
  const { storyboard, panels } = await prisma.$transaction(async (tx) => {
    const clip = await tx.projectClip.create({
      data: {
        episodeId: input.setup.episodeId,
        start: 0,
        end: seeds.reduce((sum, seed) => sum + seed.duration, 0),
        duration: seeds.reduce((sum, seed) => sum + seed.duration, 0),
        summary: input.scheme.title[input.locale],
        location: 'story opening space / meeting space / closing interior',
        content: input.storyText,
        characters: JSON.stringify(['Character A', 'Character B', 'Character C']),
        props: JSON.stringify(['story prop']),
        shotCount: seeds.length,
        startText: seeds[0]?.description ?? null,
        endText: seeds[seeds.length - 1]?.description ?? null,
        screenplay: input.storyText,
      },
    })
    const createdStoryboard = await tx.projectStoryboard.create({
      data: {
        episodeId: input.setup.episodeId,
        clipId: clip.id,
        panelCount: seeds.length,
        storyboardTextJson: JSON.stringify({
          source: 'dev-ab-test',
          schemeId: input.scheme.id,
          schemeTitle: input.scheme.title[input.locale],
        }),
      },
    })
    const createdPanels: ProjectPanel[] = []
    for (const seed of seeds) {
      const prompt = buildStoryboardBatchPanelPrompt({
        schemeId: input.scheme.id,
        storyText: input.storyText,
        seed,
        locale: input.locale,
      })
      const panel = await tx.projectPanel.create({
        data: {
          storyboardId: createdStoryboard.id,
          panelIndex: seed.panelNumber - 1,
          panelNumber: seed.panelNumber,
          shotType: seed.shotType,
          cameraMove: seed.cameraMove,
          description: seed.description,
          location: seed.location,
          characters: JSON.stringify(buildCharacterRefs({
            seed,
            characterIds: input.setup.characterIds,
            appearanceIds: input.setup.appearanceIds,
          })),
          props: JSON.stringify(seed.props),
          srtSegment: seed.description,
          duration: seed.duration,
          imagePrompt: prompt,
          videoPrompt: prompt,
          photographyRules: JSON.stringify({
            schemeId: input.scheme.id,
            spatialBlocking: input.scheme.id === 'first-panel-img2img' ? buildTopDownBlock(seed) : null,
            screenLock: buildScreenLockBlock(seed),
          }),
        },
      })
      createdPanels.push(panel)
    }
    return { storyboard: createdStoryboard, panels: createdPanels }
  })

  const initialPanels = input.scheme.id === 'first-panel-img2img' ? panels.slice(0, 1) : panels
  const tasks: StoryboardBatchTaskRef[] = []
  for (const panel of initialPanels) {
    const task = await submitStoryboardPanelTask({
      userId: input.userId,
      locale: input.locale,
      requestId: input.requestId,
      projectId: input.setup.projectId,
      episodeId: input.setup.episodeId,
      panel,
      schemeId: input.scheme.id,
      projectModelConfig: input.projectModelConfig,
      capabilityOptions: input.capabilityOptions,
      styleSignature: input.styleSignature,
    })
    tasks.push(task)
  }

  return {
    schemeId: input.scheme.id,
    schemeTitle: input.scheme.title[input.locale],
    schemeSummary: input.scheme.summary[input.locale],
    projectId: input.setup.projectId,
    episodeId: input.setup.episodeId,
    storyboardId: storyboard.id,
    projectName: input.setup.projectName,
    tasks,
  }
}

export async function createStoryboardBatchProjects(input: CreateStoryboardBatchInput): Promise<StoryboardBatchResult> {
  const storyText = input.storyText.trim()
  const projectNamePrefix = input.projectNamePrefix.trim()
  if (!storyText) throw new Error('STORYBOARD_BATCH_STORY_REQUIRED')
  if (!projectNamePrefix) throw new Error('STORYBOARD_BATCH_PROJECT_PREFIX_REQUIRED')

  const projects: StoryboardBatchProjectResult[] = []
  let projectIdToCleanup: string | null = null
  try {
    const setup = await createSharedStoryboardSetup({
      ...input,
      storyText,
      projectNamePrefix,
    })
    projectIdToCleanup = setup.projectId
    const projectModelConfig = await getProjectModelConfig(setup.projectId, input.userId)
    if (!projectModelConfig.storyboardModel) throw new Error('STORYBOARD_MODEL_NOT_CONFIGURED')
    const capabilityOptions = await resolveProjectModelCapabilityGenerationOptions({
      projectId: setup.projectId,
      userId: input.userId,
      modelType: 'image',
      modelKey: projectModelConfig.storyboardModel,
    })
    const styleSignature = await resolveProjectImageStyleSignatureForTask({
      projectId: setup.projectId,
      userId: input.userId,
      locale: input.locale,
      episodeId: setup.episodeId,
      invalidOverrideMessage: 'Invalid artStyle in storyboard batch payload',
    })
    for (const id of ['global-continuity-prompt', 'shot-card-board', 'first-panel-img2img'] as const) {
      projects.push(await createStoryboardBranch({
        ...input,
        storyText,
        projectNamePrefix,
        panelCount: clampPanelCount(input.panelCount),
        scheme: schemeById(id),
        setup,
        projectModelConfig,
        capabilityOptions,
        styleSignature,
      }))
    }
  } catch (error) {
    const originalError = toError(error)
    try {
      await rollbackStoryboardBatchProject({
        projectId: projectIdToCleanup,
        taskIds: projects.flatMap((project) => project.tasks.map((task) => task.taskId)),
      })
    } catch (rollbackError) {
      throw new AggregateError(
        [originalError, toError(rollbackError)],
        'STORYBOARD_BATCH_CREATE_FAILED_WITH_PARTIAL_ROLLBACK_FAILURE'
      )
    }
    throw originalError
  }
  return { projects }
}
