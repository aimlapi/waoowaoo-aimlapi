import type { EditFirstWorkflowStage } from '@/lib/project-workflow/edit-first'

const WORKFLOW_LAB_STAGE_ORDER: Record<EditFirstWorkflowStage, number> = {
  not_started: 0,
  ready_to_generate_screenplay: 1,
  screenplay_ready_for_review: 2,
  style_preview_generating: 3,
  needs_style_choice: 4,
  ready_to_generate_assets: 5,
  assets_generating: 6,
  ready_to_generate_storyboard: 7,
  storyboard_generating: 8,
  ready_to_generate_storyboard_images: 9,
  storyboard_images_generating: 10,
  ready_to_generate_videos: 11,
  videos_generating: 12,
  ready_to_render_final: 13,
  completed: 14,
  failed: 15,
}

export function workflowLabStageAtLeast(stage: EditFirstWorkflowStage, threshold: EditFirstWorkflowStage): boolean {
  return WORKFLOW_LAB_STAGE_ORDER[stage] >= WORKFLOW_LAB_STAGE_ORDER[threshold]
}

export function shouldWorkflowLabCloneScreenplay(stage: EditFirstWorkflowStage): boolean {
  return workflowLabStageAtLeast(stage, 'screenplay_ready_for_review')
}

export function shouldWorkflowLabCloneStylePreviews(stage: EditFirstWorkflowStage): boolean {
  return workflowLabStageAtLeast(stage, 'needs_style_choice')
}

export function shouldWorkflowLabCloneStoryboards(stage: EditFirstWorkflowStage): boolean {
  return workflowLabStageAtLeast(stage, 'ready_to_generate_storyboard_images')
}

export function shouldWorkflowLabCloneVideos(stage: EditFirstWorkflowStage): boolean {
  return workflowLabStageAtLeast(stage, 'ready_to_render_final')
}

export function resolveWorkflowLabScreenplayStatus(stage: EditFirstWorkflowStage, sourceStatus: string): string {
  if (!shouldWorkflowLabCloneScreenplay(stage)) return sourceStatus
  if (!shouldWorkflowLabCloneStylePreviews(stage)) return 'screenplay_ready'
  if (!workflowLabStageAtLeast(stage, 'ready_to_generate_assets')) return 'style_preview_ready'
  return 'ready'
}

export function resolveWorkflowLabStylePreviewStatus(stage: EditFirstWorkflowStage, sourceStatus: string): string {
  if (stage === 'needs_style_choice' && sourceStatus === 'confirmed') return 'completed'
  return sourceStatus
}
