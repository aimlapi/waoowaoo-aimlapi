import { type Job } from 'bullmq'
import { prisma } from '@/lib/prisma'
import { resolveProjectVisualStylePreset } from '@/lib/style-preset'
import { createScopedLogger } from '@/lib/logging/core'
import { type TaskJobData } from '@/lib/task/types'
import { reportTaskProgress } from '../shared'
import {
  assertTaskActive,
  getProjectModels,
  resolveImageSourceFromGeneration,
  toSignedUrlIfCos,
  uploadImageSourceToCos,
} from '../utils'
import {
  AnyObj,
  clampCount,
  collectPanelReferenceImageItemsWithDiagnostics,
  normalizeReferenceImageItemsForGeneration,
  type ReferenceImageItem,
  pickFirstString,
  resolveNovelData,
} from './image-task-handler-shared'
import { buildAiPrompt as buildPrompt, AI_PROMPT_IDS as PROMPT_IDS } from '@/lib/ai-prompts'
import type { OutboundImageNormalizationIssue } from '@/lib/media/outbound-image'
import {
  appendStyleBiblePromptBlock,
  resolveEditScriptStyleBibleForStoryboardTask,
} from '@/lib/edit-script/style-bible-prompt'
import {
  appendSelectedVisualReferenceStylePromptBlock,
  renderSelectedVisualReferenceStylePromptBlock,
  resolveSelectedVisualReferenceStyle,
} from '@/lib/visual-reference-cases/selected-style'
import {
  buildPanelCompactReferenceContext,
  buildPanelPromptContext,
  buildPanelVisualDirectorPrompt,
} from './panel-image-prompt-context'

const EMPTY_PANEL_REFERENCE_COLLECTION = {
  items: [],
  diagnostics: [],
  issues: [],
  expectedCharacterReferenceCount: 0,
} satisfies Awaited<ReturnType<typeof collectPanelReferenceImageItemsWithDiagnostics>>

function buildPanelPrompt(params: {
  locale: TaskJobData['locale']
  aspectRatio: string
  styleText: string
  visualDirectorPrompt: string
  compactReferenceContext: string
}) {
  return buildPrompt({
    promptId: PROMPT_IDS.PANEL_IMAGE_GENERATE,
    locale: params.locale,
    variables: {
      visual_director_prompt: params.visualDirectorPrompt,
      compact_reference_context: params.compactReferenceContext,
      aspect_ratio: params.aspectRatio,
      style: params.styleText,
    },
  })
}

