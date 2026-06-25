import { beforeEach, describe, expect, it, vi } from 'vitest'
import sharp from 'sharp'

const outboundMock = vi.hoisted(() => ({
  normalizeOptionalReferenceImagesForGeneration: vi.fn(async (input: string[]) => [`normalized:${input[0]}`]),
}))

vi.mock('@/lib/media/outbound-image', () => outboundMock)

const storageMock = vi.hoisted(() => ({
  generateUniqueKey: vi.fn((prefix: string, ext: string) => `images/${prefix}-test.${ext}`),
  getObjectBuffer: vi.fn(),
  getSignedUrl: vi.fn((key: string) => `/signed/${key}`),
  uploadObject: vi.fn(async (_body: Buffer, key: string) => key),
}))

vi.mock('@/lib/storage', () => storageMock)

import {
  collectPanelReferenceImageItemsWithDiagnostics,
  normalizeReferenceImageItemsForGeneration,
  type NovelProjectData,
  type ReferenceImageItem,
} from '@/lib/workers/handlers/image-task-handler-shared'
import { buildPanelPromptContext } from '@/lib/workers/handlers/panel-image-prompt'

describe('reference image item normalization', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    outboundMock.normalizeOptionalReferenceImagesForGeneration.mockImplementation(async (input: string[]) => [`normalized:${input[0]}`])
    storageMock.getObjectBuffer.mockImplementation(async () =>
      await sharp({
        create: {
          width: 100,
          height: 100,
          channels: 3,
          background: { r: 255, g: 20, b: 147 },
        },
      })
        .jpeg()
        .toBuffer(),
    )
  })

  it('returns normalized images and continuous image-number mappings', async () => {
    const items: ReferenceImageItem[] = [
      { url: 'https://example.com/sketch.png', role: 'sketch', name: 'storyboard sketch' },
      { url: 'https://example.com/hero.png', role: 'character', name: 'Hero', appearance: 'default' },
      { url: 'https://example.com/location.png', role: 'location', name: 'Old Town' },
    ]

    const result = await normalizeReferenceImageItemsForGeneration(items, { locale: 'zh' })

    expect(result.referenceImages).toEqual([
      'normalized:https://example.com/sketch.png',
      'normalized:https://example.com/hero.png',
      'normalized:https://example.com/location.png',
    ])
    expect(result.referenceImagesMap).toEqual([
      { image_no: '图 1', role: 'sketch', name: '分镜草图' },
      { image_no: '图 2', role: 'character', name: 'Hero', appearance: 'default' },
      { image_no: '图 3', role: 'location', name: 'Old Town' },
    ])
  })

  it('skips failed items and keeps later image numbers aligned with sent images', async () => {
    outboundMock.normalizeOptionalReferenceImagesForGeneration.mockImplementation(async (input: string[]) =>
      input[0].includes('bad') ? [] : [`normalized:${input[0]}`],
    )
    const items: ReferenceImageItem[] = [
      { url: 'https://example.com/hero.png', role: 'character', name: 'Hero' },
      { url: 'https://example.com/bad.png', role: 'character', name: 'Broken' },
      { url: 'https://example.com/location.png', role: 'location', name: 'Old Town' },
    ]

    const result = await normalizeReferenceImageItemsForGeneration(items, { locale: 'zh' })

    expect(result.referenceImages).toEqual([
      'normalized:https://example.com/hero.png',
      'normalized:https://example.com/location.png',
    ])
    expect(result.referenceImagesMap).toEqual([
      { image_no: '图 1', role: 'character', name: 'Hero' },
      { image_no: '图 2', role: 'location', name: 'Old Town' },
    ])
  })

  it('deduplicates repeated urls so mappings match the actual image array', async () => {
    const items: ReferenceImageItem[] = [
      { url: 'https://example.com/hero.png', role: 'character', name: 'Hero' },
      { url: ' https://example.com/hero.png ', role: 'character', name: 'Hero Duplicate' },
      { url: 'https://example.com/location.png', role: 'location', name: 'Old Town' },
    ]

    const result = await normalizeReferenceImageItemsForGeneration(items, { locale: 'en' })

    expect(outboundMock.normalizeOptionalReferenceImagesForGeneration).toHaveBeenCalledTimes(2)
    expect(result.referenceImages).toEqual([
      'normalized:https://example.com/hero.png',
      'normalized:https://example.com/location.png',
    ])
    expect(result.referenceImagesMap).toEqual([
      { image_no: 'Image 1', role: 'character', name: 'Hero' },
      { image_no: 'Image 2', role: 'location', name: 'Old Town' },
    ])
  })

  it('includes selected prop asset references from explicit panel props', async () => {
    const projectData: NovelProjectData = {
      props: [{
        id: 'prop-cup',
        name: '催情药剂高脚杯',
        assetKind: 'prop',
        selectedImageId: 'prop-cup-image',
        images: [{
          id: 'prop-cup-image',
          imageUrl: 'images/prop-cup.png',
          description: '白底居中的高脚杯道具',
          isSelected: true,
        }],
      }],
    }

    const result = await collectPanelReferenceImageItemsWithDiagnostics(projectData, {
      props: JSON.stringify(['催情药剂高脚杯']),
      panelIndex: 0,
    }, { strict: true })

    expect(result.items).toEqual([
      { url: '/signed/images/prop-reference-crop-prop-cup-test.jpg', role: 'prop', name: '催情药剂高脚杯' },
    ])
    expect(storageMock.getObjectBuffer).toHaveBeenCalledWith('images/prop-cup.png')
    expect(storageMock.uploadObject).toHaveBeenCalledWith(
      expect.any(Buffer),
      'images/prop-reference-crop-prop-cup-test.jpg',
      1,
      'image/jpeg',
    )
    expect(result.diagnostics).toEqual([
      expect.objectContaining({
        kind: 'prop',
        name: '催情药剂高脚杯',
        propId: 'prop-cup',
        sourceUrl: 'images/prop-cup.png',
        issue: null,
      }),
    ])
  })

  it('includes selected prop asset references from edit asset shot indexes when panel props are empty', async () => {
    const projectData: NovelProjectData = {
      props: [{
        id: 'prop-cup',
        name: '催情药剂高脚杯',
        assetKind: 'prop',
        selectedImageId: 'prop-cup-image',
        images: [{
          id: 'prop-cup-image',
          imageUrl: 'images/prop-cup.png',
          description: '白底居中的高脚杯道具',
          isSelected: true,
        }],
      }, {
        id: 'prop-badge',
        name: '纯金飞鹰徽章',
        assetKind: 'prop',
        selectedImageId: 'prop-badge-image',
        images: [{
          id: 'prop-badge-image',
          imageUrl: 'images/prop-badge.png',
          description: '白底居中的徽章道具',
          isSelected: true,
        }],
      }],
      editAssetRequirements: [{
        id: 'req-cup',
        kind: 'prop',
        name: '催情药剂高脚杯',
        description: '白底居中的高脚杯道具',
        shotIndexes: [1, 7],
        status: 'completed',
        targetId: 'prop-cup',
      }, {
        id: 'req-badge',
        kind: 'prop',
        name: '纯金飞鹰徽章',
        description: '白底居中的徽章道具',
        shotIndexes: [1],
        status: 'completed',
        targetId: 'prop-badge',
      }],
    }

    const result = await collectPanelReferenceImageItemsWithDiagnostics(projectData, {
      props: null,
      description: '高脚杯中盛着耀眼粉红的荧色药液。',
      panelIndex: 0,
      panelNumber: null,
    }, { strict: true })

    expect(result.items).toEqual([
      { url: '/signed/images/prop-reference-crop-prop-cup-test.jpg', role: 'prop', name: '催情药剂高脚杯' },
    ])
  })

  it('fails explicitly when a required prop has no selected reference image', async () => {
    const projectData: NovelProjectData = {
      props: [{
        id: 'prop-cup',
        name: '催情药剂高脚杯',
        assetKind: 'prop',
        selectedImageId: null,
        images: [{
          id: 'prop-cup-image',
          imageUrl: null,
          description: '白底居中的高脚杯道具',
          isSelected: true,
        }],
      }],
      editAssetRequirements: [{
        id: 'req-cup',
        kind: 'prop',
        name: '催情药剂高脚杯',
        description: '白底居中的高脚杯道具',
        shotIndexes: [1],
        status: 'completed',
        targetId: 'prop-cup',
      }],
    }

    await expect(collectPanelReferenceImageItemsWithDiagnostics(projectData, {
      description: '高脚杯中盛着耀眼粉红的荧色药液。',
      panelIndex: 0,
    }, { strict: true })).rejects.toThrow('PANEL_REFERENCE_INVALID:prop:催情药剂高脚杯:reference_image_missing')
  })

  it('writes resolved prop identity into panel prompt context', () => {
    const projectData: NovelProjectData = {
      props: [{
        id: 'prop-cup',
        name: '催情药剂高脚杯',
        assetKind: 'prop',
        selectedImageId: 'prop-cup-image',
        images: [{
          id: 'prop-cup-image',
          imageUrl: 'https://example.com/prop-cup.png',
          description: '白底居中的高脚杯道具',
          isSelected: true,
        }],
      }],
      editAssetRequirements: [{
        id: 'req-cup',
        kind: 'prop',
        name: '催情药剂高脚杯',
        description: '白底居中的高脚杯道具',
        shotIndexes: [1],
        status: 'completed',
        targetId: 'prop-cup',
      }],
    }

    const context = buildPanelPromptContext({
      panel: {
        id: 'panel-1',
        panelIndex: 0,
        panelNumber: null,
        shotType: 'close-up',
        cameraMove: 'static',
        description: '粉红药液高脚杯',
        imagePrompt: 'wine glass with pink liquid',
        videoPrompt: null,
        location: null,
        characters: null,
        props: null,
        srtSegment: '高脚杯中盛着耀眼粉红的荧色药液。',
        photographyRules: null,
        actingNotes: null,
      },
      projectData,
      referenceImagesMap: [{ image_no: '图 1', role: 'prop', name: '催情药剂高脚杯' }],
    })

    expect(context.panel.props).toEqual([
      expect.objectContaining({
        propId: 'prop-cup',
        name: '催情药剂高脚杯',
        description: '白底居中的高脚杯道具',
        source: 'requirement',
        reference_instruction: expect.stringContaining('cropped single-object identity plate'),
      }),
    ])
    expect(context.context.prop_references).toEqual(context.panel.props)
    expect(context.context.reference_images).toEqual([
      { image_no: '图 1', role: 'prop', name: '催情药剂高脚杯' },
    ])
  })
})
