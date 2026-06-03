import type { Job } from 'bullmq'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { TASK_TYPE, type TaskJobData } from '@/lib/task/types'
import { buildZenStyleBibleFixture } from '../../fixtures/edit-script-style-bible'

const prismaMock = vi.hoisted(() => ({
  project: {
    findUnique: vi.fn(),
  },
  projectPanel: {
    findUnique: vi.fn(),
    findMany: vi.fn(),
    update: vi.fn(async () => ({})),
  },
  projectStoryboardBlockingArtifact: {
    findMany: vi.fn(),
  },
  projectEditScript: {
    findFirst: vi.fn(),
  },
  projectEditScreenplay: {
    findFirst: vi.fn(),
  },
}))

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
      { url: 'https://signed.example/location.png', role: 'scene_anchor', name: 'Old Town' },
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
        const defaults = ['normalized-sketch', 'normalized-hero', 'normalized-scene-anchor']
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
  buildPrompt: vi.fn(() => 'panel-image-prompt'),
}))

vi.mock('@/lib/prisma', () => ({ prisma: prismaMock }))
vi.mock('@/lib/workers/utils', () => utilsMock)
vi.mock('@/lib/workers/shared', () => ({ reportTaskProgress: vi.fn(async () => undefined) }))
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
  AI_PROMPT_IDS: { PANEL_IMAGE_GENERATE: 'panel-image-generate' },
  buildAiPrompt: promptMock.buildPrompt,
}))

import { handlePanelImageTask } from '@/lib/workers/handlers/panel-image-task-handler'

