import { describe, expect, it } from 'vitest'
import {
  resolveEditFirstWorkflowCapabilityOperationIds,
  resolveEditFirstWorkflowStateFromSnapshot,
  type EditFirstWorkflowSnapshot,
} from '@/lib/project-workflow/edit-first'

function snapshot(overrides: Partial<EditFirstWorkflowSnapshot> = {}): EditFirstWorkflowSnapshot {
  return {
    hasEpisode: true,
    hasScreenplay: false,
    screenplayStatus: null,
    stylePreviewCount: 0,
    completedStylePreviewCount: 0,
    confirmedStylePreviewCount: 0,
    failedStylePreviewCount: 0,
    editAssetRequirementCount: 0,
    pendingAssetRequirementCount: 0,
    generatingAssetRequirementCount: 0,
    requiredLocationSpatialProfileCount: 0,
    readyLocationSpatialProfileCount: 0,
    storyboardCount: 0,
    storyboardPanelPromptFailed: false,
    activeStoryboardPanelTaskCount: 0,
    panelCount: 0,
    storyboardPanelImageReadyCount: 0,
    storyboardPanelImageMissingCount: 0,
    storyboardPanelImageFailedCount: 0,
    activeStoryboardImageTaskCount: 0,
    ...overrides,
  }
}

