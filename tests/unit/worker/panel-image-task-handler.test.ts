import type { Job } from 'bullmq'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import sharp from 'sharp'
import { TASK_TYPE, type TaskJobData } from '@/lib/task/types'
import { buildZenStyleBibleFixture } from '../../fixtures/edit-script-style-bible'

const prismaMock = vi.hoisted(() => {
  const projectPanelUpdate = vi.fn(async () => ({}))
  return {
    project: {
      findUnique: vi.fn(),
    },
    projectPanel: {
      findUnique: vi.fn(),
      findMany: vi.fn(),
      update: projectPanelUpdate,
    },
    $transaction: vi.fn(async (handler: (tx: { projectPanel: { update: typeof projectPanelUpdate } }) => Promise<void>) => {
      await handler({ projectPanel: { update: projectPanelUpdate } })
    }),
    projectStoryboardBlockingArtifact: {
      findMany: vi.fn(),
    },
    projectEditScript: {
      findFirst: vi.fn(),
    },
    projectEditScreenplay: {
      findFirst: vi.fn(),
    },
  }
})

const utilsMock = vi.hoisted(() => ({
  assertTaskActive: vi.fn(async () => undefined),
  getProjectModels: vi.fn(async () => ({ storyboardModel: 'storyboard-model-1', artStyle: 'realistic' })),
  resolveImageSourceFromGeneration: vi.fn(),
  toSignedUrlIfCos: vi.fn((url: string | null | undefined) => url || null),
  uploadImageSourceToCos: vi.fn(),
}))

const sharedMock = vi.hoisted(() => ({
  collectPanelReferenceImageItemsWithDiagnostics: vi.fn(async () => ({
    items: [
      { url: 'https://signed.example/sketch.png', role: 'sketch', name: 'storyboard sketch' },
      { url: 'https://signed.example/hero.png', role: 'character', name: 'Hero', appearance: 'default', slot: '街道左侧靠墙的留白位置' },
      { url: 'https://signed.example/location.png', role: 'location', name: 'Old Town' },
    ],
    diagnostics: [{
      kind: 'character',
      inputIndex: 1,
      name: 'Hero',
      appearance: 'default',
      signedUrl: 'https://signed.example/hero.png',
      issue: null,
    }],
    issues: [],
    expectedCharacterReferenceCount: 1,
  })),
  normalizeReferenceImageItemsForGeneration: vi.fn(async (
    items: Array<{ url: string; role: string; name: string; appearance?: string | null; slot?: string | null }>,
    options?: { onIssue?: (issue: { index: number; input: string; code: string; stage: string; message: string }) => void },
  ) => {
    void options
    return {
      referenceImages: items.map((item, index) => {
        const defaults = ['normalized-sketch', 'normalized-hero', 'normalized-location']
        return defaults[index] || `normalized:${item.url}`
      }),
      referenceImagesMap: items.map((item, index) => ({
        image_no: `图 ${index + 1}`,
        role: item.role,
        name: item.role === 'sketch' ? '分镜草图' : item.name,
        ...(item.appearance ? { appearance: item.appearance } : {}),
        ...(item.slot ? { slot: item.slot } : {}),
      })),
    }
  }),
  resolveNovelData: vi.fn(async () => ({
    videoRatio: '16:9',
    characters: [],
    locations: [
      {
        name: 'Old Town',
        images: [
          {
            isSelected: true,
            description: '雨夜街道',
            spatialProfileJson: {
              schemaVersion: 1,
              sceneSummary: '街道左侧有墙面，右侧有路灯。',
              anchors: [{
                id: 'anchor_wall',
                label: '左侧墙面',
                screenArea: '画面左侧',
                depthLayer: '中景',
                spatialRelations: ['墙面右侧是街道'],
              }],
              depthLayout: {
                foreground: '街道前景',
                midground: '墙边位置',
                background: '远处店铺',
              },
              lightingDirection: '路灯从右侧照入',
            },
          },
        ],
      },
    ],
  })),
}))

const promptMock = vi.hoisted(() => ({
  buildPrompt: vi.fn((input: { promptId?: string; variables?: Record<string, unknown> }) => {
    void input
    return 'panel-image-prompt'
  }),
}))

const outboundImageMock = vi.hoisted(() => ({
  normalizeReferenceImagesForGeneration: vi.fn(async (inputs: string[]) => inputs.map((input) => `normalized:${input}`)),
  normalizeOptionalReferenceImagesForGeneration: vi.fn(async (inputs: string[]) => inputs.map((input) => `normalized:${input}`)),
}))

