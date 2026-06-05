import { prisma } from '@/lib/prisma'
import {
  getProjectModelConfig,
  resolveProjectModelCapabilityGenerationOptions,
} from '@/lib/config-service'
import { resolveProjectImageStyleSignatureForTask } from '@/lib/image-generation/style'
import { TASK_TYPE } from '@/lib/task/types'
import type { Locale } from '@/i18n/routing'
import type { StoryboardBatchTaskRef } from './storyboard-project-batch'
import { rollbackStoryboardBatchProject, toError } from './storyboard-batch-rollback'
import { submitStoryboardPanelTask } from './storyboard-batch-submit'

export interface ContinueReferenceStoryboardInput {
  readonly userId: string
  readonly locale: Locale
  readonly requestId?: string | null
  readonly projectId: string
  readonly storyboardId: string
  readonly anchorPanelId: string
}

export async function continueReferenceStoryboardPanels(input: ContinueReferenceStoryboardInput): Promise<{
  readonly tasks: StoryboardBatchTaskRef[]
}> {
  const storyboard = await prisma.projectStoryboard.findFirst({
    where: {
      id: input.storyboardId,
      episode: {
        projectId: input.projectId,
        project: { userId: input.userId },
      },
    },
    select: {
      id: true,
      episodeId: true,
      episode: {
        select: {
          projectId: true,
        },
      },
    },
  })
  if (!storyboard) throw new Error('STORYBOARD_BATCH_STORYBOARD_NOT_FOUND')

  const anchorPanel = await prisma.projectPanel.findFirst({
    where: {
      id: input.anchorPanelId,
      storyboardId: input.storyboardId,
    },
    select: {
      id: true,
      imageUrl: true,
    },
  })
  if (!anchorPanel?.imageUrl) throw new Error('STORYBOARD_BATCH_ANCHOR_IMAGE_NOT_READY')

  const panels = await prisma.projectPanel.findMany({
    where: {
      storyboardId: input.storyboardId,
      id: { not: input.anchorPanelId },
    },
    orderBy: { panelIndex: 'asc' },
  })
  const existingTasks = await prisma.task.findMany({
    where: {
      projectId: input.projectId,
      type: TASK_TYPE.IMAGE_PANEL,
      targetType: 'ProjectPanel',
      targetId: { in: panels.map((panel) => panel.id) },
      operationId: 'dev_storyboard_batch',
    },
    select: { targetId: true },
  })
  const submittedPanelIds = new Set(existingTasks.map((task) => task.targetId))
  const panelsToSubmit = panels.filter((panel) => !submittedPanelIds.has(panel.id))
  if (panelsToSubmit.length === 0) return { tasks: [] }

  const projectModelConfig = await getProjectModelConfig(input.projectId, input.userId)
  if (!projectModelConfig.storyboardModel) throw new Error('STORYBOARD_MODEL_NOT_CONFIGURED')
  const capabilityOptions = await resolveProjectModelCapabilityGenerationOptions({
    projectId: input.projectId,
    userId: input.userId,
    modelType: 'image',
    modelKey: projectModelConfig.storyboardModel,
  })
  const styleSignature = await resolveProjectImageStyleSignatureForTask({
    projectId: input.projectId,
    userId: input.userId,
    locale: input.locale,
    episodeId: storyboard.episodeId,
    invalidOverrideMessage: 'Invalid artStyle in storyboard batch continuation payload',
  })

  const submittedTaskIds: string[] = []
  const tasks: StoryboardBatchTaskRef[] = []
  try {
    for (const panel of panelsToSubmit) {
      const task = await submitStoryboardPanelTask({
        userId: input.userId,
        locale: input.locale,
        requestId: input.requestId,
        projectId: input.projectId,
        episodeId: storyboard.episodeId,
        panel,
        schemeId: 'first-panel-img2img',
        projectModelConfig,
        capabilityOptions,
        styleSignature,
        referencePanelImageUrls: [anchorPanel.imageUrl],
        referenceImageNotes: [
          'source=storyboard; label=panel 01 master reference; usage=Use this image as the only spatial and visual source for scene continuity, room layout, furniture placement, clothing, identity, and screen-left/screen-right blocking.',
        ],
      })
      submittedTaskIds.push(task.taskId)
      tasks.push(task)
    }
  } catch (error) {
    const originalError = toError(error)
    try {
      await rollbackStoryboardBatchProject({
        projectId: null,
        taskIds: submittedTaskIds,
      })
    } catch (rollbackError) {
      throw new AggregateError(
        [originalError, toError(rollbackError)],
        'STORYBOARD_BATCH_CONTINUATION_FAILED_WITH_ROLLBACK_FAILURE'
      )
    }
    throw originalError
  }

  return { tasks }
}
