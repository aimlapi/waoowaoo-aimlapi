import { prisma } from '@/lib/prisma'
import { TASK_TYPE } from '@/lib/task/types'
import {
  resolveLocationSpatialProfileReadiness,
  resolveStoryboardImageReadiness,
} from './edit-first-readiness'
import {
  isEditFirstAutoApprovedOperationId,
  type EditFirstWorkflowOperationId,
} from './edit-first-operation-policy'
export {
  EDIT_FIRST_AUTO_APPROVED_OPERATION_IDS,
  EDIT_FIRST_WORKFLOW_OPERATION_IDS,
  type EditFirstWorkflowOperationId,
} from './edit-first-operation-policy'

export type EditFirstWorkflowStage =
  | 'not_started'
  | 'ready_to_generate_screenplay'
  | 'screenplay_ready_for_review'
  | 'style_preview_generating'
  | 'needs_style_choice'
  | 'ready_to_generate_assets'
  | 'assets_generating'
  | 'ready_to_generate_storyboard'
  | 'storyboard_generating'
  | 'ready_to_generate_storyboard_images'
  | 'storyboard_images_generating'
  | 'ready_to_generate_videos'
  | 'videos_generating'
  | 'ready_to_render_final'
  | 'completed'
  | 'failed'

export type EditFirstWorkflowBlockingKind =
  | 'none'
  | 'processing'
  | 'needs_user_choice'
  | 'needs_confirmation'
  | 'failed'

export interface EditFirstWorkflowAction {
  id: string
  operationId: EditFirstWorkflowOperationId
  title: string
  requiresUserConfirmation: boolean
}

export interface EditFirstWorkflowState {
  active: boolean
  stage: EditFirstWorkflowStage
  blocking: {
    kind: EditFirstWorkflowBlockingKind
    reason: string | null
  }
  nextAction: EditFirstWorkflowAction | null
  allowedOperationIds: EditFirstWorkflowOperationId[]
}

export interface EditFirstWorkflowSnapshot {
  hasEpisode: boolean
  hasScreenplay: boolean
  screenplayStatus: string | null
  stylePreviewCount: number
  completedStylePreviewCount: number
  confirmedStylePreviewCount: number
  failedStylePreviewCount: number
  editAssetRequirementCount: number
  pendingAssetRequirementCount: number
  generatingAssetRequirementCount: number
  requiredLocationSpatialProfileCount: number
  readyLocationSpatialProfileCount: number
  storyboardCount: number
  storyboardPanelPromptFailed: boolean
  activeStoryboardPanelTaskCount: number
  panelCount: number
  storyboardPanelImageReadyCount: number
  storyboardPanelImageMissingCount: number
  storyboardPanelImageFailedCount: number
  activeStoryboardImageTaskCount: number
}

export const EDIT_FIRST_WORKFLOW_EMPTY_STATE: EditFirstWorkflowState = {
  active: false,
  stage: 'not_started',
  blocking: {
    kind: 'none',
    reason: null,
  },
  nextAction: null,
  allowedOperationIds: [],
}

function workflowAction(
  operationId: EditFirstWorkflowOperationId,
  title: string,
): EditFirstWorkflowAction {
  return {
    id: operationId,
    operationId,
    title,
    requiresUserConfirmation: !isEditFirstAutoApprovedOperationId(operationId),
  }
}

function state(params: {
  active?: boolean
  stage: EditFirstWorkflowStage
  blocking?: EditFirstWorkflowState['blocking']
  nextAction?: EditFirstWorkflowAction | null
  allowedOperationIds?: readonly EditFirstWorkflowOperationId[]
}): EditFirstWorkflowState {
  const nextAction = params.nextAction ?? null
  return {
    active: params.active ?? true,
    stage: params.stage,
    blocking: params.blocking ?? {
      kind: nextAction && nextAction.requiresUserConfirmation ? 'needs_confirmation' : 'none',
      reason: null,
    },
    nextAction,
    allowedOperationIds: params.allowedOperationIds ? [...params.allowedOperationIds] : nextAction ? [nextAction.operationId] : [],
  }
}

function readString(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  return trimmed || null
}

function readRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {}
  return value as Record<string, unknown>
}

function parseJsonRecord(value: string | null): Record<string, unknown> {
  if (!value) return {}
  try {
    return readRecord(JSON.parse(value))
  } catch {
    return {}
  }
}