vi.mock('@/lib/prisma', () => ({ prisma: prismaMock }))
vi.mock('@/lib/workers/utils', () => utilsMock)
vi.mock('@/lib/workers/shared', () => ({ reportTaskProgress: vi.fn(async () => undefined) }))
vi.mock('@/lib/media/outbound-image', () => ({
  normalizeReferenceImagesForGeneration: outboundImageMock.normalizeReferenceImagesForGeneration,
  normalizeOptionalReferenceImagesForGeneration: outboundImageMock.normalizeOptionalReferenceImagesForGeneration,
}))
vi.mock('@/lib/logging/core', () => ({
  logInfo: vi.fn(),
  createScopedLogger: vi.fn(() => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    event: vi.fn(),
    child: vi.fn(),
  })),
}))
vi.mock('@/lib/workers/handlers/image-task-handler-shared', async () => {
  const actual = await vi.importActual<typeof import('@/lib/workers/handlers/image-task-handler-shared')>(
    '@/lib/workers/handlers/image-task-handler-shared',
  )
  return {
    ...actual,
    collectPanelReferenceImageItemsWithDiagnostics: sharedMock.collectPanelReferenceImageItemsWithDiagnostics,
    normalizeReferenceImageItemsForGeneration: sharedMock.normalizeReferenceImageItemsForGeneration,
    resolveNovelData: sharedMock.resolveNovelData,
  }
})
vi.mock('@/lib/ai-prompts', () => ({
  AI_PROMPT_IDS: {
    PANEL_IMAGE_GENERATE: 'panel-image-generate',
  },
  buildAiPrompt: promptMock.buildPrompt,
}))

import { handlePanelImageTask } from '@/lib/workers/handlers/panel-image-task-handler'

function buildJob(payload: Record<string, unknown>, targetId = 'panel-1'): Job<TaskJobData> {
  const generationOptions = payload.generationOptions && typeof payload.generationOptions === 'object'
    ? payload.generationOptions
    : { aspectRatio: '16:9' }
  return {
    data: {
      taskId: 'task-panel-image-1',
      type: TASK_TYPE.IMAGE_PANEL,
      locale: 'zh',
      projectId: 'project-1',
      episodeId: 'episode-1',
      targetType: 'ProjectPanel',
      targetId,
      payload: {
        generationOptions,
        ...payload,
      },
      userId: 'user-1',
    },
  } as unknown as Job<TaskJobData>
}