function buildJob(payload: Record<string, unknown>, targetId = 'panel-1'): Job<TaskJobData> {
  return {
    data: {
      taskId: 'task-panel-image-1',
      type: TASK_TYPE.IMAGE_PANEL,
      locale: 'zh',
      projectId: 'project-1',
      episodeId: 'episode-1',
      targetType: 'ProjectPanel',
      targetId,
      payload,
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
      panelNumber: 1,
      shotType: 'close-up',
      cameraMove: 'static',
      description: 'hero close-up',
      imagePrompt: 'panel anchor prompt',
      videoPrompt: 'dramatic',
      location: 'Old Town',
      characters: JSON.stringify([{ name: 'Hero', appearance: 'default', slot: '街道左侧靠墙的留白位置' }]),
      props: 'street lamp',
      srtSegment: '台词片段',
      photographyRules: null,
      actingNotes: null,
      sketchImageUrl: null,
      imageUrl: null,
    })
    prismaMock.projectPanel.findMany.mockResolvedValue([
      {
        id: 'panel-1',
        panelIndex: 0,
        panelNumber: 1,
        shotType: 'close-up',
        cameraMove: 'static',
        description: 'hero close-up',
        imagePrompt: 'panel anchor prompt',
        videoPrompt: 'dramatic',
        location: 'Old Town',
        characters: JSON.stringify([{ name: 'Hero', appearance: 'default', slot: '街道左侧靠墙的留白位置' }]),
        props: 'street lamp',
        srtSegment: '台词片段',
      },
    ])
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
        prompt: 'panel-image-prompt',
        allowTaskExternalIdResume: false,
        options: expect.objectContaining({
          referenceImages: ['normalized-sketch', 'normalized-hero', 'normalized-scene-anchor'],
          aspectRatio: '16:9',
        }),
      }),
    )
    expect(sharedMock.normalizeReferenceImageItemsForGeneration).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({ role: 'sketch', name: 'storyboard sketch' }),
        expect.objectContaining({ role: 'character', name: 'Hero' }),
        expect.objectContaining({ role: 'scene_anchor', name: 'Old Town' }),
      ]),
      expect.objectContaining({ locale: 'zh' }),
    )
    expect(promptMock.buildPrompt).toHaveBeenCalledWith(expect.objectContaining({
      variables: expect.objectContaining({
        visual_director_prompt: expect.stringContaining('导演摄影指令：panel anchor prompt'),
        compact_reference_context: expect.stringContaining('"slot": "街道左侧靠墙的留白位置"'),
      }),
    }))
    expect(promptMock.buildPrompt).toHaveBeenCalledWith(expect.objectContaining({
      variables: expect.objectContaining({
        compact_reference_context: expect.not.stringContaining('"available_slots"'),
      }),
    }))
    const promptCalls = promptMock.buildPrompt.mock.calls as unknown as Array<[unknown]>
    const promptCall = promptCalls[0]?.[0] as {
      variables?: {
        visual_director_prompt?: string
        compact_reference_context?: string
      }
    } | undefined
    expect(promptCall?.variables?.visual_director_prompt).toContain('镜头定格：hero close-up')
    expect(promptCall?.variables?.visual_director_prompt).toContain('动态意图转为单帧定格：dramatic')
    expect(promptCall?.variables?.compact_reference_context).toContain('"scene_continuity_state"')
    const contextJson = promptCall?.variables?.compact_reference_context || '{}'
    const context = JSON.parse(contextJson) as {
      reference_and_continuity?: {
        reference_images?: Array<{ image_no: string; role: string; name: string }>
        scene_continuity_state?: {
          present_characters?: Array<{ name: string; visibility: string }>
          scene_props?: string
        }
      }
    }
    expect(context.reference_and_continuity?.reference_images).toEqual([
      { image_no: '图 1', role: 'sketch', name: '分镜草图' },
      { image_no: '图 2', role: 'character', name: 'Hero', appearance: 'default', slot: '街道左侧靠墙的留白位置' },
      { image_no: '图 3', role: 'scene_anchor', name: 'Old Town' },
    ])
    expect(context.reference_and_continuity?.scene_continuity_state?.present_characters).toEqual([
      expect.objectContaining({ name: 'Hero', visibility: 'featured' }),
    ])
    expect(context.reference_and_continuity?.scene_continuity_state?.scene_props).toBe('street lamp')
    expect(prismaMock.projectPanel.update).toHaveBeenCalledWith({
      where: { id: 'panel-1' },
      data: {
        imageUrl: 'cos/panel-candidate-1.png',
        candidateImages: JSON.stringify(['cos/panel-candidate-1.png', 'cos/panel-candidate-2.png']),
      },
    })
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
        prompt: expect.stringContaining('镜头与景深：35mm镜头，中浅景深，自然透视。'),
      }),
    )
    expect(utilsMock.resolveImageSourceFromGeneration).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        prompt: expect.not.stringContaining('声音正向风格：'),
      }),
    )
  })

  it('adds same-scene non-featured characters to scene continuity state', async () => {
    prismaMock.projectPanel.findUnique.mockResolvedValueOnce({
      id: 'panel-2',
      storyboardId: 'storyboard-1',
      panelIndex: 1,
      panelNumber: 2,
      shotType: 'medium',
      cameraMove: 'pan',
      description: 'Zhou profile by the rainy window',
      imagePrompt: 'focus on Zhou, keep Lin across the table',
      videoPrompt: 'pan from window to Zhou',
      location: 'Old Town',
      characters: JSON.stringify([{ name: 'Zhou', appearance: 'default', slot: '圆桌右侧座位' }]),
      props: 'phone, cups, table lamp',
      srtSegment: '周岚看向窗外',
      photographyRules: null,
      actingNotes: null,
      sketchImageUrl: null,
      imageUrl: null,
    })
    prismaMock.projectPanel.findMany.mockResolvedValueOnce([
      {
        id: 'panel-1',
        panelIndex: 0,
        panelNumber: 1,
        shotType: 'wide',
        cameraMove: 'static',
        description: 'Lin and Zhou sit across one round table',
        imagePrompt: null,
        videoPrompt: null,
        location: 'Old Town',
        characters: JSON.stringify([
          { name: 'Lin', appearance: 'default', slot: '圆桌左侧座位' },
          { name: 'Zhou', appearance: 'default', slot: '圆桌右侧座位' },
        ]),
        props: 'phone, cups, table lamp',
        srtSegment: null,
      },
      {
        id: 'panel-2',
        panelIndex: 1,
        panelNumber: 2,
        shotType: 'medium',
        cameraMove: 'pan',
        description: 'Zhou profile by the rainy window',
        imagePrompt: 'focus on Zhou, keep Lin across the table',
        videoPrompt: 'pan from window to Zhou',
        location: 'Old Town',
        characters: JSON.stringify([{ name: 'Zhou', appearance: 'default', slot: '圆桌右侧座位' }]),
        props: 'phone, cups, table lamp',
        srtSegment: '周岚看向窗外',
      },
      {
        id: 'panel-3',
        panelIndex: 2,
        panelNumber: 3,
        shotType: 'empty_shot',
        cameraMove: 'static',
        description: 'doorway and plant, table still in the distance',
        imagePrompt: null,
        videoPrompt: null,
        location: 'Old Town',
        characters: '[]',
        props: 'doorway, plant, round table',
        srtSegment: null,
      },
    ])

    await handlePanelImageTask(buildJob({ candidateCount: 1 }, 'panel-2'))

    const promptCalls = promptMock.buildPrompt.mock.calls as unknown as Array<[{
      variables?: { compact_reference_context?: string }
    }]>
    const contextJson = promptCalls[0]?.[0].variables?.compact_reference_context || '{}'
    const context = JSON.parse(contextJson) as {
      reference_and_continuity?: {
        scene_continuity_state?: {
          featured_characters?: Array<{ name: string }>
          present_characters?: Array<{ name: string; visibility: string; slot: string | null }>
          non_featured_presence_policy?: { required?: boolean; offscreen_allowed?: boolean }
          previous_same_scene_panel?: { panel_number?: number } | null
          next_same_scene_panel?: { panel_number?: number } | null
        }
      }
    }

    expect(context.reference_and_continuity?.scene_continuity_state?.featured_characters).toEqual([
      expect.objectContaining({ name: 'Zhou' }),
    ])
    expect(context.reference_and_continuity?.scene_continuity_state?.present_characters).toEqual(expect.arrayContaining([
      expect.objectContaining({ name: 'Zhou', visibility: 'featured', slot: '圆桌右侧座位' }),
      expect.objectContaining({ name: 'Lin', visibility: 'background_or_partial_presence_required', slot: '圆桌左侧座位' }),
    ]))
    expect(context.reference_and_continuity?.scene_continuity_state?.non_featured_presence_policy).toEqual(expect.objectContaining({
      required: true,
      offscreen_allowed: false,
    }))
    expect(context.reference_and_continuity?.scene_continuity_state?.previous_same_scene_panel?.panel_number).toBe(1)
    expect(context.reference_and_continuity?.scene_continuity_state?.next_same_scene_panel?.panel_number).toBe(3)
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
        expect.objectContaining({ url: 'https://signed.example/location.png', role: 'scene_anchor' }),
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
            'normalized-scene-anchor',
            'normalized:images/previous-panel.png',
            'normalized:https://example.com/manual-ref.png',
          ],
        }),
      }),
    )
    expect(promptMock.buildPrompt).toHaveBeenCalledWith(expect.objectContaining({
      variables: expect.objectContaining({
        compact_reference_context: expect.stringContaining('"additional_reference_images"'),
      }),
    }))
    expect(promptMock.buildPrompt).toHaveBeenCalledWith(expect.objectContaining({
      variables: expect.objectContaining({
        compact_reference_context: expect.stringContaining('Use for continuity and staging'),
      }),
    }))
  })

  it('uses spatial profile and shotBlocking as text context', async () => {
    prismaMock.projectPanel.findUnique.mockResolvedValueOnce({
      id: 'panel-1',
      storyboardId: 'storyboard-1',
      panelIndex: 0,
      panelNumber: 1,
      shotType: 'close-up',
      cameraMove: 'static',
      description: 'hero close-up',
      imagePrompt: 'panel anchor prompt',
      videoPrompt: 'dramatic',
      location: 'Old Town',
      characters: JSON.stringify([{ name: 'Hero', appearance: 'default', slot: '街道左侧靠墙的留白位置' }]),
      props: 'street lamp',
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
    await handlePanelImageTask(buildJob({ candidateCount: 1 }))

    expect(prismaMock.projectStoryboardBlockingArtifact.findMany).not.toHaveBeenCalled()
    const promptCalls = promptMock.buildPrompt.mock.calls as unknown as Array<[{
      variables?: { compact_reference_context?: string }
    }]>
    const contextJson = promptCalls[0]?.[0].variables?.compact_reference_context || '{}'
    const context = JSON.parse(contextJson) as {
      panel_constraints?: { shot_blocking?: { cameraPlacement?: string } }
      reference_and_continuity?: {
        location_reference?: { spatial_profile?: { anchors?: Array<{ label: string }> } }
        reference_images?: Array<{ image_no: string; role: string; name: string }>
        scene_continuity_state?: { scene_anchor_name?: string | null }
      }
    }
    expect(context.panel_constraints?.shot_blocking?.cameraPlacement).toBe('从街道中线偏右拍向左侧墙面')
    expect(context.reference_and_continuity?.location_reference?.spatial_profile?.anchors?.[0]?.label).toBe('左侧墙面')
    expect(context.reference_and_continuity?.reference_images?.map((item) => item.role)).toEqual(['sketch', 'character', 'scene_anchor'])
    expect(context.reference_and_continuity?.scene_continuity_state?.scene_anchor_name).toBe('Old Town')
    expect(utilsMock.resolveImageSourceFromGeneration).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        options: expect.objectContaining({
          referenceImages: ['normalized-sketch', 'normalized-hero', 'normalized-scene-anchor'],
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

  it('regeneration branch -> keeps old image in previousImageUrl and stores candidates only', async () => {
    utilsMock.resolveImageSourceFromGeneration.mockReset()
    utilsMock.uploadImageSourceToCos.mockReset()

    prismaMock.projectPanel.findUnique.mockResolvedValueOnce({
      id: 'panel-1',
      storyboardId: 'storyboard-1',
      panelIndex: 0,
      panelNumber: 1,
      shotType: 'close-up',
      cameraMove: 'static',
      description: 'hero close-up',
      imagePrompt: null,
      videoPrompt: 'dramatic',
      location: 'Old Town',
      characters: '[]',
      props: null,
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