export function resolveEditFirstWorkflowStateFromSnapshot(
  snapshot: EditFirstWorkflowSnapshot,
): EditFirstWorkflowState {
  if (!snapshot.hasEpisode) return EDIT_FIRST_WORKFLOW_EMPTY_STATE

  if (!snapshot.hasScreenplay) {
    return state({
      active: false,
      stage: 'ready_to_generate_screenplay',
      blocking: { kind: 'none', reason: null },
      nextAction: workflowAction('generate_edit_screenplay', 'Generate screenplay'),
    })
  }

  if (snapshot.screenplayStatus === 'failed') {
    return state({
      stage: 'failed',
      blocking: { kind: 'failed', reason: 'screenplay generation failed' },
      nextAction: workflowAction('generate_edit_screenplay', 'Regenerate screenplay'),
    })
  }

  const terminalStylePreviewCount = snapshot.completedStylePreviewCount
    + snapshot.confirmedStylePreviewCount
    + snapshot.failedStylePreviewCount
  const allStylePreviewsFailed = snapshot.stylePreviewCount > 0
    && snapshot.failedStylePreviewCount === snapshot.stylePreviewCount
    && terminalStylePreviewCount === snapshot.stylePreviewCount

  if (allStylePreviewsFailed) {
    const nextAction = workflowAction('generate_edit_style_previews', 'Regenerate style previews')
    return state({
      stage: 'failed',
      blocking: { kind: 'failed', reason: 'all style preview generation tasks failed' },
      nextAction,
      allowedOperationIds: [nextAction.operationId],
    })
  }

  if (snapshot.screenplayStatus === 'style_preview_generating' && snapshot.completedStylePreviewCount > 0 && snapshot.failedStylePreviewCount > 0) {
    return state({
      stage: 'needs_style_choice',
      blocking: { kind: 'needs_user_choice', reason: 'choose and confirm one completed style preview' },
      allowedOperationIds: ['generate_edit_style_previews'],
    })
  }

  if (snapshot.screenplayStatus === 'style_preview_generating') {
    return state({
      stage: 'style_preview_generating',
      blocking: { kind: 'processing', reason: 'style preview images are still generating' },
    })
  }

  if (snapshot.screenplayStatus === 'screenplay_ready') {
    const nextAction = workflowAction('generate_edit_style_previews', 'Generate style previews')
    return state({
      stage: 'screenplay_ready_for_review',
      blocking: { kind: 'needs_user_choice', reason: 'review screenplay and choose approval or revision before style preview generation' },
      nextAction,
      allowedOperationIds: [nextAction.operationId, 'revise_edit_screenplay'],
    })
  }

  if (snapshot.screenplayStatus === 'style_preview_ready') {
    return state({
      stage: 'needs_style_choice',
      blocking: { kind: 'needs_user_choice', reason: 'choose and confirm one completed style preview' },
      allowedOperationIds: ['generate_edit_style_previews'],
    })
  }

  if (snapshot.screenplayStatus !== 'ready') {
    return state({
      stage: 'style_preview_generating',
      blocking: { kind: 'processing', reason: `screenplay status is ${snapshot.screenplayStatus ?? 'unknown'}` },
    })
  }

  const missingSpatialProfileCount = Math.max(0, snapshot.requiredLocationSpatialProfileCount - snapshot.readyLocationSpatialProfileCount)
  if (snapshot.pendingAssetRequirementCount > 0 || missingSpatialProfileCount > 0) {
    if (snapshot.generatingAssetRequirementCount > 0) {
      return state({
        stage: 'assets_generating',
        blocking: { kind: 'processing', reason: 'required assets or spatial profiles are still generating' },
      })
    }
    return state({
      stage: 'ready_to_generate_assets',
      nextAction: workflowAction('generate_edit_script_assets', 'Generate required assets'),
    })
  }

  if (snapshot.activeStoryboardPanelTaskCount > 0) {
    return state({
      stage: 'storyboard_generating',
      blocking: { kind: 'processing', reason: 'storyboard panels are still generating' },
    })
  }

  if (snapshot.storyboardPanelPromptFailed) {
    const nextAction = workflowAction('generate_edit_script_storyboard', 'Regenerate storyboard panels')
    return state({
      stage: 'failed',
      blocking: { kind: 'failed', reason: 'storyboard panel prompt generation failed' },
      nextAction,
      allowedOperationIds: [nextAction.operationId],
    })
  }

  if (snapshot.panelCount === 0) {
    return state({
      stage: 'ready_to_generate_storyboard',
      nextAction: workflowAction('generate_edit_script_storyboard', 'Generate storyboard panels'),
    })
  }

  if (snapshot.storyboardPanelImageMissingCount > 0) {
    const nextAction = workflowAction('generate_edit_script_storyboard_images', 'Generate storyboard images')
    if (snapshot.activeStoryboardImageTaskCount > 0) {
      return state({
        stage: 'storyboard_images_generating',
        blocking: { kind: 'processing', reason: 'storyboard panel images are still generating' },
      })
    }
    if (snapshot.storyboardPanelImageFailedCount > 0) {
      return state({
        stage: 'failed',
        blocking: { kind: 'failed', reason: 'storyboard panel image generation failed' },
        nextAction,
        allowedOperationIds: [nextAction.operationId],
      })
    }
    return state({
      stage: 'ready_to_generate_storyboard_images',
      nextAction,
    })
  }

  return {
    active: true,
    stage: 'ready_to_generate_videos',
    blocking: {
      kind: 'needs_confirmation',
      reason: null,
    },
    nextAction: workflowAction('generate_episode_videos', 'Generate videos'),
    allowedOperationIds: ['generate_episode_videos'],
  }
}