export async function handlePanelImageTask(job: Job<TaskJobData>) {
  const payload = (job.data.payload || {}) as AnyObj
  const panelId = pickFirstString(payload.panelId, job.data.targetId)
  if (!panelId) throw new Error('panelId missing')

  const panel = await prisma.projectPanel.findUnique({
    where: { id: panelId },
  })

  if (!panel) throw new Error('Panel not found')

  const projectData = await resolveNovelData(job.data.projectId, job.data.userId)
  const modelConfig = await getProjectModels(job.data.projectId, job.data.userId)
  const modelKey = modelConfig.storyboardModel
  if (!modelKey) throw new Error('Storyboard model not configured')

  const candidateCount = clampCount(payload.candidateCount ?? payload.count, 1, 4, 1)
  const referenceMode = payload.referenceMode === 'storyboard' ? 'storyboard' : 'asset'
  const refCollection = referenceMode === 'storyboard'
    ? EMPTY_PANEL_REFERENCE_COLLECTION
    : await collectPanelReferenceImageItemsWithDiagnostics(projectData, panel, { strict: true })
  const selectedVisualReferenceStyle = await resolveSelectedVisualReferenceStyle({
    projectId: job.data.projectId,
    episodeId: job.data.episodeId,
  })
  const referenceImageItems: ReferenceImageItem[] = []
  if (selectedVisualReferenceStyle?.imageUrl) {
    referenceImageItems.push({
      url: selectedVisualReferenceStyle.imageUrl,
      role: 'style_reference',
      name: selectedVisualReferenceStyle.title,
    })
  }
  referenceImageItems.push(...refCollection.items)
  if (Array.isArray(payload.referencePanelImageUrls)) {
    for (const [index, url] of payload.referencePanelImageUrls.entries()) {
      const signed = toSignedUrlIfCos(typeof url === 'string' ? url : null, 3600)
      if (signed) {
        referenceImageItems.push({
          url: signed,
          role: 'source_panel',
          name: `previous storyboard panel ${index + 1}`,
        })
      }
    }
  }
  if (Array.isArray(payload.extraImageUrls)) {
    for (const [index, url] of payload.extraImageUrls.entries()) {
      if (typeof url === 'string' && url.trim()) {
        referenceImageItems.push({
          url: url.trim(),
          role: 'extra',
          name: `extra reference ${index + 1}`,
        })
      }
    }
  }
  const referenceImageNotes = Array.isArray(payload.referenceImageNotes)
    ? payload.referenceImageNotes
      .map((item) => (typeof item === 'string' ? item.trim() : ''))
      .filter(Boolean)
      .slice(0, 16)
    : []
  const normalizationIssues: OutboundImageNormalizationIssue[] = []
  const { referenceImages, referenceImagesMap } = await normalizeReferenceImageItemsForGeneration(referenceImageItems, {
    locale: job.data.locale,
    onIssue: (issue) => {
      normalizationIssues.push(issue)
    },
    context: { taskType: String(job.data.type), scope: 'panel-image.refs' },
  })
  const failedCharacterReferenceIssues = refCollection.diagnostics.filter((diagnostic) =>
    diagnostic.kind === 'character'
    && typeof diagnostic.inputIndex === 'number'
    && normalizationIssues.some((issue) => issue.index === diagnostic.inputIndex),
  )
  if (failedCharacterReferenceIssues.length > 0) {
    throw new Error(`PANEL_CHARACTER_REFERENCE_NORMALIZE_FAILED:${failedCharacterReferenceIssues.map((issue) => `${issue.name || issue.characterId}:${issue.appearance || issue.appearanceId}`).join('; ')}`)
  }

  const logger = createScopedLogger({
    module: 'worker.panel-image',
    action: 'panel_image_generate',
    requestId: job.data.trace?.requestId || undefined,
    taskId: job.data.taskId,
    projectId: job.data.projectId,
    userId: job.data.userId,
  })
  logger.info({
    message: 'panel image generation started',
    details: {
      panelId,
      modelKey,
      candidateCount,
      referenceImagesRawCount: referenceImageItems.length,
      referenceImagesNormalizedCount: referenceImages.length,
      referenceImageNotes,
      expectedCharacterReferenceCount: refCollection.expectedCharacterReferenceCount,
      referenceMode,
      referenceImageDiagnostics: refCollection.diagnostics,
      referenceImageNormalizationIssues: normalizationIssues,
      rawUrls: referenceImageItems.map((item) => item.url.substring(0, 100)),
      normalizedUrls: referenceImages.map((u) => u.substring(0, 100)),
      referenceImagesMap,
      panelCharacters: panel.characters,
      panelLocation: panel.location,
      artStyle: modelConfig.artStyle,
    },
  })

  const projectArtStyle = selectedVisualReferenceStyle
    ? null
    : await resolveProjectVisualStylePreset({
      projectId: job.data.projectId,
      userId: job.data.userId,
      locale: job.data.locale,
    })
  const artStyle = selectedVisualReferenceStyle
    ? renderSelectedVisualReferenceStylePromptBlock({
      style: selectedVisualReferenceStyle,
      locale: job.data.locale,
    })
    : projectArtStyle?.prompt ?? ''
  if (!projectData.videoRatio) throw new Error('Project videoRatio not configured')
  const aspectRatio = projectData.videoRatio
  const storyboardPanels = await prisma.projectPanel.findMany({
    where: { storyboardId: panel.storyboardId },
    orderBy: { panelIndex: 'asc' },
    select: {
      id: true,
      panelIndex: true,
      panelNumber: true,
      shotType: true,
      cameraMove: true,
      description: true,
      imagePrompt: true,
      videoPrompt: true,
      location: true,
      characters: true,
      props: true,
      srtSegment: true,
    },
  })
  const promptContext = buildPanelPromptContext({
    panel: {
      id: panel.id,
      storyboardId: panel.storyboardId,
      panelIndex: panel.panelIndex,
      panelNumber: panel.panelNumber,
      shotType: panel.shotType,
      cameraMove: panel.cameraMove,
      description: panel.description,
      imagePrompt: panel.imagePrompt,
      videoPrompt: panel.videoPrompt,
      location: panel.location,
      characters: panel.characters,
      props: panel.props,
      srtSegment: panel.srtSegment,
      photographyRules: panel.photographyRules,
      actingNotes: panel.actingNotes,
    },
    projectData,
    referenceImageNotes,
    referenceImagesMap,
    storyboardPanels,
  })
  const visualDirectorPrompt = buildPanelVisualDirectorPrompt({
    promptContext,
    aspectRatio,
    styleText: artStyle || '与参考图风格一致',
    sourceText: panel.srtSegment || panel.description || '',
  })
  const compactReferenceContext = buildPanelCompactReferenceContext(promptContext)
  const promptBase = buildPanelPrompt({
    locale: job.data.locale,
    aspectRatio,
    styleText: artStyle || '与参考图风格一致',
    visualDirectorPrompt,
    compactReferenceContext,
  })
  const styleBible = await resolveEditScriptStyleBibleForStoryboardTask({
    projectId: job.data.projectId,
    episodeId: job.data.episodeId,
    storyboardId: panel.storyboardId,
  })
  const promptWithStyleBible = appendStyleBiblePromptBlock({
    prompt: promptBase,
    styleBible,
    usage: 'storyboardImage',
    locale: job.data.locale,
  })
  const prompt = appendSelectedVisualReferenceStylePromptBlock({
    prompt: promptWithStyleBible,
    style: selectedVisualReferenceStyle,
    locale: job.data.locale,
  })
  logger.info({
    message: 'panel image prompt resolved',
    details: {
      promptLength: prompt.length,
    },
  })

  const candidates: string[] = []

  for (let i = 0; i < candidateCount; i++) {
    await reportTaskProgress(job, 18 + Math.floor((i / Math.max(candidateCount, 1)) * 58), {
      stage: 'generate_panel_candidate',
      candidateIndex: i,
    })

    const source = await resolveImageSourceFromGeneration(job, {
      userId: job.data.userId,
      modelId: modelKey,
      prompt,
      options: {
        referenceImages,
        aspectRatio,
      },
      // 单个任务内会串行生成多候选，若允许按 task.externalId 续接会复用上一候选外部任务结果。
      allowTaskExternalIdResume: candidateCount === 1,
      pollProgress: { start: 30, end: 90 },
    })

    const cosKey = await uploadImageSourceToCos(source, 'panel-candidate', `${panel.id}-${i}`)
    candidates.push(cosKey)
  }

  const isFirstGeneration = !panel.imageUrl

  await assertTaskActive(job, 'persist_panel_image')
  if (isFirstGeneration) {
    await prisma.projectPanel.update({
      where: { id: panel.id },
      data: {
        imageUrl: candidates[0] || null,
        candidateImages: candidateCount > 1 ? JSON.stringify(candidates) : null,
      },
    })
  } else {
    await prisma.projectPanel.update({
      where: { id: panel.id },
      data: {
        previousImageUrl: panel.imageUrl,
        candidateImages: JSON.stringify(candidates),
      },
    })
  }

  return {
    panelId: panel.id,
    candidateCount: candidates.length,
    imageUrl: isFirstGeneration ? candidates[0] || null : null,
  }
}
