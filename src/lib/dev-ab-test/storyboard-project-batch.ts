import type { ProjectPanel } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import {
  getProjectModelConfig,
  resolveProjectModelCapabilityGenerationOptions,
} from '@/lib/config-service'
import { resolveProjectImageStyleSignatureForTask } from '@/lib/image-generation/style'
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
  type StoryboardBatchPanelPromptSeed,
  type StoryboardBatchSchemeId,
} from './storyboard-batch-prompts'
import { createDevStoryboardProjectShell } from './project-shell'
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

export type SharedStoryboardSetup = {
  readonly projectId: string
  readonly projectName: string
  readonly episodeId: string
  readonly characterIds: readonly string[]
  readonly appearanceIds: readonly string[]
  readonly characterNames: readonly string[]
}

function adaptSeedForCharacterCount(
  seed: StoryboardBatchPanelPromptSeed,
  characterCount: number,
): StoryboardBatchPanelPromptSeed {
  if (characterCount <= 1) {
    return {
      ...seed,
      characterSlots: ['screen-left'],
    }
  }
  if (characterCount === 2) {
    return {
      ...seed,
      characterSlots: ['screen-left', 'screen-right'],
      description: seed.description
        .replace(
          'character C enters and changes the emotional balance of the scene.',
          'the environment and silence change the emotional balance of the scene.',
        ),
    }
  }
  return seed
}

async function createSharedStoryboardSetup(input: CreateStoryboardBatchInput & {
  readonly storyText: string
  readonly projectNamePrefix: string
}): Promise<SharedStoryboardSetup> {
  const project = await createDevStoryboardProjectShell({
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
  const characterNames: string[] = []
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
    characterNames.push(name)
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
    characterNames,
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
      const panelSeed = adaptSeedForCharacterCount(seed, input.setup.characterIds.length)
      const prompt = buildStoryboardBatchPanelPrompt({
        schemeId: input.scheme.id,
        storyText: input.storyText,
        seed: panelSeed,
        allSeeds: seeds,
        locale: input.locale,
      })
      const panel = await tx.projectPanel.create({
        data: {
          storyboardId: createdStoryboard.id,
          panelIndex: panelSeed.panelNumber - 1,
          panelNumber: panelSeed.panelNumber,
          shotType: panelSeed.shotType,
          cameraMove: panelSeed.cameraMove,
          description: panelSeed.description,
          location: panelSeed.location,
          characters: JSON.stringify(buildCharacterRefs({
            seed: panelSeed,
            characterIds: input.setup.characterIds,
            appearanceIds: input.setup.appearanceIds,
            characterNames: input.setup.characterNames,
          })),
          props: JSON.stringify(panelSeed.props),
          srtSegment: panelSeed.description,
          duration: panelSeed.duration,
          imagePrompt: prompt,
          videoPrompt: prompt,
          photographyRules: JSON.stringify({
            schemeId: input.scheme.id,
            singleBoardOutput: false,
            spatialBlocking: input.scheme.id === 'top-down-spatial-lock' || input.scheme.id === 'first-panel-img2img'
              ? buildTopDownBlock(panelSeed)
              : null,
            screenLock: buildScreenLockBlock(panelSeed),
          }),
        },
      })
      createdPanels.push(panel)
    }
    return { storyboard: createdStoryboard, panels: createdPanels }
  })

  const initialPanels = input.scheme.id === 'first-panel-img2img'
    ? panels.slice(0, 1)
    : panels
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
    projects.push(...await createStoryboardBatchBranches({
      ...input,
      storyText,
      projectNamePrefix,
      setup,
    }))
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

export async function createStoryboardBatchBranches(input: CreateStoryboardBatchInput & {
  readonly setup: SharedStoryboardSetup
}): Promise<StoryboardBatchProjectResult[]> {
  const storyText = input.storyText.trim()
  if (!storyText) throw new Error('STORYBOARD_BATCH_STORY_REQUIRED')

  const projectModelConfig = await getProjectModelConfig(input.setup.projectId, input.userId)
  if (!projectModelConfig.storyboardModel) throw new Error('STORYBOARD_MODEL_NOT_CONFIGURED')
  const capabilityOptions = await resolveProjectModelCapabilityGenerationOptions({
    projectId: input.setup.projectId,
    userId: input.userId,
    modelType: 'image',
    modelKey: projectModelConfig.storyboardModel,
  })
  const styleSignature = await resolveProjectImageStyleSignatureForTask({
    projectId: input.setup.projectId,
    userId: input.userId,
    locale: input.locale,
    episodeId: input.setup.episodeId,
    invalidOverrideMessage: 'Invalid artStyle in storyboard batch payload',
  })

  const results: StoryboardBatchProjectResult[] = []
  for (const id of ['global-continuity-prompt', 'top-down-spatial-lock', 'first-panel-img2img'] as const) {
    results.push(await createStoryboardBranch({
      ...input,
      storyText,
      panelCount: clampPanelCount(input.panelCount),
      scheme: schemeById(id),
      projectModelConfig,
      capabilityOptions,
      styleSignature,
    }))
  }
  return results
}