export function resolveEditFirstWorkflowCapabilityOperationIds(
  workflow: EditFirstWorkflowState,
): EditFirstWorkflowOperationId[] {
  if (!workflow.active && workflow.stage === 'not_started') return ['generate_edit_screenplay']
  switch (workflow.stage) {
    case 'ready_to_generate_screenplay':
      return ['generate_edit_screenplay']
    case 'screenplay_ready_for_review':
      return ['revise_edit_screenplay', 'generate_edit_style_previews']
    case 'style_preview_generating':
      return []
    case 'needs_style_choice':
      return ['generate_edit_style_previews']
    case 'ready_to_generate_assets':
      return ['generate_edit_script_assets']
    case 'assets_generating':
      return []
    case 'ready_to_generate_storyboard':
      return ['generate_edit_script_storyboard']
    case 'storyboard_generating':
      return []
    case 'ready_to_generate_storyboard_images':
      return ['generate_edit_script_storyboard_images']
    case 'storyboard_images_generating':
      return []
    case 'ready_to_generate_videos':
      return ['generate_episode_videos']
    case 'videos_generating':
      return []
    case 'ready_to_render_final':
      return ['render_final_video']
    case 'completed':
      return []
    case 'failed':
      return [...workflow.allowedOperationIds]
    case 'not_started':
      return ['generate_edit_screenplay']
    default:
      return [...workflow.allowedOperationIds]
  }
}