describe('edit-first workflow state', () => {
  it('exposes initial screenplay generation without an execution approval block', () => {
    const state = resolveEditFirstWorkflowStateFromSnapshot(snapshot())

    expect(state.stage).toBe('ready_to_generate_screenplay')
    expect(state.blocking.kind).toBe('none')
    expect(state.nextAction?.operationId).toBe('generate_edit_screenplay')
    expect(state.nextAction?.requiresUserConfirmation).toBe(false)
    expect(state.allowedOperationIds).toEqual(['generate_edit_screenplay'])
  })

  it('requires screenplay review before style preview generation', () => {
    const state = resolveEditFirstWorkflowStateFromSnapshot(snapshot({
      hasScreenplay: true,
      screenplayStatus: 'screenplay_ready',
    }))

    expect(state.stage).toBe('screenplay_ready_for_review')
    expect(state.blocking.kind).toBe('needs_user_choice')
    expect(state.nextAction?.operationId).toBe('generate_edit_style_previews')
    expect(state.nextAction?.requiresUserConfirmation).toBe(false)
    expect(state.allowedOperationIds).toEqual(['generate_edit_style_previews', 'revise_edit_screenplay'])
  })

  it('blocks later operations while style preview images are generating', () => {
    const state = resolveEditFirstWorkflowStateFromSnapshot(snapshot({
      hasScreenplay: true,
      screenplayStatus: 'style_preview_generating',
      stylePreviewCount: 3,
      completedStylePreviewCount: 1,
    }))

    expect(state.stage).toBe('style_preview_generating')
    expect(state.blocking.kind).toBe('processing')
    expect(state.nextAction).toBeNull()
    expect(state.allowedOperationIds).toEqual([])
  })

  it('allows choosing a completed style preview when sibling style preview tasks failed', () => {
    const state = resolveEditFirstWorkflowStateFromSnapshot(snapshot({
      hasScreenplay: true,
      screenplayStatus: 'style_preview_generating',
      stylePreviewCount: 2,
      completedStylePreviewCount: 1,
      failedStylePreviewCount: 1,
    }))

    expect(state.stage).toBe('needs_style_choice')
    expect(state.blocking.kind).toBe('needs_user_choice')
    expect(state.allowedOperationIds).toEqual(['generate_edit_style_previews'])
  })

  it('regenerates style previews instead of screenplay when all style preview tasks failed', () => {
    const state = resolveEditFirstWorkflowStateFromSnapshot(snapshot({
      hasScreenplay: true,
      screenplayStatus: 'style_preview_generating',
      stylePreviewCount: 2,
      failedStylePreviewCount: 2,
    }))

    expect(state.stage).toBe('failed')
    expect(state.blocking.reason).toBe('all style preview generation tasks failed')
    expect(state.nextAction?.operationId).toBe('generate_edit_style_previews')
    expect(resolveEditFirstWorkflowCapabilityOperationIds(state)).toEqual(['generate_edit_style_previews'])
  })

  it('requires user style choice before asset generation', () => {
    const state = resolveEditFirstWorkflowStateFromSnapshot(snapshot({
      hasScreenplay: true,
      screenplayStatus: 'style_preview_ready',
      stylePreviewCount: 3,
      completedStylePreviewCount: 3,
    }))

    expect(state.stage).toBe('needs_style_choice')
    expect(state.blocking.kind).toBe('needs_user_choice')
    expect(state.allowedOperationIds).toEqual(['generate_edit_style_previews'])
  })

  it('generates screenplay assets directly after a confirmed visual style when assets are missing', () => {
    const state = resolveEditFirstWorkflowStateFromSnapshot(snapshot({
      hasScreenplay: true,
      screenplayStatus: 'ready',
      stylePreviewCount: 3,
      confirmedStylePreviewCount: 1,
      editAssetRequirementCount: 2,
      pendingAssetRequirementCount: 2,
    }))

    expect(state.stage).toBe('ready_to_generate_assets')
    expect(state.nextAction?.operationId).toBe('generate_edit_script_assets')
    expect(state.nextAction?.requiresUserConfirmation).toBe(false)
    expect(resolveEditFirstWorkflowCapabilityOperationIds(state)).toEqual(['generate_edit_script_assets'])
  })

  it('keeps asset stage processing while generated assets or spatial facts are still running', () => {
    const state = resolveEditFirstWorkflowStateFromSnapshot(snapshot({
      hasScreenplay: true,
      screenplayStatus: 'ready',
      pendingAssetRequirementCount: 1,
      generatingAssetRequirementCount: 1,
      requiredLocationSpatialProfileCount: 1,
      readyLocationSpatialProfileCount: 0,
    }))

    expect(state.stage).toBe('assets_generating')
    expect(state.blocking.kind).toBe('processing')
    expect(resolveEditFirstWorkflowCapabilityOperationIds(state)).toEqual([])
  })

  it('moves directly to storyboard panels once assets and lightweight spatial facts are ready', () => {
    const state = resolveEditFirstWorkflowStateFromSnapshot(snapshot({
      hasScreenplay: true,
      screenplayStatus: 'ready',
      editAssetRequirementCount: 2,
      pendingAssetRequirementCount: 0,
      requiredLocationSpatialProfileCount: 1,
      readyLocationSpatialProfileCount: 1,
      panelCount: 0,
    }))

    expect(state.stage).toBe('ready_to_generate_storyboard')
    expect(state.nextAction?.operationId).toBe('generate_edit_script_storyboard')
    expect(state.nextAction?.requiresUserConfirmation).toBe(false)
    expect(resolveEditFirstWorkflowCapabilityOperationIds(state)).toEqual(['generate_edit_script_storyboard'])
  })

  it('does not expose storyboard panel regeneration while direct panel prompts are generating', () => {
    const state = resolveEditFirstWorkflowStateFromSnapshot(snapshot({
      hasScreenplay: true,
      screenplayStatus: 'ready',
      activeStoryboardPanelTaskCount: 1,
      panelCount: 0,
    }))

    expect(state.stage).toBe('storyboard_generating')
    expect(state.blocking.kind).toBe('processing')
    expect(state.nextAction).toBeNull()
    expect(resolveEditFirstWorkflowCapabilityOperationIds(state)).toEqual([])
  })

  it('offers direct storyboard panel regeneration when panel prompt generation fails', () => {
    const state = resolveEditFirstWorkflowStateFromSnapshot(snapshot({
      hasScreenplay: true,
      screenplayStatus: 'ready',
      storyboardPanelPromptFailed: true,
      panelCount: 0,
    }))

    expect(state.stage).toBe('failed')
    expect(state.blocking).toEqual({
      kind: 'failed',
      reason: 'storyboard panel prompt generation failed',
    })
    expect(state.nextAction?.operationId).toBe('generate_edit_script_storyboard')
    expect(resolveEditFirstWorkflowCapabilityOperationIds(state)).toEqual(['generate_edit_script_storyboard'])
  })

  it('does not expose video generation when storyboard panels exist but images are missing', () => {
    const state = resolveEditFirstWorkflowStateFromSnapshot(snapshot({
      hasScreenplay: true,
      screenplayStatus: 'ready',
      storyboardCount: 1,
      panelCount: 17,
      storyboardPanelImageReadyCount: 3,
      storyboardPanelImageMissingCount: 14,
    }))

    expect(state.stage).toBe('ready_to_generate_storyboard_images')
    expect(state.nextAction?.operationId).toBe('generate_edit_script_storyboard_images')
    expect(state.nextAction?.requiresUserConfirmation).toBe(true)
    expect(state.blocking.kind).toBe('needs_confirmation')
    expect(resolveEditFirstWorkflowCapabilityOperationIds(state)).toEqual(['generate_edit_script_storyboard_images'])
  })

  it('keeps storyboard image generation blocked while panel image tasks are active', () => {
    const state = resolveEditFirstWorkflowStateFromSnapshot(snapshot({
      hasScreenplay: true,
      screenplayStatus: 'ready',
      storyboardCount: 1,
      panelCount: 17,
      storyboardPanelImageReadyCount: 3,
      storyboardPanelImageMissingCount: 14,
      activeStoryboardImageTaskCount: 14,
    }))

    expect(state.stage).toBe('storyboard_images_generating')
    expect(state.blocking.kind).toBe('processing')
    expect(resolveEditFirstWorkflowCapabilityOperationIds(state)).toEqual([])
  })

  it('allows video generation only after all storyboard panel images are ready', () => {
    const state = resolveEditFirstWorkflowStateFromSnapshot(snapshot({
      hasScreenplay: true,
      screenplayStatus: 'ready',
      storyboardCount: 1,
      panelCount: 17,
      storyboardPanelImageReadyCount: 17,
      storyboardPanelImageMissingCount: 0,
    }))

    expect(state.stage).toBe('ready_to_generate_videos')
    expect(state.nextAction?.operationId).toBe('generate_episode_videos')
    expect(state.nextAction?.requiresUserConfirmation).toBe(true)
    expect(state.blocking.kind).toBe('needs_confirmation')
    expect(resolveEditFirstWorkflowCapabilityOperationIds(state)).toEqual(['generate_episode_videos'])
  })
})
