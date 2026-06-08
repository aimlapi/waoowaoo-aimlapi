import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { ProjectPanel } from '@prisma/client'
import type { ProjectModelConfig } from '@/lib/config-service'

const submitTaskMock = vi.hoisted(() => vi.fn(async (input: {
  readonly targetId: string
  readonly dedupeKey?: string | null
}) => ({
  taskId: `task-${input.targetId}`,
  status: 'queued',
})))

vi.mock('@/lib/billing', () => ({
  buildDefaultTaskBillingInfo: vi.fn(() => ({ units: 1 })),
}))

vi.mock('@/lib/config-service', () => ({
  buildImageBillingPayload: vi.fn(async (input: {
    readonly basePayload: Record<string, unknown>
  }) => input.basePayload),
}))

vi.mock('@/lib/task/submitter', () => ({
  submitTask: submitTaskMock,
}))

vi.mock('@/lib/task/ui-payload', () => ({
  withTaskUiPayload: vi.fn((payload: Record<string, unknown>) => payload),
}))

describe('submitStoryboardPanelTask', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('keeps img2img reference dedupe keys within the task column length', async () => {
    const { submitStoryboardPanelTask } = await import('@/lib/dev-ab-test/storyboard-batch-submit')
    const panel: ProjectPanel = {
      id: 'panel-1',
      storyboardId: 'storyboard-1',
      panelIndex: 1,
      panelNumber: 2,
      shotType: null,
      cameraMove: null,
      description: null,
      location: null,
      characters: null,
      props: null,
      srtSegment: null,
      srtStart: null,
      srtEnd: null,
      duration: null,
      imagePrompt: null,
      imageUrl: null,
      imageMediaId: null,
      imageHistory: null,
      videoPrompt: null,
      firstLastFramePrompt: null,
      videoUrl: null,
      videoGenerationMode: null,
      lastVideoGenerationOptions: null,
      videoMediaId: null,
      createdAt: new Date('2026-06-08T00:00:00.000Z'),
      updatedAt: new Date('2026-06-08T00:00:00.000Z'),
      sceneType: null,
      candidateImages: null,
      linkedToNextPanel: false,
      lipSyncTaskId: null,
      lipSyncVideoUrl: null,
      lipSyncVideoMediaId: null,
      sketchImageUrl: null,
      sketchImageMediaId: null,
      photographyRules: null,
      actingNotes: null,
      previousImageUrl: null,
      previousImageMediaId: null,
    }
    const projectModelConfig: ProjectModelConfig = {
      analysisModel: null,
      characterModel: null,
      locationModel: null,
      storyboardModel: 'storyboard-model',
      editModel: null,
      videoModel: null,
      singleShotVideoModel: null,
      sequenceVideoModel: null,
      audioModel: null,
      musicModel: null,
      videoRatio: null,
      capabilityDefaults: {},
      capabilityOverrides: {},
    }

    const result = await submitStoryboardPanelTask({
      userId: 'user-1',
      locale: 'zh',
      requestId: 'request-1',
      projectId: 'project-1',
      episodeId: 'episode-1',
      panel,
      schemeId: 'first-panel-img2img',
      projectModelConfig,
      capabilityOptions: {},
      styleSignature: `style-${'x'.repeat(400)}`,
      referencePanelImageUrls: [
        `images/${'very-long-reference-key-'.repeat(20)}panel-01.jpg`,
      ],
      referenceImageNotes: [
        'Use panel 01 as master reference.',
      ],
    })

    const submitInput = submitTaskMock.mock.calls[0]?.[0]
    expect(result).toEqual({
      panelNumber: 2,
      panelId: 'panel-1',
      taskId: 'task-panel-1',
      status: 'queued',
    })
    expect(submitInput?.dedupeKey).toMatch(/^dev_storyboard_batch:first-panel-img2img:panel-1:1:[a-f0-9]{16}:refs:[a-f0-9]{16}$/)
    expect(submitInput?.dedupeKey?.length).toBeLessThanOrEqual(255)
  })
})