export async function resolveEditFirstWorkflowState(params: {
  projectId: string
  userId: string
  episodeId?: string | null
}): Promise<EditFirstWorkflowState> {
  if (!params.episodeId) return EDIT_FIRST_WORKFLOW_EMPTY_STATE

  const project = await prisma.project.findFirst({
    where: {
      id: params.projectId,
      userId: params.userId,
    },
    select: { id: true },
  })
  if (!project) return EDIT_FIRST_WORKFLOW_EMPTY_STATE

  const [
    screenplay,
    projectCharacters,
    projectLocations,
    storyboards,
    panels,
  ] = await Promise.all([
    prisma.projectEditScreenplay.findFirst({
      where: {
        projectId: params.projectId,
        episodeId: params.episodeId,
      },
      select: {
        id: true,
        status: true,
        stylePreviews: {
          select: {
            status: true,
          },
        },
      },
    }),
    prisma.projectCharacter.findMany({
      where: { projectId: params.projectId },
      select: {
        id: true,
        appearances: {
          orderBy: { appearanceIndex: 'asc' },
          take: 1,
          select: {
            imageUrl: true,
            imageMediaId: true,
          },
        },
      },
    }),
    prisma.projectLocation.findMany({
      where: { projectId: params.projectId, assetKind: 'location' },
      select: {
        id: true,
        selectedImage: {
          select: {
            imageUrl: true,
            imageMediaId: true,
            spatialProfileStatus: true,
            spatialProfileJson: true,
          },
        },
      },
    }),
    prisma.projectStoryboard.findMany({
      where: {
        episodeId: params.episodeId,
        episode: {
          projectId: params.projectId,
        },
      },
      orderBy: { updatedAt: 'desc' },
      select: {
        id: true,
        photographyPlan: true,
      },
    }),
    prisma.projectPanel.findMany({
      where: {
        storyboard: {
          episodeId: params.episodeId,
        },
      },
      select: {
        id: true,
        imageUrl: true,
        imageMediaId: true,
      },
    }),
  ])

  const locationSpatialProfileReadiness = resolveLocationSpatialProfileReadiness(
    projectLocations.map((location) => ({
      targetId: location.id,
      selectedImage: location.selectedImage ?? null,
    })),
  )
  const storyboardImageReadiness = resolveStoryboardImageReadiness(panels)
  const directStoryboards = storyboards.filter((storyboard) => {
    const plan = parseJsonRecord(storyboard.photographyPlan)
    return readString(plan.consistencyMode) === 'production_segment_continuity_storyboard'
  })
  const storyboardPanelPromptFailed = directStoryboards.some((storyboard) => {
    const plan = parseJsonRecord(storyboard.photographyPlan)
    return readString(plan.currentStage) === 'panel_prompts_failed'
  })
  const activeStoryboardPanelTaskCount = await prisma.task.count({
    where: {
      projectId: params.projectId,
      episodeId: params.episodeId,
      type: TASK_TYPE.EDIT_SCRIPT_STORYBOARD_CAMERA_PLAN,
      status: { in: ['queued', 'processing'] },
      operationId: 'generate_edit_script_storyboard',
    },
  })
  const activeAssetTaskCount = await prisma.task.count({
    where: {
      projectId: params.projectId,
      episodeId: params.episodeId,
      type: { in: [TASK_TYPE.IMAGE_CHARACTER, TASK_TYPE.IMAGE_LOCATION] },
      status: { in: ['queued', 'processing'] },
    },
  })
  const panelIds = panels.map((panel) => panel.id)
  const activeStoryboardImageTaskCount = panelIds.length > 0
    ? await prisma.task.count({
      where: {
        projectId: params.projectId,
        episodeId: params.episodeId,
        targetType: 'ProjectPanel',
        targetId: { in: panelIds },
        type: TASK_TYPE.IMAGE_PANEL,
        status: { in: ['queued', 'processing'] },
      },
    })
    : 0
  const storyboardPanelImageFailedCount = panelIds.length > 0
    ? await prisma.task.count({
      where: {
        projectId: params.projectId,
        episodeId: params.episodeId,
        targetType: 'ProjectPanel',
        targetId: { in: panelIds },
        type: TASK_TYPE.IMAGE_PANEL,
        status: 'failed',
      },
    })
    : 0
  const missingCharacterAssetCount = projectCharacters.length === 0
    ? 1
    : projectCharacters.filter((character) => {
      const appearance = character.appearances[0]
      return !appearance?.imageUrl && !appearance?.imageMediaId
    }).length
  const missingLocationAssetCount = projectLocations.length === 0
    ? 1
    : projectLocations.filter((location) => {
      const selectedImage = location.selectedImage
      return !selectedImage?.imageUrl && !selectedImage?.imageMediaId
    }).length

  return resolveEditFirstWorkflowStateFromSnapshot({
    hasEpisode: true,
    hasScreenplay: Boolean(screenplay),
    screenplayStatus: screenplay?.status ?? null,
    stylePreviewCount: screenplay?.stylePreviews.length ?? 0,
    completedStylePreviewCount: screenplay?.stylePreviews.filter((preview) => preview.status === 'completed').length ?? 0,
    confirmedStylePreviewCount: screenplay?.stylePreviews.filter((preview) => preview.status === 'confirmed').length ?? 0,
    failedStylePreviewCount: screenplay?.stylePreviews.filter((preview) => preview.status === 'failed').length ?? 0,
    editAssetRequirementCount: Math.max(1, projectCharacters.length) + Math.max(1, projectLocations.length),
    pendingAssetRequirementCount: missingCharacterAssetCount + missingLocationAssetCount,
    generatingAssetRequirementCount: activeAssetTaskCount,
    requiredLocationSpatialProfileCount: locationSpatialProfileReadiness.requiredCount,
    readyLocationSpatialProfileCount: locationSpatialProfileReadiness.readyCount,
    storyboardCount: storyboards.length,
    storyboardPanelPromptFailed,
    activeStoryboardPanelTaskCount,
    panelCount: storyboardImageReadiness.panelCount,
    storyboardPanelImageReadyCount: storyboardImageReadiness.readyCount,
    storyboardPanelImageMissingCount: storyboardImageReadiness.missingCount,
    storyboardPanelImageFailedCount,
    activeStoryboardImageTaskCount,
  })
}