describe('worker panel-image-task-handler behavior', () => {
  beforeEach(() => {
    vi.clearAllMocks()

    prismaMock.project.findUnique.mockResolvedValue({
      visualStylePresetSource: 'system',
      visualStylePresetId: 'realistic',
      artStyle: 'realistic',
    })

    prismaMock.projectPanel.findUnique.mockResolvedValue({
      id: 'panel-1',
      storyboardId: 'storyboard-1',
      panelIndex: 0,
      shotType: 'close-up',
      cameraMove: 'static',
      description: 'hero close-up',
      imagePrompt: 'panel anchor prompt',
      videoPrompt: null,
      location: 'Old Town',
      characters: JSON.stringify([{ name: 'Hero', appearance: 'default', slot: '街道左侧靠墙的留白位置' }]),
      srtSegment: '台词片段',
      photographyRules: null,
      actingNotes: null,
      sketchImageUrl: null,
      imageUrl: null,
      imageMediaId: null,
    })
    prismaMock.projectPanel.findMany.mockResolvedValue([])
    prismaMock.projectStoryboardBlockingArtifact.findMany.mockResolvedValue([])
    prismaMock.projectEditScript.findFirst.mockResolvedValue(null)
    prismaMock.projectEditScreenplay.findFirst.mockResolvedValue(null)

    utilsMock.resolveImageSourceFromGeneration
      .mockResolvedValueOnce('generated-source-1')
      .mockResolvedValueOnce('generated-source-2')

    utilsMock.uploadImageSourceToCos
      .mockResolvedValueOnce('cos/panel-candidate-1.png')
      .mockResolvedValueOnce('cos/panel-candidate-2.png')
  })

  it('missing panelId -> explicit error', async () => {
    const job = buildJob({}, '')
    await expect(handlePanelImageTask(job)).rejects.toThrow('panelId missing')
  })

  it('first generation -> persists main image and candidate list', async () => {
    const job = buildJob({ candidateCount: 2 })
    const result = await handlePanelImageTask(job)

    expect(result).toEqual({
      panelId: 'panel-1',
      candidateCount: 2,
      imageUrl: 'cos/panel-candidate-1.png',
    })

    expect(utilsMock.resolveImageSourceFromGeneration).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        modelId: 'storyboard-model-1',
        prompt: expect.stringContaining('Generate one still storyboard frame'),
        allowTaskExternalIdResume: false,
        options: expect.objectContaining({
          referenceImages: ['normalized-sketch', 'normalized-hero', 'normalized-location'],
          aspectRatio: '16:9',
        }),
      }),
    )
    expect(sharedMock.normalizeReferenceImageItemsForGeneration).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({ role: 'sketch', name: 'storyboard sketch' }),
        expect.objectContaining({ role: 'character', name: 'Hero' }),
        expect.objectContaining({ role: 'location', name: 'Old Town' }),
      ]),
      expect.objectContaining({ locale: 'zh' }),
    )
    const generationCalls = utilsMock.resolveImageSourceFromGeneration.mock.calls as unknown as Array<[unknown, { prompt?: string }]>
    expect(generationCalls[0]?.[1].prompt).toContain('"slot": "街道左侧靠墙的留白位置"')
    expect(generationCalls[0]?.[1].prompt).toContain('"image_no": "图 1"')
    expect(generationCalls[0]?.[1].prompt).toContain('"role": "sketch"')
    expect(generationCalls[0]?.[1].prompt).toContain('"image_no": "图 2"')
    expect(generationCalls[0]?.[1].prompt).toContain('"role": "character"')
    expect(generationCalls[0]?.[1].prompt).toContain('"image_no": "图 3"')
    expect(generationCalls[0]?.[1].prompt).toContain('"role": "location"')
    expect(prismaMock.projectPanel.update).toHaveBeenCalledWith({
      where: { id: 'panel-1' },
      data: {
        imageUrl: 'cos/panel-candidate-1.png',
        candidateImages: JSON.stringify(['cos/panel-candidate-1.png', 'cos/panel-candidate-2.png']),
      },
    })
  })

  it('compare-only single generation -> returns candidates without mutating panel records', async () => {
    const result = await handlePanelImageTask(buildJob({ candidateCount: 2, compareOnly: true }))

    expect(result).toEqual({
      panelId: 'panel-1',
      candidateCount: 2,
      imageUrl: 'cos/panel-candidate-1.png',
      imageUrls: ['cos/panel-candidate-1.png', 'cos/panel-candidate-2.png'],
      compareOnly: true,
      promptDebug: expect.objectContaining({
        omittedFields: [],
        referenceImageCount: 3,
      }),
    })
    expect(utilsMock.resolveImageSourceFromGeneration).toHaveBeenCalledTimes(2)
    expect(utilsMock.uploadImageSourceToCos).toHaveBeenCalledTimes(2)
    expect(prismaMock.projectPanel.update).not.toHaveBeenCalled()
  })

  it('appends Style Bible block to final storyboard image prompt', async () => {
    prismaMock.projectEditScript.findFirst.mockResolvedValueOnce({
      styleBibleJson: buildZenStyleBibleFixture(),
    })

    await handlePanelImageTask(buildJob({ candidateCount: 1 }))

    expect(utilsMock.resolveImageSourceFromGeneration).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        prompt: expect.stringContaining('系统 Style Bible 视觉要求（固定追加，必须遵守）：'),
      }),
    )
    expect(utilsMock.resolveImageSourceFromGeneration).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        prompt: expect.stringContaining('用途：分镜图生成'),
      }),
    )
    expect(utilsMock.resolveImageSourceFromGeneration).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        prompt: expect.stringContaining('可选镜头与景深质感：35mm镜头，中浅景深，自然透视。'),
      }),
    )
    expect(utilsMock.resolveImageSourceFromGeneration).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        prompt: expect.stringContaining('SHOT_PRIORITY'),
      }),
    )
    expect(utilsMock.resolveImageSourceFromGeneration).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        prompt: expect.not.stringContaining('声音正向风格：'),
      }),
    )
  })

  it('compare-only field omission can remove the final Style Bible block', async () => {
    prismaMock.projectEditScript.findFirst.mockResolvedValueOnce({
      styleBibleJson: buildZenStyleBibleFixture(),
    })

    const result = await handlePanelImageTask(buildJob({
      candidateCount: 1,
      compareOnly: true,
      promptFieldOmissions: ['style_bible'],
    }))

    expect(utilsMock.resolveImageSourceFromGeneration).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        prompt: expect.not.stringContaining('系统 Style Bible 视觉要求（固定追加，必须遵守）：'),
      }),
    )
    expect(result).toEqual(expect.objectContaining({
      promptDebug: expect.objectContaining({
        omittedFields: ['style_bible'],
        prompt: expect.stringContaining('Generate one still storyboard frame'),
      }),
    }))
  })

  it('includes selected previous panel images as generation references', async () => {
    const job = buildJob({
      candidateCount: 1,
      referencePanelImageUrls: ['images/previous-panel.png'],
      extraImageUrls: ['https://example.com/manual-ref.png'],
      referenceImageNotes: [
        'source=storyboard; label=#1 close-up; usage=Use for continuity and staging',
        'source=character; label=Hero asset; usage=Use for identity only',
      ],
    })
    await handlePanelImageTask(job)

    expect(sharedMock.normalizeReferenceImageItemsForGeneration).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({ url: 'https://signed.example/sketch.png', role: 'sketch' }),
        expect.objectContaining({ url: 'https://signed.example/hero.png', role: 'character' }),
        expect.objectContaining({ url: 'https://signed.example/location.png', role: 'location' }),
        expect.objectContaining({ url: 'images/previous-panel.png', role: 'source_panel' }),
        expect.objectContaining({ url: 'https://example.com/manual-ref.png', role: 'extra' }),
      ]),
      expect.objectContaining({
        locale: 'zh',
        context: { taskType: TASK_TYPE.IMAGE_PANEL, scope: 'panel-image.refs' },
      }),
    )
    expect(utilsMock.resolveImageSourceFromGeneration).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        options: expect.objectContaining({
          referenceImages: [
            'normalized-sketch',
            'normalized-hero',
            'normalized-location',
            'normalized:images/previous-panel.png',
            'normalized:https://example.com/manual-ref.png',
          ],
        }),
      }),
    )
    expect(utilsMock.resolveImageSourceFromGeneration).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        prompt: expect.not.stringContaining('"additional_reference_images"'),
      }),
    )
  })

  it('uses spatial profile and static framing while excluding shotBlocking as still-image layout text', async () => {
    prismaMock.projectPanel.findUnique.mockResolvedValueOnce({
      id: 'panel-1',
      storyboardId: 'storyboard-1',
      panelIndex: 0,
      shotType: 'close-up',
      cameraMove: 'static',
      description: 'hero close-up',
      imagePrompt: 'panel anchor prompt',
      videoPrompt: null,
      location: 'Old Town',
      characters: JSON.stringify([{ name: 'Hero', appearance: 'default', slot: '街道左侧靠墙的留白位置' }]),
      srtSegment: '台词片段',
      photographyRules: JSON.stringify({
        consistencyMode: 'spatial_text_blocking',
        sourceVideoBlockId: 'edit-script-1:videoBlock:2',
        consistencyMetadata: {
          cameraPlan: {
            shotBlocking: {
              locationName: 'Old Town',
              absolutePosition: '画面左侧靠墙',
              relativePosition: '主角站在路灯前方',
              screenPosition: '画面左三分之一',
              characterPlacements: [{
                characterName: 'Hero',
                absolutePosition: '画面左侧靠墙',
                relativePosition: '位于路灯前方',
                screenPosition: '画面左三分之一',
                facing: '朝向画面右侧',
                eyeline: '看向街道深处',
              }],
              cameraPlacement: '从街道中线偏右拍向左侧墙面',
              composition: '主角占左侧，街道延伸到右后方',
              continuityNote: '保持街道左墙在主角身后',
            },
          },
        },
      }),
      actingNotes: null,
      sketchImageUrl: null,
      imageUrl: null,
    })
    const result = await handlePanelImageTask(buildJob({ candidateCount: 1, compareOnly: true }))

    expect(prismaMock.projectStoryboardBlockingArtifact.findMany).not.toHaveBeenCalled()
    const promptDebug = result.promptDebug
    if (!promptDebug) throw new Error('promptDebug missing')
    const context = JSON.parse(promptDebug.contextJson) as {
      panel?: { still_frame?: { static_framing?: string } }
      context?: {
        GLOBAL_SCENE_LOCK?: { stable_background?: string[] }
        LOCATION_ZONE?: { zone_name?: string | null }
        reference_images?: Array<{ image_no: string; role: string; name: string }>
      }
    }
    expect(context.panel?.still_frame?.static_framing || '').not.toContain('从街道中线偏右拍向左侧墙面')
    expect(context.context?.GLOBAL_SCENE_LOCK?.stable_background?.[0]).toBe('左侧墙面')
    expect(context.context?.reference_images?.map((item) => item.role)).toEqual(['sketch', 'character', 'location'])
    expect(utilsMock.resolveImageSourceFromGeneration).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        options: expect.objectContaining({
          referenceImages: ['normalized-sketch', 'normalized-hero', 'normalized-location'],
        }),
      }),
    )
  })

  it('storyboard reference mode -> skips automatic character and location reference images', async () => {
    const job = buildJob({
      candidateCount: 1,
      referenceMode: 'storyboard',
      referencePanelImageUrls: ['images/previous-panel.png'],
      extraImageUrls: ['https://example.com/manual-ref.png'],
      referenceImageNotes: [
        'source=storyboard; label=#1 close-up; usage=Use only this storyboard image',
      ],
    })
    await handlePanelImageTask(job)

    expect(sharedMock.collectPanelReferenceImageItemsWithDiagnostics).not.toHaveBeenCalled()
    const normalizeCalls = sharedMock.normalizeReferenceImageItemsForGeneration.mock.calls as unknown as Array<[
      Array<{ role: string; url: string; name: string }>,
      unknown,
    ]>
    expect(normalizeCalls[0]?.[0].map((item) => item.role)).toEqual(['source_panel', 'extra'])
    expect(normalizeCalls[0]?.[0]).toEqual([
      expect.objectContaining({ url: 'images/previous-panel.png', role: 'source_panel' }),
      expect.objectContaining({ url: 'https://example.com/manual-ref.png', role: 'extra' }),
    ])
    expect(utilsMock.resolveImageSourceFromGeneration).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        options: expect.objectContaining({
          referenceImages: ['normalized-sketch', 'normalized-hero'],
        }),
      }),
    )
  })

  it('grid payload -> generates one 2x2 image, crops cells, and persists panel images', async () => {
    const gridSourceBuffer = await sharp({
      create: {
        width: 8,
        height: 8,
        channels: 3,
        background: { r: 240, g: 240, b: 240 },
      },
    }).png().toBuffer()
    const gridSource = `data:image/png;base64,${gridSourceBuffer.toString('base64')}`
    const panels = [
      {
        id: 'panel-1',
        storyboardId: 'storyboard-1',
        panelIndex: 0,
        shotType: 'wide',
        cameraMove: 'static',
        description: 'first beat',
        imagePrompt: 'first prompt',
        videoPrompt: null,
        location: 'Old Town',
        characters: JSON.stringify([{ name: 'Hero', appearance: 'default' }]),
        srtSegment: 'first source',
        photographyRules: JSON.stringify({
          cameraPlan: {
            shotBlocking: 'Hero stays near the left wall, looking toward the right side of the attic.',
          },
          lighting: { direction: 'right side window' },
          verboseUnusedField: 'SHOULD_NOT_APPEAR_IN_GRID_PROMPT',
        }),
        actingNotes: null,
        sketchImageUrl: null,
        imageUrl: 'images/panel-1-old.jpg',
        imageMediaId: 'media-panel-1-old',
      },
      {
        id: 'panel-2',
        storyboardId: 'storyboard-1',
        panelIndex: 1,
        shotType: 'close',
        cameraMove: 'push',
        description: 'second beat',
        imagePrompt: 'second prompt',
        videoPrompt: null,
        location: 'Old Town',
        characters: JSON.stringify([{ name: 'Hero', appearance: 'default' }]),
        srtSegment: 'second source',
        photographyRules: null,
        actingNotes: null,
        sketchImageUrl: null,
        imageUrl: null,
        imageMediaId: null,
      },
    ]
    prismaMock.projectPanel.findMany.mockResolvedValueOnce(panels)
    utilsMock.resolveImageSourceFromGeneration.mockReset()
    utilsMock.resolveImageSourceFromGeneration.mockResolvedValueOnce(gridSource)
    utilsMock.uploadImageSourceToCos.mockReset()
    utilsMock.uploadImageSourceToCos
      .mockResolvedValueOnce('images/panel-grid.png')
      .mockResolvedValueOnce('images/panel-1-crop.jpg')
      .mockResolvedValueOnce('images/panel-2-crop.jpg')

    const result = await handlePanelImageTask(buildJob({
      storyboardGrid: {
        mode: '2x2',
        sourceVideoBlockId: 'edit-1:videoBlock:1',
        panelIds: ['panel-1', 'panel-2'],
      },
    }))

    expect(result).toEqual({
      panelIds: ['panel-1', 'panel-2'],
      candidateCount: 2,
      gridImageUrl: 'images/panel-grid.png',
      imageUrls: ['images/panel-1-crop.jpg', 'images/panel-2-crop.jpg'],
    })
    expect(utilsMock.resolveImageSourceFromGeneration).toHaveBeenCalledTimes(1)
    expect(utilsMock.resolveImageSourceFromGeneration).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        modelId: 'storyboard-model-1',
        prompt: expect.stringContaining('GLOBAL TASK'),
        options: expect.objectContaining({
          aspectRatio: '16:9',
        }),
      }),
    )
    expect(utilsMock.resolveImageSourceFromGeneration).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        prompt: expect.stringContaining('LOCATION_ZONE'),
      }),
    )
    expect(utilsMock.resolveImageSourceFromGeneration).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        prompt: expect.stringContaining('SHOT_PRIORITY'),
      }),
    )
    expect(utilsMock.uploadImageSourceToCos).toHaveBeenCalledTimes(3)
    expect(utilsMock.uploadImageSourceToCos).toHaveBeenNthCalledWith(
      1,
      expect.any(Buffer),
      'panel-grid',
      'edit-1-videoBlock-1-panel-1',
    )
    expect(prismaMock.$transaction).toHaveBeenCalledTimes(1)
    expect(prismaMock.projectPanel.update).toHaveBeenCalledWith({
      where: { id: 'panel-1' },
      data: {
        imageUrl: 'images/panel-1-crop.jpg',
        candidateImages: null,
        previousImageUrl: 'images/panel-1-old.jpg',
        previousImageMediaId: 'media-panel-1-old',
        imageMediaId: null,
      },
    })
    expect(prismaMock.projectPanel.update).toHaveBeenCalledWith({
      where: { id: 'panel-2' },
      data: {
        imageUrl: 'images/panel-2-crop.jpg',
        candidateImages: null,
        previousImageUrl: null,
        previousImageMediaId: null,
        imageMediaId: null,
      },
    })
    const finalPrompt = (utilsMock.resolveImageSourceFromGeneration.mock.calls[0]?.[1] as { prompt?: string } | undefined)?.prompt || ''
    expect(finalPrompt).toContain('左侧墙面')
    expect(finalPrompt).not.toContain('Hero stays near the left wall')
    expect(finalPrompt).not.toContain('right side of the attic')
    expect(finalPrompt).not.toContain('SHOULD_NOT_APPEAR_IN_GRID_PROMPT')
  })

  it('grid prompt uses per-panel location zones and strips conflicting old spatial text', async () => {
    sharedMock.resolveNovelData.mockResolvedValueOnce({
      videoRatio: '16:9',
      characters: [],
      locations: [
        {
          name: 'Old Town',
          images: [
            {
              isSelected: true,
              description: '四宫格空间板槽位：请把窗画在右侧并补全房间布局。',
              spatialProfileJson: {
                schemaVersion: 1,
                sceneSummary: '窗在北墙尽头。',
                anchors: [{
                  id: 'north-window',
                  label: '北墙尽头的窗',
                  screenArea: '空间最深处',
                  depthLayer: '背景',
                  spatialRelations: ['窗只位于北墙尽头'],
                }],
                depthLayout: {
                  foreground: '中央空地',
                  midground: '主通道',
                  background: '北墙尽头的窗',
                },
                lightingDirection: '光从北墙尽头的窗进入',
              },
            },
          ],
        },
      ],
    })
    const gridSourceBuffer = await sharp({
      create: {
        width: 8,
        height: 8,
        channels: 3,
        background: { r: 240, g: 240, b: 240 },
      },
    }).png().toBuffer()
    const gridSource = `data:image/png;base64,${gridSourceBuffer.toString('base64')}`
    prismaMock.projectPanel.findMany.mockResolvedValueOnce([
      {
        id: 'panel-1',
        storyboardId: 'storyboard-1',
        panelIndex: 0,
        shotType: 'wide',
        cameraMove: 'static',
        description: '窗在右侧。主体举起酒杯。',
        imagePrompt: 'The window is on the right side. A glowing glass is the subject.',
        videoPrompt: 'Do not appear in grid prompt.',
        location: 'Old Town',
        characters: JSON.stringify([{ name: 'Hero', appearance: 'default' }]),
        srtSegment: '门在左侧。主体后撤。',
        photographyRules: JSON.stringify({
          sceneZone: {
            sceneZoneId: 'zone-subject-glass',
            name: '主体酒杯局部',
            overallPosition: '只拍主体和酒杯所在局部，不重建整间房。',
            fixedAnchors: ['主体手部', '发光酒杯'],
          },
          shotBlocking: {
            subjectPosition: '主体与酒杯位于画面中央。',
            cameraPosition: '正面低机位。',
            screenComposition: '主体和酒杯占据中心。',
          },
          cameraPlan: {
            cameraPosition: '从右侧窗边拍摄',
            composition: '房间布局：窗在右侧。主体占画面中心。',
            axisAndEyeline: '视线看向右侧窗户',
            lighting: '右侧窗户进光',
            continuityIn: '从右侧窗户切入',
            continuityOut: '向左侧门切出',
            shotBlocking: {
              absolutePosition: '窗在右侧',
              relativePosition: '门在左侧',
              screenPosition: '窗边右侧',
              cameraPlacement: '右侧窗边',
              composition: '房间布局由右侧窗户定义',
            },
          },
        }),
        actingNotes: null,
        sketchImageUrl: null,
        imageUrl: null,
        imageMediaId: null,
      },
      {
        id: 'panel-2',
        storyboardId: 'storyboard-1',
        panelIndex: 1,
        shotType: 'close',
        cameraMove: 'push',
        description: '墙在左侧。主体低头。',
        imagePrompt: 'Door on the left side. Subject lowers head.',
        videoPrompt: null,
        location: 'Old Town',
        characters: JSON.stringify([{ name: 'Hero', appearance: 'default' }]),
        srtSegment: '主体低头。',
        photographyRules: JSON.stringify({
          sceneZone: {
            sceneZoneId: 'zone-subject-head',
            name: '主体脸部局部',
            overallPosition: '只拍主体脸部和肩线。',
            fixedAnchors: ['主体肩线'],
          },
        }),
        actingNotes: null,
        sketchImageUrl: null,
        imageUrl: null,
        imageMediaId: null,
      },
    ])
    utilsMock.resolveImageSourceFromGeneration.mockReset()
    utilsMock.resolveImageSourceFromGeneration.mockResolvedValueOnce(gridSource)
    utilsMock.uploadImageSourceToCos.mockReset()
    utilsMock.uploadImageSourceToCos
      .mockResolvedValueOnce('images/panel-grid.png')
      .mockResolvedValueOnce('images/panel-1-crop.jpg')
      .mockResolvedValueOnce('images/panel-2-crop.jpg')

    await handlePanelImageTask(buildJob({
      referenceImageNotes: ['空间说明：窗在右侧，门在左侧。'],
      storyboardGrid: {
        mode: '2x2',
        sourceVideoBlockId: 'edit-1:videoBlock:1',
        panelIds: ['panel-1', 'panel-2'],
      },
    }))

    const finalPrompt = (utilsMock.resolveImageSourceFromGeneration.mock.calls[0]?.[1] as { prompt?: string } | undefined)?.prompt || ''
    const locationZoneCount = (finalPrompt.match(/^LOCATION_ZONE$/gm) || []).length

    expect(locationZoneCount).toBe(2)
    expect(finalPrompt).not.toContain('SCENE_GRAPH')
    expect(finalPrompt).not.toContain('BLOCKING_STATE')
    expect(finalPrompt).not.toContain('shot_delta')
    expect(finalPrompt).not.toContain('compressedSceneGraph')
    expect(finalPrompt).toContain('主体酒杯局部')
    expect(finalPrompt).toContain('主体脸部局部')
    expect(finalPrompt).toContain('北墙尽头的窗')
    expect(finalPrompt).not.toContain('窗在右侧')
    expect(finalPrompt).not.toContain('门在左侧')
    expect(finalPrompt).not.toContain('right side')
    expect(finalPrompt).not.toContain('left side')
    expect(finalPrompt).not.toContain('四宫格空间板槽位')
    expect(finalPrompt).not.toContain('房间布局')
    expect(finalPrompt).not.toContain('从右侧窗边拍摄')
    expect(finalPrompt).not.toContain('视线看向右侧窗户')
    expect(finalPrompt).not.toContain('从右侧窗户切入')
    expect(finalPrompt).not.toContain('向左侧门切出')
    expect(finalPrompt).not.toContain('Do not appear in grid prompt')
    expect(finalPrompt).not.toContain('空间说明')
    expect(finalPrompt).toContain('"action": "主体举起酒杯。"')
    expect(finalPrompt).toContain('"action": "主体低头。"')
  })

  it('compare-only grid generation -> uses previous complete grid as serial reference without mutating panel records', async () => {
    const gridSourceBuffer = await sharp({
      create: {
        width: 8,
        height: 8,
        channels: 3,
        background: { r: 240, g: 240, b: 240 },
      },
    }).png().toBuffer()
    const gridSource = `data:image/png;base64,${gridSourceBuffer.toString('base64')}`
    prismaMock.projectPanel.findMany.mockResolvedValueOnce([
      {
        id: 'panel-1',
        storyboardId: 'storyboard-1',
        panelIndex: 0,
        shotType: 'wide',
        cameraMove: 'static',
        description: 'first beat',
        imagePrompt: 'first prompt',
        videoPrompt: null,
        location: 'Old Town',
        characters: JSON.stringify([{ name: 'Hero', appearance: 'default' }]),
        srtSegment: 'first source',
        photographyRules: null,
        actingNotes: null,
        sketchImageUrl: null,
        imageUrl: 'images/panel-1-old.jpg',
        imageMediaId: 'media-panel-1-old',
      },
      {
        id: 'panel-2',
        storyboardId: 'storyboard-1',
        panelIndex: 1,
        shotType: 'close',
        cameraMove: 'push',
        description: 'second beat',
        imagePrompt: 'second prompt',
        videoPrompt: null,
        location: 'Old Town',
        characters: JSON.stringify([{ name: 'Hero', appearance: 'default' }]),
        srtSegment: 'second source',
        photographyRules: null,
        actingNotes: null,
        sketchImageUrl: null,
        imageUrl: null,
        imageMediaId: null,
      },
    ])
    utilsMock.resolveImageSourceFromGeneration.mockReset()
    utilsMock.resolveImageSourceFromGeneration.mockResolvedValueOnce(gridSource)
    utilsMock.uploadImageSourceToCos.mockReset()
    utilsMock.uploadImageSourceToCos
      .mockResolvedValueOnce('images/panel-grid.png')
      .mockResolvedValueOnce('images/panel-1-crop.jpg')
      .mockResolvedValueOnce('images/panel-2-crop.jpg')

    const result = await handlePanelImageTask(buildJob({
      compareOnly: true,
      previousGridImageUrl: 'images/previous-grid.png',
      storyboardGrid: {
        mode: '2x2',
        sourceVideoBlockId: 'edit-1:videoBlock:1',
        panelIds: ['panel-1', 'panel-2'],
      },
    }))

    expect(result).toEqual({
      panelIds: ['panel-1', 'panel-2'],
      candidateCount: 2,
      gridImageUrl: 'images/panel-grid.png',
      imageUrls: ['images/panel-1-crop.jpg', 'images/panel-2-crop.jpg'],
      compareOnly: true,
      promptDebug: expect.objectContaining({
        omittedFields: [],
        referenceImageCount: 7,
      }),
    })
    expect(outboundImageMock.normalizeReferenceImagesForGeneration).toHaveBeenCalledWith(
      ['images/previous-grid.png'],
      expect.objectContaining({
        context: expect.objectContaining({ scope: 'panel-grid-image.previous-grid' }),
      }),
    )
    expect(utilsMock.resolveImageSourceFromGeneration).toHaveBeenCalledTimes(1)
    expect(utilsMock.resolveImageSourceFromGeneration).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
      options: expect.objectContaining({
        referenceImages: expect.arrayContaining(['normalized:images/previous-grid.png']),
      }),
    }))
    expect(utilsMock.uploadImageSourceToCos).toHaveBeenCalledTimes(3)
    expect(prismaMock.$transaction).not.toHaveBeenCalled()
    expect(prismaMock.projectPanel.update).not.toHaveBeenCalled()
  })

  it('regeneration branch -> keeps old image in previousImageUrl and stores candidates only', async () => {
    utilsMock.resolveImageSourceFromGeneration.mockReset()
    utilsMock.uploadImageSourceToCos.mockReset()

    prismaMock.projectPanel.findUnique.mockResolvedValueOnce({
      id: 'panel-1',
      storyboardId: 'storyboard-1',
      panelIndex: 0,
      shotType: 'close-up',
      cameraMove: 'static',
      description: 'hero close-up',
      imagePrompt: null,
      videoPrompt: null,
      location: 'Old Town',
      characters: '[]',
      srtSegment: null,
      photographyRules: null,
      actingNotes: null,
      sketchImageUrl: null,
      imageUrl: 'cos/panel-old.png',
    })

    utilsMock.resolveImageSourceFromGeneration.mockResolvedValueOnce('generated-source-regen')
    utilsMock.uploadImageSourceToCos.mockResolvedValueOnce('cos/panel-regenerated.png')

    const job = buildJob({ candidateCount: 1 })
    const result = await handlePanelImageTask(job)

    expect(result).toEqual({
      panelId: 'panel-1',
      candidateCount: 1,
      imageUrl: null,
    })

    expect(prismaMock.projectPanel.update).toHaveBeenCalledWith({
      where: { id: 'panel-1' },
      data: {
        previousImageUrl: 'cos/panel-old.png',
        candidateImages: JSON.stringify(['cos/panel-regenerated.png']),
      },
    })
  })

  it('fails when a character reference image cannot be normalized', async () => {
    sharedMock.normalizeReferenceImageItemsForGeneration.mockImplementationOnce(async (_items, options) => {
      options?.onIssue?.({
        index: 1,
        input: 'https://signed.example/hero.png',
        code: 'OUTBOUND_IMAGE_FETCH_EXCEPTION',
        stage: 'fetch',
        message: 'fetch failed',
      })
      return { referenceImages: [], referenceImagesMap: [] }
    })

    await expect(handlePanelImageTask(buildJob({ candidateCount: 1 })))
      .rejects
      .toThrow('PANEL_CHARACTER_REFERENCE_NORMALIZE_FAILED:Hero:default')
    expect(utilsMock.resolveImageSourceFromGeneration).not.toHaveBeenCalled()
  })
})
